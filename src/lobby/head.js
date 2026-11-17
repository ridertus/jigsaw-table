/* ---------- online basics ---------- */
const SB_URL = 'https://slbgazdgvhjqhwwjifus.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsYmdhemRndmhqcWh3d2ppZnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzE1MjYsImV4cCI6MjEwODQ0NzUyNn0.dNpq38nOC6cYS1mgpo9tBbgWaD8riTo0CqXUMHehSGM';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } }) : null;

const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const COLORS = ['#e8728c', '#2fa79b', '#e8932c', '#7c6cf0', '#3f92d8', '#c95fd0', '#4fae55', '#d9573f', '#f1ede4', '#34323f'];
/* ME is set up with the characters below */

let toastT = 0;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function busy(msg){ $('#busy').hidden = !msg; if (msg) $('#busyMsg').textContent = msg; }
const fmtT = s => s >= 3600 ? Math.floor(s / 3600) + ':' + fmt(s % 3600) : fmt(s);
const fmtClock = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function hashStr(s){ let h = 2166136261; for (const ch of s){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const colorOf = k => COLORS[hashStr(String(k)) % 8];

const S = { game: false, pieces: [], W: 0, H: 0, filterEdges: false, ghost: LS.get('jt-ghost', false), chan: null, players: [], connected: false, pass: null };
const remoteEl = $('#remote');
const L = { puzzle: null, radio: {}, mode: 'all', hasOwner: false, offset: 0, pin: LS.get('jt-owner-pin', null), isOwner: false };
const serverNow = () => Date.now() + L.offset;

/* ---------- characters (PixelLab sprites, see tools/chars-build.py) ----------
   assets/chars/chars.png: one 48px row per character = idle 8 directions | walk S,E,N,W x4 frames | sit 8 directions.
   Direction order inside a block: S, SE, E, NE, N, NW, W, SW. Game dirs: 0 down, 1 up, 2 left, 3 right. */
const CHARS = [
  { name: 'หูฟัง', color: '#4d6bb3' }, { name: 'แว่นตา', color: '#c79a62' }, { name: 'ดังโงะ', color: '#e8728c' },
  { name: 'หูแมว', color: '#4fae55' }, { name: 'บีนนี่', color: '#d9573f' }
];
const CHAR_ATLAS = new Image(), CHAR_FEET = /*CHAR_FEET*/null, CELL = 48;
let charReady = false;
CHAR_ATLAS.onload = () => { charReady = true; spriteCache.clear(); if (typeof buildEnter === 'function' && !$('#enter').hidden) buildEnter(); };
CHAR_ATLAS.src = 'assets/chars/chars.png';
const DIR8 = { 0: 0, 1: 4, 2: 6, 3: 2 }, WALK4 = { 0: 0, 3: 1, 1: 2, 2: 3 };
const chOf = look => { const c = look && look.ch; return c >= 0 && c < CHARS.length ? c | 0 : hashStr(String(look && look.k || '')) % CHARS.length; };
/* atlas column for a pose; frame 0..3 = walk cycle (only used while moving) */
function charCol(dir, frame, pose, moving){
  if (pose === 'sit') return 24 + DIR8[dir];
  if (moving) return 8 + WALK4[dir] * 4 + (frame % 4);
  return DIR8[dir];
}
/* feet line of a frame (walk frames use the idle frame's, so the leg lift shows) */
function charFeet(ch, col){ const f = CHAR_FEET && CHAR_FEET[ch]; if (!f) return 46; return col >= 8 && col < 24 ? f[DIR8[[0, 3, 1, 2][Math.floor((col - 8) / 4)]]] : f[col]; }
let ME = LS.get('jt-me', null);
if (!ME || !ME.id){ ME = { id: Math.random().toString(36).slice(2, 10), name: '' }; }
if (!(ME.ch >= 0 && ME.ch < CHARS.length)) ME.ch = [...ME.id].reduce((a, c) => a + c.charCodeAt(0), 0) % CHARS.length;
ME.color = CHARS[ME.ch].color;
let ME_COLOR = ME.color;
const saveMe = () => LS.set('jt-me', ME);

/* ---------- enter screen ---------- */
function drawAvPrev(){
  const c = $('#avPrev'), g = c.getContext('2d'); c.width = 48; c.height = 52; g.clearRect(0, 0, 48, 52);
  const t = performance.now(), dir = [0, 3, 1, 2][Math.floor(t / 1800) % 4], fr = Math.floor(t / 150) % 4;
  g.fillStyle = 'rgba(60,30,20,.22)'; g.fillRect(14, 48, 20, 2);
  g.drawImage(charSprite(ME, dir, fr, 'stand', true), 0, 2);
}
function buildEnter(){
  const box = $('#charPick'); box.innerHTML = '';
  CHARS.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cpick'; b.setAttribute('aria-pressed', i === ME.ch); b.title = c.name;
    const cv = document.createElement('canvas'); cv.width = 36; cv.height = 48; cv.getContext('2d').drawImage(charSprite({ ch: i }, 0, 0, 'stand'), -6, 0); // trim the empty sides
    const nm = document.createElement('small'); nm.textContent = c.name;
    b.append(cv, nm); b.onclick = () => { ME.ch = i; ME.color = ME_COLOR = c.color; saveMe(); buildEnter(); };
    box.appendChild(b);
  });
  drawAvPrev();
}
setInterval(() => { if (!$('#enter').hidden) drawAvPrev(); }, 150);

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
  if (first) enterLobby(); else { Object.assign(Room.me, { name: ME.name, color: ME.color, ch: ME.ch }); spriteCache.clear(); sendPos(true); if (S.chan) S.chan.track({ name: ME.name, color: ME.color }).catch(() => {}); }
  Radio.userGesture();
};
