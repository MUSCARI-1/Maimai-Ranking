// static/script.js

let currentLevelFilter = "all";
let currentChartFilter = "all";
let currentSort = { key: 'level', isAscending: false };
let myChart = null;

window.onload = function() {
    const levels = new Set(allScores.map(item => item.level));
    const select = document.getElementById("levelFilter");

    const sortedLevels = Array.from(levels).sort((a, b) => {
        const getLevelValue = (lvl) => { let val = parseFloat(lvl); if (lvl.includes('+')) val += 0.5; return val; };
        return getLevelValue(b) - getLevelValue(a);
    });

    sortedLevels.forEach(lvl => {
        const option = document.createElement("option");
        option.value = lvl;
        option.text = "Level " + lvl;
        select.appendChild(option);
    });

    renderTable();
};

function stringToColor(str, isDimmed) {
    const alpha = isDimmed ? 0.15 : 1.0;
    if (str === 'null') return `rgba(224, 224, 224, ${alpha})`;
    if (str === 'tie') return `rgba(255, 152, 0, ${alpha})`;

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsla(${hue}, 70%, 60%, ${alpha})`;
}

// 🔥 새롭게 추가된 함수: 리스트의 텍스트를 클릭했을 때 필터를 걸어주는 역할
function setListFilter(filterType) {
    if (currentChartFilter === filterType) {
        currentChartFilter = 'all'; // 같은 걸 두 번 누르면 필터 해제
    } else {
        currentChartFilter = filterType;
    }
    renderTable();
}

function renderTable() {
    let levelFilteredScores = allScores;
    if (currentLevelFilter !== "all") {
        levelFilteredScores = allScores.filter(item => item.level === currentLevelFilter);
    }

    updateSummaryAndChart(levelFilteredScores);

    // 🔥 정교해진 필터링 로직 (유저 전체, 유저 단독, 유저 공동 구분)
    let tableScores = levelFilteredScores;
    if (currentChartFilter !== "all") {
        if (currentChartFilter === 'null') {
            tableScores = tableScores.filter(item => item.user === '없음');
        } else if (currentChartFilter === 'tie') {
            tableScores = tableScores.filter(item => item.user.includes(', '));
        } else if (currentChartFilter.startsWith('user:')) {
            const u = currentChartFilter.split(':')[1];
            tableScores = tableScores.filter(item => item.user.split(', ').includes(u)); // 단독, 공동 가리지 않고 포함되면 OK
        } else if (currentChartFilter.startsWith('single:')) {
            const u = currentChartFilter.split(':')[1];
            tableScores = tableScores.filter(item => item.user === u); // 오직 나 혼자만 1등인 곡
        } else if (currentChartFilter.startsWith('tie:')) {
            const u = currentChartFilter.split(':')[1];
            // 쉼표가 있으면서(공동), 그 안에 내 이름이 포함된 곡
            tableScores = tableScores.filter(item => item.user.includes(', ') && item.user.split(', ').includes(u));
        }
    }

    const filterStatus = document.getElementById("chartFilterStatus");
    if (currentChartFilter === "all") {
        filterStatus.style.display = "none";
    } else {
        filterStatus.style.display = "inline-block";
        let text = "";
        if (currentChartFilter === 'null') text = '미플레이 곡';
        else if (currentChartFilter === 'tie') text = '전체 공동 1등 곡';
        else if (currentChartFilter.startsWith('user:')) text = currentChartFilter.split(':')[1] + ' 전체 1등 곡';
        else if (currentChartFilter.startsWith('single:')) text = currentChartFilter.split(':')[1] + ' 단독 1등 곡';
        else if (currentChartFilter.startsWith('tie:')) text = currentChartFilter.split(':')[1] + ' 공동 1등 곡';

        filterStatus.innerHTML = `✖ [${text}] 모아보기 해제`;
    }

    tableScores.sort((a, b) => {
        let valA = a[currentSort.key];
        let valB = b[currentSort.key];

        if (currentSort.key === 'score') {
            valA = parseFloat(valA);
            valB = parseFloat(valB);
        } else if (currentSort.key === 'level') {
            const getLevelValue = (lvl) => { let v = parseFloat(lvl); if(lvl.includes('+')) v+=0.5; return v; };
            valA = getLevelValue(valA);
            valB = getLevelValue(valB);
        }

        if (valA < valB) return currentSort.isAscending ? -1 : 1;
        if (valA > valB) return currentSort.isAscending ? 1 : -1;
        return 0;
    });

    const tbody = document.getElementById("scoreTableBody");
    tbody.innerHTML = tableScores.map(row => {
        const userStyle = row.user === '없음' ? 'color: #999;' : 'color: black;';
        const scoreDisplay = row.score === 0 ? '-' : `${parseFloat(row.score).toFixed(4)}%`;
        const safeSong = row.song.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <tr class="clickable-row" onclick="openModal('${safeSong}', '${row.level}')">
                <td>${row.song}</td>
                <td>${row.level}</td>
                <td><strong style="${userStyle}">${row.user}</strong></td>
                <td>${scoreDisplay}</td>
            </tr>
        `;
    }).join('');
}

function updateSummaryAndChart(filteredScores) {
    const userStats = {};
    const chartData = { 'null': 0, 'tie': 0 };

    filteredScores.forEach(row => {
        if (row.user === '없음') {
            chartData['null'] += 1;
        } else if (row.user.includes(', ')) {
            chartData['tie'] += 1;
            const users = row.user.split(', ');
            users.forEach(u => {
                if (!userStats[u]) userStats[u] = { single: 0, tie: 0 };
                userStats[u].tie += 1;
            });
        } else {
            const u = row.user;
            chartData[u] = (chartData[u] || 0) + 1;
            if (!userStats[u]) userStats[u] = { single: 0, tie: 0 };
            userStats[u].single += 1;
        }
    });

    const summaryList = document.getElementById("userSummaryList");
    const sortedUsers = Object.keys(userStats).sort((a, b) => {
        const totalA = userStats[a].single + userStats[a].tie;
        const totalB = userStats[b].single + userStats[b].tie;
        return totalB - totalA;
    });

    if (sortedUsers.length === 0) {
        summaryList.innerHTML = "<li>타이틀을 가진 유저가 없습니다.</li>";
    } else {
        // 🔥 텍스트에 clickable-text 클래스와 onclick 이벤트 장착
        summaryList.innerHTML = sortedUsers.map(user => {
            const s = userStats[user];
            const total = s.single + s.tie;
            return `<li>
                <strong class="clickable-text" onclick="setListFilter('user:${user}')">${user}</strong>: 총 <strong>${total}</strong>개
                <span style="font-size:0.85em; color:#666;">
                    (<span class="clickable-text" onclick="setListFilter('single:${user}')">단독 ${s.single}개</span> /
                     <span class="clickable-text" onclick="setListFilter('tie:${user}')">공동 ${s.tie}개</span>)
                </span>
            </li>`;
        }).join('');
    }

    renderChart(chartData);
}

function renderChart(dataObj) {
    const ctx = document.getElementById('rankingChart').getContext('2d');

    const labels = Object.keys(dataObj).filter(k => k !== 'tie' && k !== 'null').sort((a, b) => dataObj[b] - dataObj[a]);
    if (dataObj['tie'] > 0) labels.push('tie');
    if (dataObj['null'] > 0) labels.push('null');

    const dataValues = labels.map(l => dataObj[l]);

    const backgroundColors = labels.map(label => {
        let filterCodeForLabel = label;
        // 차트의 조각은 단독(single) 곡들을 의미하므로, 코드를 맞춰줍니다.
        if (label !== 'tie' && label !== 'null') filterCodeForLabel = 'single:' + label;

        let isDimmed = true;
        if (currentChartFilter === 'all') isDimmed = false;
        else if (currentChartFilter === filterCodeForLabel) isDimmed = false;
        // 유저 닉네임 전체를 누르면 그 유저의 단독 그래프 조각도 하이라이트 되도록!
        else if (currentChartFilter.startsWith('user:') && label === currentChartFilter.split(':')[1]) isDimmed = false;
        // 특정 유저의 '공동' 텍스트를 누르면 공동(tie) 주황색 그래프 조각이 하이라이트 되도록!
        else if (currentChartFilter.startsWith('tie:') && label === 'tie') isDimmed = false;

        return stringToColor(label, isDimmed);
    });

    if (myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = dataValues;
        myChart.data.datasets[0].backgroundColor = backgroundColors;
        myChart.update();
    } else {
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${context.raw}곡`;
                            }
                        }
                    }
                },
                onClick: (event, elements, chart) => {
                    if (elements.length > 0) {
                        const dataIndex = elements[0].index;
                        const label = chart.data.labels[dataIndex];

                        let filterCode = label;
                        if (label !== 'tie' && label !== 'null') filterCode = 'single:' + label;

                        if (currentChartFilter === filterCode) {
                            currentChartFilter = 'all';
                        } else {
                            currentChartFilter = filterCode;
                        }
                        renderTable();
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            }
        });
    }
}

function clearChartFilter() {
    currentChartFilter = "all";
    renderTable();
}

function sortTable(key, columnIndex) {
    if (currentSort.key === key) {
        currentSort.isAscending = !currentSort.isAscending;
    }
    else {
        currentSort.key = key;
        if (key === 'score' || key === 'level') {
            currentSort.isAscending = false;
        } else {
            currentSort.isAscending = true;
        }
    }
    for(let i=0; i<4; i++) { document.getElementById(`icon-${i}`).innerText = ""; }
    document.getElementById(`icon-${columnIndex}`).innerText = currentSort.isAscending ? "▲" : "▼";
    renderTable();
}

function filterTable() {
    currentLevelFilter = document.getElementById("levelFilter").value;
    currentChartFilter = "all";
    renderTable();
}

async function openModal(song, level) {
    const modal = document.getElementById("rankingModal");
    const title = document.getElementById("modalTitle");
    const tbody = document.getElementById("modalTableBody");

    title.innerText = `${song} (Lv.${level})`;
    tbody.innerHTML = "<tr><td colspan='3' style='text-align:center;'>데이터를 불러오는 중... ⏳</td></tr>";
    modal.style.display = "flex";

    try {
        const response = await fetch(`/api/ranking?song=${encodeURIComponent(song)}&level=${encodeURIComponent(level)}`);
        const data = await response.json();

        if (data.length === 0) {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color: #999;'>플레이 기록이 없습니다.</td></tr>";
        } else {
            let html = "";
            let displayRank = 1;
            let previousScore = -1;

            data.forEach((item, index) => {
                if (item.score !== previousScore) { displayRank = index + 1; }
                previousScore = item.score;

                const rankClass = displayRank === 1 ? 'rank-1' : '';
                const rankText = displayRank === 1 ? '🥇 1' : displayRank;

                html += `
                    <tr>
                        <td class="${rankClass}">${rankText}</td>
                        <td><strong>${item.username}</strong></td>
                        <td>${parseFloat(item.score).toFixed(4)}%</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    } catch (e) {
        tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; color: red;'>데이터를 불러오는데 실패했습니다.</td></tr>";
    }
}

function closeModal(event) {
    document.getElementById("rankingModal").style.display = "none";
}