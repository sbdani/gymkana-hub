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

// --- SEGURIDAD DE DOBLE NIVEL ---
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
    if (currentPin === ADMIN_PIN) {
        loginAs('ADMIN');
    } else if (currentPin === COLAB_PIN) {
        loginAs('COLAB');
    } else {
        if (err) err.style.display = 'block';
        currentPin = "";
        updatePinDots();
    }
}

function loginAs(role) {
    sessionStorage.setItem('gymkana_auth_role', role);
    document.getElementById('pin-overlay').style.display = 'none';
    document.body.classList.remove('locked');
    document.getElementById('app-content').style.display = 'block';
    
    // Aplicar restricciones visuales inmediatas
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = (role === 'ADMIN') ? '' : 'none';
    });
    
    initApp();
}

const getRole = () => sessionStorage.getItem('gymkana_auth_role');

// --- NAVEGACIÓN ---
function showView(viewId, tid = null, extra = null) {
    if (liveUpdateInterval) clearInterval(liveUpdateInterval);
    
    // Bloqueo de seguridad: Los colaboradores no pueden ir a Home o Admin
    if (getRole() === 'COLAB' && (viewId === 'home' || viewId === 'admin')) {
        return; // No permitimos la navegación
    }

    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.style.display = 'block';
    
    currentView = viewId;
    if (tid) {
        currentTid = tid;
        localStorage.setItem('gymkana_tid', tid);
    }
    
    // El botón Home de la cabecera solo se muestra si eres ADMIN y no estás en Home
    const homeBtn = document.getElementById('btn-head-home');
    if (homeBtn) homeBtn.style.display = (viewId !== 'home' && getRole() === 'ADMIN') ? 'block' : 'none';

    if (viewId === 'home') {
        loadTournaments();
    } else if (viewId === 'admin') {
        loadAdminData(currentTid);
        liveUpdateInterval = setInterval(() => {
            fetchAdminLeaderboard(currentTid);
            fetchAdminChallenges(currentTid);
        }, 3000);
    } else if (viewId === 'challenge') {
        loadChallengePage(currentTid, extra || 1);
    }
}

function exitTournament() {
    if (getRole() !== 'ADMIN') return;
    localStorage.removeItem('gymkana_tid');
    currentTid = null;
    showView('home');
}

// FUNCIÓN PARA PUNTUAR DESDE EL PC (Solo Admin)
function scoreFromPC() {
    if (getRole() !== 'ADMIN') return;
    const cnum = document.getElementById('select-c-num').value;
    showView('challenge', currentTid, cnum);
}

// --- DATOS ---
async function loadTournaments() {
    try {
        const res = await fetch('/tournaments/');
        const list = await res.json();
        const role = getRole();
        document.getElementById('tournaments-list').innerHTML = list.map(t => `
            <div class="tourney-card ${t.id == currentTid ? 'active' : ''}" onclick="showView('admin', ${t.id})">
                <div class="card-glow"></div>
                <h3>${t.name}</h3>
                <p>${t.num_groups} grupos | ${t.num_challenges} pruebas</p>
                ${t.id == currentTid ? '<span class="status-badge">REANUDAR</span>' : ''}
            </div>
        `).join('') || "<div class='empty-state'>Crea tu primera Gymkana a la derecha.</div>";
    } catch (e) { console.error(e); }
}

async function createTournament() {
    const nameInput = document.getElementById('new-t-name');
    const name = nameInput.value.trim();
    if (!name) return alert("Nombre Requerido.");
    const formData = new FormData();
    formData.append("name", name);
    formData.append("num_groups", document.getElementById('new-t-groups').value);
    formData.append("num_challenges", document.getElementById('new-t-challenges').value);
    try {
        const res = await fetch('/tournaments/', { method: 'POST', body: formData });
        if (!res.ok) throw new Error((await res.json()).detail);
        const data = await res.json();
        nameInput.value = "";
        showView('admin', data.id);
    } catch (e) { showDiag("Error:\n" + e.message); }
}

async function loadAdminData(tid) {
    if (!tid) return showView('home');
    await fetchNetwork();
    fetchAdminChallenges(tid);
    fetchAdminLeaderboard(tid);
    updateQR(tid);
    try {
        const res = await fetch(`/tournaments/${tid}`);
        const tourney = await res.json();
        const img = document.getElementById('admin-map-preview');
        if (img) {
            img.src = tourney.map_url || (`/uploads/maps/map_${tid}.png?t=` + new Date().getTime());
        }
    } catch(e) {}
}

function updateQR(tid) {
    const canvas = document.getElementById('qr-canvas');
    const display = document.getElementById('qr-url-display');
    const cnum = document.getElementById('select-c-num').value;
    let base = window.location.origin;
    if (base.includes('localhost') || base.includes('127.0.0.1')) {
        base = `http://${networkInfo.local_ip}:${networkInfo.port}`;
    }
    const url = `${base}/static/index.html?view=challenge&tid=${tid}&cnum=${cnum}`;
    if (canvas) {
        QRCode.toCanvas(canvas, url, { width: 180, margin: 2 });
        if (display) display.innerText = url;
    }
}

function updateAdminCNum() { 
    const el = document.getElementById('admin-c-num');
    if (el) el.innerText = document.getElementById('select-c-num').value; 
    updateQR(currentTid); 
}

async function showAudit() {
    if (!currentTid) return;
    try {
        const resAudit = await fetch(`/tournaments/${currentTid}/audit/`);
        const auditData = await resAudit.json();
        const resGroups = await fetch(`/tournaments/${currentTid}/groups/`);
        const groups = await resGroups.json();
        const resChallenges = await fetch(`/tournaments/${currentTid}/challenges/`);
        const challenges = await resChallenges.json();

        const header = document.getElementById('audit-header');
        header.innerHTML = `<tr><th>Prueba \\ Grupo</th>${groups.map(g => `<th>${g.name}</th>`).join('')}</tr>`;

        const body = document.getElementById('audit-body');
        body.innerHTML = challenges.sort((a,b) => a.number - b.number).map(ch => {
            let row = `<tr><td><strong>Prueba ${ch.number}</strong></td>`;
            groups.forEach(g => {
                const score = auditData.find(s => s.group_id == g.id && s.challenge_num == ch.number);
                const val = score ? score.points : "-";
                const className = score ? "td-score" : "td-empty";
                row += `<td class="${className}">${val}</td>`;
            });
            row += `</tr>`;
            return row;
        }).join('');

        document.getElementById('audit-overlay').style.display = 'flex';
    } catch (e) { showDiag("Error matriz."); }
}

function hideAudit() { document.getElementById('audit-overlay').style.display = 'none'; }

document.getElementById('admin-map-preview')?.addEventListener('click', async (e) => {
    if (!currentTid || getRole() !== 'ADMIN') return;
    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const num = document.getElementById('select-c-num').value;
    const formData = new FormData();
    formData.append("x", x);
    formData.append("y", y);
    await fetch(`/tournaments/${currentTid}/challenges/${num}/location/`, { method: 'POST', body: formData });
    fetchAdminChallenges(currentTid);
});

async function fetchAdminChallenges(tid) {
    const res = await fetch(`/tournaments/${tid}/challenges/`);
    const list = await res.json();
    const overlay = document.getElementById('admin-pins-overlay');
    if (overlay) {
        overlay.innerHTML = list.filter(c => c.x_pos !== null).map(c => `
            <div class="map-pin" style="left:${c.x_pos}%; top:${c.y_pos}%">${c.number}</div>
        `).join('');
    }
}

async function fetchAdminLeaderboard(tid) {
    if (currentView !== 'admin') return;
    try {
        const res = await fetch(`/tournaments/${tid}/groups/`);
        const groups = await res.json();
        const board = document.getElementById('admin-leaderboard');
        if (board) {
            board.innerHTML = groups.map(g => `
                <div class="group-card" style="margin-bottom:8px"><div class="group-header"><span>${g.name}</span><strong>${g.total_score} pts</strong></div></div>
            `).join('');
        }
    } catch (e) { console.warn("Sync error."); }
}

async function loadChallengePage(tid, cnum) {
    try {
        const resG = await fetch(`/tournaments/${tid}/groups/?challenge_num=${cnum}`);
        const groups = await resG.json();
        const list = document.getElementById('challenge-groups-list');
        document.getElementById('chall-page-title').innerText = `PRUEBA ${cnum}`;
        if (list) {
            list.innerHTML = groups.map(g => {
                let facesHtml = "";
                for(let p=1; p<=5; p++) {
                    const icon = ["😡","😟","😐","🙂","😄"][p-1];
                    const isActive = (g.current_points == p);
                    const activeStyle = isActive ? "style='opacity:1; filter:grayscale(0); transform:scale(1.4)'" : "";
                    const activeClass = isActive ? " active-face" : "";
                    facesHtml += `<button class="face-btn${activeClass}" ${activeStyle} onclick="addScore(${g.id}, ${currentTid}, ${cnum}, ${p}, this)">${icon}</button>`;
                }
                return `<div class="module group-card"><p class="group-header" style="color:var(--primary)">${g.name}</p><div class="faces-container">${facesHtml}</div></div>`;
            }).join('');
        }
    } catch (e) { console.error(e); }
}

async function addScore(gid, tid, cnum, originalPts, btn) {
    const resC = await fetch(`/tournaments/${currentTid}/challenges/`);
    const challenges = await resC.json();
    let ch = challenges.find(c => c.number == cnum);
    if (!ch) return alert("Prueba no situada.");
    let pts = originalPts;
    if (btn.classList.contains('active-face')) {
        pts = 0;
    }

    const parent = btn.parentElement;
    parent.querySelectorAll('.face-btn').forEach(b => {
        b.style.opacity = '0.3'; b.style.filter = 'grayscale(0.8)'; b.style.transform = 'scale(1)';
        b.classList.remove('active-face');
    });
    if (pts > 0) {
        btn.style.opacity = '1'; btn.style.filter = 'grayscale(0)'; btn.style.transform = 'scale(1.4)';
        btn.classList.add('active-face');
    }

    const formData = new FormData();
    formData.append("group_id", gid);
    formData.append("challenge_id", ch.id)
    formData.append("points", pts);
    try {
        await fetch('/score/', { method: 'POST', body: formData });
        const toast = document.createElement('div');
        toast.innerText = "OK"; toast.className = "toast-msg";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1000);
    } catch (e) { alert("Error."); }
}

async function uploadCSV() {
    const input = document.getElementById('csv-input');
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append("file", input.files[0]);
    try {
        const res = await fetch(`/tournaments/${currentTid}/upload-csv/`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error((await res.json()).detail);
        alert("✅ Cargado.");
        fetchAdminLeaderboard(currentTid);
    } catch (e) { showDiag("Fallo CSV."); }
}

async function uploadMap() {
    const input = document.getElementById('map-input');
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append("file", input.files[0]);
    try {
        const res = await fetch(`/tournaments/${currentTid}/upload-map/`, { method: 'POST', body: formData });
        const data = await res.json();
        document.getElementById('admin-map-preview').src = data.filename;
    } catch (e) { showDiag("Fallo mapa."); }
}

async function saveMapURL() {
    const input = document.getElementById('map-url-input');
    const url = input.value.trim();
    if (!url) return;
    const formData = new FormData();
    formData.append("url", url);
    try {
        await fetch(`/tournaments/${currentTid}/map-url/`, { method: 'POST', body: formData });
        document.getElementById('admin-map-preview').src = url;
        input.value = "";
    } catch(e) { showDiag("Error guardando URL."); }
}

async function resetAll() {
    if (confirm("🚨 ¿Borrar todo?")) {
        await fetch('/reset-all/', { method: 'POST' });
        localStorage.clear();
        location.reload();
    }
}

function initApp() {
    const p = new URLSearchParams(window.location.search);
    const view = p.get('view'), tid = p.get('tid'), cnum = p.get('cnum');
    const role = getRole();
    
    // Si somos colaboradores, forzamos vista de challenge
    if (role === 'COLAB') {
        if (view === 'challenge' && tid && cnum) showView('challenge', tid, cnum);
        else document.body.innerHTML = "<div class='auth-overlay'><h2>⚠️ Escanea un QR válido.</h2></div>";
    } else {
        if (view === 'challenge' && tid && cnum) showView('challenge', tid, cnum);
        else if (currentTid) showView('admin', currentTid);
        else showView('home');
    }
}

window.onload = () => {
    const role = getRole();
    if (role) {
        document.getElementById('pin-overlay').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.body.classList.remove('locked');
        
        // Aplicar restricciones visuales
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = (role === 'ADMIN') ? '' : 'none';
        });
        
        initApp();
    }
};
