/* ---------- online basics ---------- */
const SB_URL = 'https://slbgazdgvhjqhwwjifus.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsYmdhemRndmhqcWh3d2ppZnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzE1MjYsImV4cCI6MjEwODQ0NzUyNn0.dNpq38nOC6cYS1mgpo9tBbgWaD8riTo0CqXUMHehSGM';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } }) : null;

const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const COLORS = ['#e8728c', '#2fa79b', '#e8932c', '#7c6cf0', '#3f92d8', '#c95fd0', '#4fae55', '#d9573f'];
const HAIRS = 4;
let ME = LS.get('jt-me', null);
if (!ME || !ME.id){ ME = { id: Math.random().toString(36).slice(2, 10), name: '' }; }
if (!COLORS.includes(ME.color)) ME.color = COLORS[[...ME.id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
if (!(ME.hair >= 0 && ME.hair < HAIRS)) ME.hair = 0;
LS.set('jt-me', ME);
let ME_COLOR = ME.color;
const saveMe = () => LS.set('jt-me', ME);

let toastT = 0;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function busy(msg){ $('#busy').hidden = !msg; if (msg) $('#busyMsg').textContent = msg; }
const fmtT = s => s >= 3600 ? Math.floor(s / 3600) + ':' + fmt(s % 3600) : fmt(s);
const fmtClock = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function hashStr(s){ let h = 2166136261; for (const ch of s){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const colorOf = k => COLORS[hashStr(String(k)) % COLORS.length];

const S = { game: false, pieces: [], W: 0, H: 0, filterEdges: false, ghost: LS.get('jt-ghost', false), chan: null, players: [], connected: false, pass: null };
const remoteEl = $('#remote');
const L = { puzzle: null, radio: {}, mode: 'all', hasOwner: false, offset: 0, pin: LS.get('jt-owner-pin', null), isOwner: false };
const serverNow = () => Date.now() + L.offset;

/* ---------- pixel characters ---------- */
const SKIN = '#f2c7a0', SKIN_D = '#d9a57c', PANTS = '#3d3a4e', SHOE = '#2a2433';
const HAIR_COL = ['#4a2f22', '#2b2230', '#c27a3a', '#7a4a2e'];
function shade(hex, k){ const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k); return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`; }
/* draws a 10x16 character with feet at (x,y); dir 0 down 1 up 2 left 3 right */
function drawChar(g, x, y, color, hair, dir, frame, noShadow){
  x = Math.round(x) - 5; y = Math.round(y) - 16;
  const R = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(x + a, y + b, w, h); };
  if (!noShadow){ g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 1, y + 15, 8, 2); }
  const step = frame % 2 ? 1 : 0, lift = (frame % 4 === 1) ? 1 : 0;
  // legs
  if (dir >= 2){ R(3 + (step ? 1 : 0), 12, 2, 3, PANTS); R(5 - (step ? 1 : 0), 12, 2, 3, PANTS); R(3 + (step ? 1 : 0), 14, 2, 1, SHOE); R(5 - (step ? 1 : 0), 14, 2, 1, SHOE); }
  else { R(2, 12, 2, 3 - (step ? 1 : 0), PANTS); R(6, 12, 2, 3 - (step ? 0 : 1), PANTS); R(2, 14 - (step ? 1 : 0), 2, 1, SHOE); R(6, 14 - (step ? 0 : 1), 2, 1, SHOE); }
  const by = lift ? -1 : 0;
  // body
  R(2, 8 + by, 6, 5, color); R(2, 12 + by, 6, 1, shade(color, .8));
  if (dir < 2){ R(1, 8 + by, 1, 4, color); R(8, 8 + by, 1, 4, color); R(1, 12 + by, 1, 1, SKIN); R(8, 12 + by, 1, 1, SKIN); }
  else R(dir === 2 ? 3 : 5, 9 + by, 2, 3, shade(color, .85));
  // head
  R(2, 2 + by, 6, 6, SKIN); R(2, 7 + by, 6, 1, SKIN_D);
  const hc = HAIR_COL[hair % HAIR_COL.length];
  if (dir === 1){ R(1, 1 + by, 8, 6, hc); }
  else {
    R(1, 1 + by, 8, 2, hc); R(1, 3 + by, 1, 3, hc); R(8, 3 + by, 1, 3, hc);
    if (hair === 1){ R(1, 3 + by, 1, 5, hc); R(8, 3 + by, 1, 5, hc); }
    if (hair === 2){ R(2, 3 + by, 3, 1, hc); }
    if (hair === 3){ R(3, 0 + by, 4, 1, hc); }
    if (dir === 0){ R(3, 4 + by, 1, 2, '#2a2230'); R(6, 4 + by, 1, 2, '#2a2230'); R(2, 6 + by, 1, 1, '#f0a0a0'); R(7, 6 + by, 1, 1, '#f0a0a0'); }
    else if (dir === 2){ R(3, 4 + by, 1, 2, '#2a2230'); R(6, 3 + by, 3, 4, hc); }
    else { R(6, 4 + by, 1, 2, '#2a2230'); R(1, 3 + by, 3, 4, hc); }
  }
}

/* ---------- enter screen ---------- */
function drawAvPrev(){
  const c = $('#avPrev'), g = c.getContext('2d'); c.width = 20; c.height = 25; g.clearRect(0, 0, 20, 25);
  drawChar(g, 10, 21, ME.color, ME.hair, 0, Math.floor(performance.now() / 250) % 4 === 1 ? 1 : 0);
}
function buildEnter(){
  const sw = $('#swatches'); sw.innerHTML = '';
  COLORS.forEach(c => { const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.setAttribute('aria-label', 'สีเสื้อ'); b.setAttribute('aria-pressed', c === ME.color); b.onclick = () => { ME.color = c; ME_COLOR = c; saveMe(); buildEnter(); }; sw.appendChild(b); });
  const hs = $('#hairs'); hs.innerHTML = '';
  for (let i = 0; i < HAIRS; i++){
    const b = document.createElement('button'); b.className = 'hair'; b.setAttribute('aria-label', 'ทรงผมแบบที่ ' + (i + 1)); b.setAttribute('aria-pressed', i === ME.hair);
    const cv = document.createElement('canvas'); cv.width = 12; cv.height = 9; const g = cv.getContext('2d');
    g.save(); g.translate(0, 0); drawChar(g, 6, 16, ME.color, i, 0, 0); g.restore();
    b.appendChild(cv); b.onclick = () => { ME.hair = i; saveMe(); buildEnter(); }; hs.appendChild(b);
  }
  drawAvPrev();
}
setInterval(() => { if (!$('#enter').hidden) drawAvPrev(); }, 250);
$('#nick').value = ME.name || '';
$('#nick').addEventListener('input', () => { $('#enterErr').textContent = ''; });
$('#nick').addEventListener('keydown', e => { if (e.key === 'Enter') $('#enterBtn').click(); });
$('#enterBtn').onclick = () => {
  audioInit();
  const n = $('#nick').value.trim();
  if (!n){ $('#enterErr').textContent = 'ใส่ชื่อเล่นก่อน เพื่อนจะได้รู้ว่าใครเป็นใคร'; $('#nick').focus(); return; }
  if (!sb){ $('#enterErr').textContent = 'โหลดระบบออนไลน์ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง'; return; }
  const first = !Room.me;
  ME.name = n.slice(0, 16); saveMe();
  $('#enter').hidden = true;
  if (first) enterLobby(); else { Room.me.name = ME.name; Room.me.color = ME.color; Room.me.hair = ME.hair; sendPos(true); if (S.chan) S.chan.track({ name: ME.name, color: ME.color }).catch(() => {}); }
  Radio.userGesture();
};
