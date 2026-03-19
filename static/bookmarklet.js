(async function() {
    let username = "";
    try {
        const homeRes = await fetch(window.location.origin + "/maimai-mobile/home/");
        const homeText = await homeRes.text();
        const homeDoc = new DOMParser().parseFromString(homeText, "text/html");
        const nameEl = homeDoc.querySelector('.name_block');
        if (nameEl) username = nameEl.innerText.trim();
    } catch (e) {
        console.error("닉네임 추출 실패:", e);
    }
    
    if (!username) {
        username = prompt("닉네임을 입력해주세요:", "");
        if (!username) return;
    }
    
    alert(`반갑습니다, [ ${username} ] 님!\n데이터를 수집합니다. (약 3~5초 소요)`);
    
    const baseUrl = window.location.origin + "/maimai-mobile/record/musicGenre/search/?genre=99&diff=";
    const diffs = [0, 1, 2, 3, 4];
    const diffNames = ["BAS", "ADV", "EXP", "MAS", "Re:M"];
    let allScores = [];
    
    for (let diff of diffs) {
        try {
            const response = await fetch(baseUrl + diff);
            const htmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");
            const records = doc.querySelectorAll('div[class*="score_back"]');
            
            records.forEach(record => {
                const songNameEl = record.querySelector('.music_name_block');
                const levelEl = record.querySelector('.music_lv_block');
                
                if (songNameEl && levelEl) {
                    let songName = songNameEl.innerText.trim();
                    const level = levelEl.innerText.trim();
                    let chartType = "ST";
                    let current = record;
                    
                    for (let i = 0; i < 4; i++) {
                        if (!current.parentElement) break;
                        current = current.parentElement;
                        if (current.innerHTML.includes("music_dx.png")) {
                            chartType = "DX";
                            break;
                        }
                        if (current.innerHTML.includes("music_standard.png")) {
                            chartType = "ST";
                            break;
                        }
                    }
                    
                    const fullSongName = `${songName} [${chartType}] (${diffNames[diff]})`;
                    let score = 0;
                    const scoreEl = record.querySelector('.music_score_block');
                    
                    if (scoreEl) {
                        let rawScore = scoreEl.innerText.trim().replace(/%/g, '').replace(/,/g, '');
                        score = parseFloat(rawScore) || 0;
                    }
                    
                    allScores.push({ song_name: fullSongName, difficulty_level: level, score: score });
                }
            });
        } catch (e) {
            console.error("데이터 수집 중 오류:", e);
        }
    }
    
    if (allScores.length === 0) {
        alert("데이터를 찾지 못했습니다. 로그인 상태를 확인해주세요.");
        return;
    }
    
    try {
        const res = await fetch('https://muscari.pythonanywhere.com/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, scores: allScores })
        });
        
        if (res.ok) {
            alert("데이터가 성공적으로 랭킹 보드에 저장되었습니다!");
        } else {
            alert("저장에 실패했습니다. 서버 상태를 확인해주세요.");
        }
    } catch (e) {
        alert("서버 연결에 실패했습니다.");
    }
})();