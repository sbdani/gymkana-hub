let currentTid = localStorage.getItem('gymkana_tid') || null;
let currentView = 'home';
let currentPin = "";
const ADMIN_PIN = "2412";
const COLAB_PIN = "3333";
let networkInfo = { local_ip: '127.0.0.1', port: 8000 };
let liveUpdateInterval = null;

async function fetchNetwork() {
    try {
        const res = await fetch('/network-info/');
        networkInfo = await res.json();
    } catch (e) { console.warn("No se pudo obtener IP local."); }
}

function showDiag(msg) {
    const overlay = document.getElementById('diag-overlay');
    const text = document.getElementById('diag-text');
    if (overlay && text) {
        text.value = (typeof msg === 'object') ? JSON.stringify(msg, null, 2) : msg;
        overlay.style.display = 'flex';
    } else { alert("ERROR: " + msg); }
}
function hideDiag() { document.getElementById('diag-overlay').style.display = 'none'; }

// --- SEGURIDAD ---
function pressKey(num) {
    if (currentPin.length < 4) {
        currentPin += num;
        updatePinDots();
        if (currentPin.length === 4) setTimeout(checkPin, 300);
    }
}
function updatePinDots() {
    const dots = document.querySelectorAll('.pin-dots span');
    dots.forEach((dot, idx) => dot.classList.toggle('filled', idx < currentPin.length));
}
function clearPin() { currentPin = ""; updatePinDots(); }

function checkPin() {
    const err = document.getElementById('auth-error');
    if (currentPin === ADMIN_PIN) loginAs('ADMIN');
    else if (currentPin === COLAB_PIN) loginAs('COLAB');
    else { if (err) err.style.display = 'block'; currentPin = ""; updatePinDots(); }
}

function loginAs(role) {
    sessionStorage.setItem('gymkana_auth_role', role);
    document.getElementById('pin-overlay').style.display = 'none';
    document.body.classList.remove('locked');
    document.getElementById('app-content').style.display = 'block';
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = (role === 'ADMIN') ? '' : 'none');
    initApp();
}

const getRole = () => sessionStorage.getItem('gymkana_auth_role');

function showView(viewId, tid = null, extra = null) {
    if (liveUpdateInterval) clearInterval(liveUpdateInterval);
    if (getRole() === 'COLAB' && (viewId === 'home' || viewId === 'admin')) return;
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.style.display = 'block';
    
    currentView = viewId;
    if (tid) {
        currentTid = tid;
        localStorage.setItem('gymkana_tid', tid);
    }
    
    const homeBtn = document.getElementById('btn-head-home');
    if (homeBtn) homeBtn.style.display = (viewId !== 'home' && getRole() === 'ADMIN') ? 'block' : 'none';

    if (viewId === 'home') loadTournaments();
    else if (viewId === 'admin') {
        loadAdminData(currentTid);
        liveUpdateInterval = setInterval(() => { fetchAdminLeaderboard(currentTid); fetchAdminChallenges(currentTid); }, 3000);
    } else if (viewId === 'challenge') loadChallengePage(currentTid, extra || 1);
}

function exitTournament() {
    if (getRole() !== 'ADMIN') return;
    localStorage.removeItem('gymkana_tid');
    currentTid = null;
    showView('home');
}

function scoreFromPC() {
    if (getRole() !== 'ADMIN') return;
    const cnum = document.getElementById('select-c-num').value;
    showView('challenge', currentTid, cnum);
}

async function loadTournaments() {
    try {
        const res = await fetch('/tournaments/');
        const list = await res.json();
        document.getElementById('tournaments-list').innerHTML = list.map(t => `
            <div class="tourney-card ${t.id == currentTid ? 'active' : ''}" onclick="showView('admin', ${t.id})">
                <h3>${t.name} ${t.id == currentTid ? '<span class="tag">ACTUAL</span>' : ''}</h3>
                <p>${t.num_groups} grupos | ${t.num_challenges} pruebas</p>
            </div>
        `).join('') || "<div class='empty-state'>Pulsa el botón Generar para empezar.</div>";
    } catch (e) { console.error(e); }
}

async function createTournament() {
    const name = document.getElementById('new-t-name').value.trim();
    if (!name) return alert("Nombre?");
    const formData = new FormData();
    formData.append("name", name);
    formData.append("num_groups", document.getElementById('new-t-groups').value);
    formData.append("num_challenges", document.getElementById('new-t-challenges').value);
    try {
        const res = await fetch('/tournaments/', { method: 'POST', body: formData });
        const data = await res.json();
        showView('admin', data.id);
    } catch (e) { showDiag("Error."); }
}

async function loadAdminData(tid) {
    if (!tid) return;
    await fetchNetwork();
    fetchAdminChallenges(tid);
    fetchAdminLeaderboard(tid);
    updateQR(tid);
    
    // CARGA INTELIGENTE DE MAPA: Prioridad a la URL
    const res = await fetch('/tournaments/');
    const list = await res.json();
    const tourney = list.find(t => t.id == tid);
    const img = document.getElementById('admin-map-preview');
    if (tourney && tourney.map_url) {
        img.src = tourney.map_url;
        document.getElementById('map-url-input').value = tourney.map_url;
    } else {
        img.src = `/uploads/maps/map_${tid}.png?t=` + new Date().getTime();
        document.getElementById('map-url-input').value = "";
    }
}

async function saveMapURL() {
    const url = document.getElementById('map-url-input').value.trim();
    if (!url || !currentTid) return;
    const formData = new FormData();
    formData.append("url", url);
    await fetch(`/tournaments/${currentTid}/map-url/`, { method: 'POST', body: formData });
    loadAdminData(currentTid);
}

function updateQR(tid) {
    const canvas = document.getElementById('qr-canvas');
    const cnum = document.getElementById('select-c-num').value;
    let base = window.location.origin;
    if (base.includes('localhost') || base.includes('127.0.0.1')) base = `http://${networkInfo.local_ip}:${networkInfo.port}`;
    const url = `${base}/static/index.html?view=challenge&tid=${tid}&cnum=${cnum}`;
    if (canvas) { QRCode.toCanvas(canvas, url, { width: 180, margin: 2 }); document.getElementById('qr-url-display').innerText = url; }
}

function updateAdminCNum() { document.getElementById('admin-c-num').innerText = document.getElementById('select-c-num').value; updateQR(currentTid); }

async function showAudit() {
    if (!currentTid) return;
    const resA = await fetch(`/tournaments/${currentTid}/audit/`);
    const adt = await resA.json();
    const resG = await fetch(`/tournaments/${currentTid}/groups/`);
    const gps = await resG.json();
    const resC = await fetch(`/tournaments/${currentTid}/challenges/`);
    const chs = await resC.json();
    const header = document.getElementById('audit-header');
    header.innerHTML = `<tr><th>Prueba \\ Grupo</th>${gps.map(g => `<th>${g.name}</th>`).join('')}</tr>`;
    const body = document.getElementById('audit-body');
    body.innerHTML = chs.sort((a,b) => a.number - b.number).map(ch => {
        let row = `<tr><td><strong>Prueba ${ch.number}</strong></td>`;
        gps.forEach(g => {
            const sc = adt.find(s => s.group_id == g.id && s.challenge_num == ch.number);
            const val = sc ? sc.points : "-";
            row += `<td class="${sc ? 'td-score' : 'td-empty'}">${val}</td>`;
        });
        return row + `</tr>`;
    }).join('');
    document.getElementById('audit-overlay').style.display = 'flex';
}

function hideAudit() { document.getElementById('audit-overlay').style.display = 'none'; }

document.getElementById('admin-map-preview')?.addEventListener('click', async (e) => {
    if (!currentTid || getRole() !== 'ADMIN') return;
    const r = e.target.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const num = document.getElementById('select-c-num').value;
    const formData = new FormData();
    formData.append("x", x); formData.append("y", y);
    await fetch(`/tournaments/${currentTid}/challenges/${num}/location/`, { method: 'POST', body: formData });
    fetchAdminChallenges(currentTid);
});

async function fetchAdminChallenges(tid) {
    const res = await fetch(`/tournaments/${tid}/challenges/`);
    const list = await res.json();
    const overlay = document.getElementById('admin-pins-overlay');
    if (overlay) overlay.innerHTML = list.filter(c => c.x_pos !== null).map(c => `<div class="map-pin" style="left:${c.x_pos}%; top:${c.y_pos}%">${c.number}</div>`).join('');
}

async function fetchAdminLeaderboard(tid) {
    if (currentView !== 'admin') return;
    const res = await fetch(`/tournaments/${tid}/groups/`);
    const groups = await res.json();
    const board = document.getElementById('admin-leaderboard');
    if (board) board.innerHTML = groups.map(g => `<div class="group-card" style="margin-bottom:8px"><div class="group-header"><span>${g.name}</span><strong>${g.total_score} pts</strong></div></div>`).join('');
}

async function loadChallengePage(tid, cnum) {
    try {
        const resG = await fetch(`/tournaments/${tid}/groups/?challenge_num=${cnum}`);
        const groups = await resG.json();
        const list = document.getElementById('challenge-groups-list');
        document.getElementById('chall-page-title').innerText = `PRUEBA ${cnum}`;
        if (list) {
            list.innerHTML = groups.map(g => {
                let fs = "";
                for(let p=1; p<=5; p++) fs += `<button class="face-btn" ${(g.current_points==p)?'style="opacity:1;filter:grayscale(0);transform:scale(1.4)"':''} onclick="addScore(${g.id}, ${currentTid}, ${cnum}, ${p}, this)">${["😡","😟","😐","🙂","😄"][p-1]}</button>`;
                return `<div class="module group-card"><p class="group-header" style="color:var(--primary)">${g.name}</p><div class="faces-container">${fs}</div></div>`;
            }).join('');
        }
    } catch (e) { console.error(e); }
}

async function addScore(gid, tid, cnum, pts, btn) {
    const resC = await fetch(`/tournaments/${currentTid}/challenges/`);
    const chs = await resC.json();
    let ch = chs.find(c => c.number == cnum);
    if (!ch) return alert("Prueba no situada.");
    btn.parentElement.querySelectorAll('.face-btn').forEach(b => { b.style.opacity = '0.3'; b.style.filter = 'grayscale(0.8)'; b.style.transform = 'scale(1)'; });
    btn.style.opacity = '1'; btn.style.filter = 'grayscale(0)'; btn.style.transform = 'scale(1.4)';
    const formData = new FormData();
    formData.append("group_id", gid); formData.append("challenge_id", ch.id); formData.append("points", pts);
    await fetch('/score/', { method: 'POST', body: formData });
    const toast = document.createElement('div'); toast.innerText = "OK"; toast.className = "toast-msg"; document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1000);
}

async function uploadCSV() {
    const i = document.getElementById('csv-input'); if (!i.files[0]) return;
    const f = new FormData(); f.append("file", i.files[0]);
    await fetch(`/tournaments/${currentTid}/upload-csv/`, { method: 'POST', body: f });
    alert("✅ Cargado."); fetchAdminLeaderboard(currentTid);
}

async function uploadMap() {
    const i = document.getElementById('map-input'); if (!i.files[0]) return;
    const f = new FormData(); f.append("file", i.files[0]);
    await fetch(`/tournaments/${currentTid}/upload-map/`, { method: 'POST', body: f });
    loadAdminData(currentTid);
}

async function resetAll() {
    if (confirm("🚨 ¿Borrar todo?")) { await fetch('/reset-all/', { method: 'POST' }); localStorage.clear(); location.reload(); }
}

function initApp() {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('view'), t = p.get('tid'), c = p.get('cnum');
    if (getRole() === 'COLAB') { (v === 'challenge' && t && c) ? showView('challenge', t, c) : document.body.innerHTML = "<div class='auth-overlay'><h2>⚠️ Escanea un QR válido.</h2></div>"; }
    else { (v === 'challenge' && t && c) ? showView('challenge', t, c) : (currentTid ? showView('admin', currentTid) : showView('home')); }
}

window.onload = () => {
    const role = getRole();
    if (role) {
        document.getElementById('pin-overlay').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.body.classList.remove('locked');
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = (role === 'ADMIN') ? '' : 'none');
        initApp();
    }
};
