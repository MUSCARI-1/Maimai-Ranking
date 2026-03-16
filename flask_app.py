import sqlite3
import json
import os
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(BASE_DIR, '.env')

load_dotenv(env_path)

app = Flask(__name__)
CORS(app)

app.secret_key = os.getenv('SECRET_KEY', 'fallback_secret_key')
SECRET_PASSWORD = os.getenv('ADMIN_PASSWORD', 'ZUNDA')

SUPER_ADMIN_PASSWORD = os.getenv('SUPER_ADMIN_PASSWORD', 'asdf')

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

# ==========================================
# 기존 유저용 라우트
# ==========================================
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

# ==========================================
# 어드민 전용 라우트
# ==========================================

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    error = None
    if request.method == 'POST':
        if request.form.get('password') == SUPER_ADMIN_PASSWORD:
            session['admin_logged_in'] = True
            return redirect(url_for('admin_dashboard'))
        else:
            error = "관리자 비밀번호가 틀렸습니다."
    return render_template('admin_login.html', error=error)

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin_login'))

@app.route('/admin')
def admin_dashboard():
    # 세션 확인 (보안)
    if not session.get('admin_logged_in'):
        return redirect(url_for('admin_login'))

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # 1. 닉네임 단위 삭제를 위한 유저 목록
    c.execute('SELECT DISTINCT username FROM scores ORDER BY username')
    users = [row[0] for row in c.fetchall()]

    # 2. 개별 곡 삭제를 위한 전체 기록 목록
    c.execute('''
        SELECT id, username, song_name, difficulty_level, score, updated_at 
        FROM scores 
        ORDER BY updated_at DESC
    ''')
    all_records = c.fetchall()
    conn.close()

    # 데이터를 프론트엔드로 전달하기 위해 JSON 포맷팅
    records_json = json.dumps([
        {
            'id': r[0], 
            'username': r[1], 
            'song': r[2], 
            'level': r[3], 
            'score': r[4], 
            'date': r[5]
        } for r in all_records
    ])

    return render_template('admin_dashboard.html', users=users, records_json=records_json)

@app.route('/admin/api/delete_user', methods=['POST'])
def api_delete_user():
    if not session.get('admin_logged_in'):
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    data = request.json
    username = data.get('username')
    
    if not username:
        return jsonify({"success": False, "error": "Username is required"}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM scores WHERE username = ?', (username,))
    deleted_count = c.rowcount
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": f"[{username}]님의 모든 기록({deleted_count}개)이 삭제되었습니다."})

@app.route('/admin/api/delete_record', methods=['POST'])
def api_delete_record():
    if not session.get('admin_logged_in'):
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    data = request.json
    record_id = data.get('id')
    
    if not record_id:
        return jsonify({"success": False, "error": "Record ID is required"}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM scores WHERE id = ?', (record_id,))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "해당 기록이 성공적으로 삭제되었습니다."})


if __name__ == '__main__':
    app.run()