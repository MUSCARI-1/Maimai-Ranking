import sqlite3
import json
import os
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

app.secret_key = 'super_secret_maimai_key_1234'
SECRET_PASSWORD = 'beatpot'

# 클라우드 서버용 절대 경로 설정 (이 서버가 위치한 곳의 maimai.db를 정확히 짚어줌)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'maimai.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            song_name TEXT NOT NULL,
            difficulty_level TEXT NOT NULL,
            score REAL NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, song_name, difficulty_level)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS song_master (
            song_name TEXT NOT NULL,
            difficulty_level TEXT NOT NULL,
            UNIQUE(song_name, difficulty_level)
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == SECRET_PASSWORD:
            session['logged_in'] = True
            return redirect(url_for('welcome'))
        else:
            error = "비밀번호가 틀렸습니다. 다시 시도해주세요."
    return render_template('login.html', error=error)

@app.route('/welcome')
def welcome():
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    return render_template('welcome.html')

@app.route('/dashboard')
def show_dashboard():
    if not session.get('logged_in'):
        return redirect(url_for('login'))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        WITH MaxScores AS (
            SELECT song_name, difficulty_level, MAX(score) as max_score
            FROM scores
            GROUP BY song_name, difficulty_level
        ),
        TopUsers AS (
            SELECT s.song_name, s.difficulty_level, s.score, GROUP_CONCAT(s.username, ', ') as usernames
            FROM scores s
            JOIN MaxScores ms ON s.song_name = ms.song_name AND s.difficulty_level = ms.difficulty_level AND s.score = ms.max_score
            GROUP BY s.song_name, s.difficulty_level, s.score
        )
        SELECT
            m.song_name,
            m.difficulty_level,
            t.usernames,
            t.score
        FROM song_master m
        LEFT JOIN TopUsers t ON m.song_name = t.song_name AND m.difficulty_level = t.difficulty_level
    ''')
    top_scores = c.fetchall()
    conn.close()

    user_stats = {}
    formatted_scores = []

    for row in top_scores:
        song, level, users, score = row
        display_users = users if users else "없음"
        display_score = score if score else 0

        formatted_scores.append({'song': song, 'level': level, 'user': display_users, 'score': display_score})

        if users:
            user_list = users.split(', ')
            for u in user_list:
                if u not in user_stats:
                    user_stats[u] = {'total': 0, 'levels': {}}
                user_stats[u]['total'] += 1
                if level not in user_stats[u]['levels']:
                    user_stats[u]['levels'][level] = 0
                user_stats[u]['levels'][level] += 1

    top_scores_json = json.dumps(formatted_scores)
    return render_template('dashboard.html', top_scores_json=top_scores_json, user_stats=user_stats)

@app.route('/api/ranking', methods=['GET'])
def get_song_ranking():
    if not session.get('logged_in'):
        return jsonify({"error": "Unauthorized"}), 401

    song = request.args.get('song')
    level = request.args.get('level')

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT username, score
        FROM scores
        WHERE song_name = ? AND difficulty_level = ?
        ORDER BY score DESC
    ''', (song, level))
    results = c.fetchall()
    conn.close()

    ranking_data = [{'username': row[0], 'score': row[1]} for row in results]
    return jsonify(ranking_data)

@app.route('/api/save', methods=['POST'])
def save_scores():
    data = request.json
    username = data.get('username')
    scores = data.get('scores', [])

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    for item in scores:
        c.execute('''
            INSERT OR IGNORE INTO song_master (song_name, difficulty_level)
            VALUES (?, ?)
        ''', (item['song_name'], item['difficulty_level']))

        if item['score'] > 0:
            c.execute('''
                INSERT INTO scores (username, song_name, difficulty_level, score)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(username, song_name, difficulty_level)
                DO UPDATE SET
                    score = excluded.score,
                    updated_at = CURRENT_TIMESTAMP
                WHERE excluded.score > scores.score
            ''', (username, item['song_name'], item['difficulty_level'], item['score']))

    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": f"{username}님의 전체 곡 동기화 완료!"})

if __name__ == '__main__':
    app.run()