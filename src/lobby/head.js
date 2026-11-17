/* ---------- online basics ---------- */
const SB_URL = 'https://slbgazdgvhjqhwwjifus.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsYmdhemRndmhqcWh3d2ppZnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzE1MjYsImV4cCI6MjEwODQ0NzUyNn0.dNpq38nOC6cYS1mgpo9tBbgWaD8riTo0CqXUMHehSGM';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } }) : null;

const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const COLORS = ['#e8728c', '#2fa79b', '#e8932c', '#7c6cf0', '#3f92d8', '#c95fd0', '#4fae55', '#d9573f', '#f1ede4', '#34323f'];
let ME = LS.get('jt-me', null);
if (!ME || !ME.id){ ME = { id: Math.random().toString(36).slice(2, 10), name: '' }; }
if (!COLORS.includes(ME.color)) ME.color = COLORS[[...ME.id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
if (!(ME.hair >= 0 && ME.hair < 6)) ME.hair = 0;
if (!(ME.hc >= 0 && ME.hc < 8)) ME.hc = ME.hair % 4;
if (!(ME.acc >= 0 && ME.acc < 6)) ME.acc = 0;
LS.set('jt-me', ME);
let ME_COLOR = ME.color;
const saveMe = () => LS.set('jt-me', ME);

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

/* ---------- pixel characters (chibi, ~24x34, outlined later by charSprite) ---------- */
const SKIN = '#f6d0ab', SKIN_D = '#e2ad86', SKIN_S = '#cf946d', PANTS = '#46527e', PANTS_D = '#323c60', SHOE = '#2a2230', SHOE_L = '#f2ece2', EYE = '#2a2030';
const HC = ['#4a2f22', '#2b2230', '#c27a3a', '#7a4a2e', '#e8c46a', '#d98aa8', '#6f84d6', '#eee4d8'];
const HAIR_NAMES = ['สั้น', 'ยาว', 'หางม้า', 'บ๊อบ', 'ยุ่ง ๆ', 'ดังโงะ'];
const ACC_NAMES = ['ไม่มี', 'หูฟัง', 'แว่น', 'หูแมว', 'หมวกไหมพรม', 'กิ๊บดอกไม้'];
const HAIRS = HAIR_NAMES.length, ACCS = ACC_NAMES.length;
function shade(hex, k){ const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k); return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`; }
const hairColor = look => HC[look.hc != null && look.hc >= 0 ? look.hc % HC.length : (look.hair || 0) % 4];
/* draws a character with feet at (x,y). look = {color, hair, hc, acc}; dir 0 down 1 up 2 left 3 right;
   frame 0..3 walk cycle, 4 = blink; pose 'stand' | 'sit' */
function drawChar(g, x, y, look, dir, frame, pose){
  if (dir === 3){ g.save(); g.translate(Math.round(x) * 2, 0); g.scale(-1, 1); drawChar(g, x, y, look, 2, frame, pose); g.restore(); return; }
  const ox = Math.round(x) - 12, oy = Math.round(y) - 34, sit = pose === 'sit';
  const R = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(ox + a, oy + b, w, h); };
  const col = look.color || '#e8728c', colD = shade(col, .78), colL = shade(col, 1.12), hc = hairColor(look), hcD = shade(hc, .75), hcL = shade(hc, 1.3);
  const st = look.hair % HAIRS, acc = look.acc || 0;
  const walkF = frame < 4 ? frame : 0, bob = !sit && (walkF === 1 || walkF === 3) ? -1 : 0, blink = frame === 4;
  const dy = (sit ? 5 : 0) + bob; // upper body offset
  const H = (a, b, w, h) => R(a, b, w, h, hc), HD = (a, b, w, h) => R(a, b, w, h, hcD); // y already includes the sit/bob offset

  /* ---- back layer: long hair / ponytail behind the body ---- */
  if (dir === 0){
    if (st === 1){ H(3, 6 + dy, 4, 19); H(17, 6 + dy, 4, 19); HD(3, 22 + dy, 4, 3); HD(17, 22 + dy, 4, 3); }
    if (st === 2){ H(19, 4 + dy, 4, 13); H(20, 16 + dy, 3, 3); R(19, 5 + dy, 3, 2, look.color); }
  }
  if (dir === 2){
    if (st === 1){ H(11, 6 + dy, 9, 19); HD(12, 22 + dy, 7, 3); }
    if (st === 2){ H(18, 5 + dy, 4, 14); H(19, 18 + dy, 3, 2); R(17, 6 + dy, 2, 3, look.color); }
  }

  /* ---- legs ---- */
  if (!sit){
    if (dir === 2){
      const s = walkF === 1 ? 2 : walkF === 3 ? -2 : 0;
      R(10 - s, 27, 3, 4, PANTS_D); R(9 - s, 31, 5, 2, SHOE);
      R(11 + s, 27, 3, 4, PANTS); R(10 + s, 31, 5, 2, SHOE); R(10 + s, 32, 2, 1, SHOE_L);
    } else {
      const lu = walkF === 1 ? 1 : 0, ru = walkF === 3 ? 1 : 0;
      R(8, 27, 4, 4 - lu, PANTS); R(13, 27, 4, 4 - ru, PANTS); R(12, 27, 1, 2, PANTS_D);
      R(7, 31 - lu, 5, 2, SHOE); R(13, 31 - ru, 5, 2, SHOE);
      if (dir === 0){ R(7, 32 - lu, 2, 1, SHOE_L); R(16, 32 - ru, 2, 1, SHOE_L); }
    }
  } else {
    if (dir === 0){ R(7, 30, 11, 3, PANTS); R(7, 30, 11, 1, PANTS_D); R(7, 32, 4, 2, SHOE); R(14, 32, 4, 2, SHOE); R(8, 33, 2, 1, SHOE_L); R(15, 33, 2, 1, SHOE_L); }
    if (dir === 1){ R(7, 30, 11, 3, PANTS); }
    if (dir === 2){ R(5, 29, 9, 3, PANTS); R(5, 29, 9, 1, PANTS_D); R(4, 31, 4, 2, PANTS); R(2, 32, 6, 2, SHOE); R(2, 33, 2, 1, SHOE_L); }
  }

  /* ---- body ---- */
  const by = 18 + dy;
  if (dir === 2){
    R(8, by, 9, 9, col); R(14, by, 3, 9, colD); R(8, by + 8, 9, 1, colD); R(8, by, 9, 1, colL);
    R(13, by, 4, 3, colD); // hood
    const sw = sit ? 0 : walkF === 1 ? -1 : walkF === 3 ? 1 : 0;
    R(10 + sw, by + 1, 4, 6, colD); R(10 + sw, by + 1, 3, 6, col); R(10 + sw, by + 7, 3, 2, SKIN);
  } else {
    R(7, by, 11, 9, col); R(7, by, 11, 1, colL); R(15, by + 1, 3, 8, colD); R(7, by + 8, 11, 1, colD);
    if (dir === 0){ R(9, by, 7, 2, colD); R(11, by + 1, 1, 3, SHOE_L); R(14, by + 1, 1, 3, SHOE_L); R(9, by + 5, 7, 1, colD); R(9, by + 5, 1, 3, colD); R(15, by + 5, 1, 3, colD); }
    else { R(8, by, 9, 4, colD); R(9, by, 7, 3, col); R(9, by + 3, 7, 1, colD); }
    const la = sit ? 0 : walkF === 1 ? 1 : walkF === 3 ? -1 : 0;
    R(5, by + 1 + la, 2, 6, col); R(18, by + 1 - la, 2, 6, colD);
    R(5, by + 7 + la, 2, 2, SKIN); R(18, by + 7 - la, 2, 2, SKIN_D);
  }

  /* ---- head ---- */
  const hy = 3 + dy;
  if (dir !== 1){
    // face
    R(6, hy + 4, 13, 10, SKIN); R(7, hy + 14, 11, 1, SKIN); R(8, hy + 15, 9, 1, SKIN_D); R(6, hy + 13, 1, 1, SKIN_D); R(18, hy + 13, 1, 1, SKIN_D);
    if (dir === 0){
      if (blink){ R(8, hy + 10, 3, 1, EYE); R(14, hy + 10, 3, 1, EYE); }
      else { R(8, hy + 8, 3, 3, EYE); R(14, hy + 8, 3, 3, EYE); R(9, hy + 8, 1, 1, '#fff'); R(15, hy + 8, 1, 1, '#fff'); R(8, hy + 10, 3, 1, '#4a3a5a'); R(14, hy + 10, 3, 1, '#4a3a5a'); }
      R(7, hy + 12, 2, 1, '#f3a6a0'); R(16, hy + 12, 2, 1, '#f3a6a0'); R(12, hy + 12, 1, 1, '#a85a48');
    } else {
      if (blink) R(7, hy + 10, 3, 1, EYE); else { R(7, hy + 8, 3, 3, EYE); R(8, hy + 8, 1, 1, '#fff'); }
      R(6, hy + 12, 2, 1, '#f3a6a0'); R(5, hy + 10, 1, 2, SKIN); R(6, hy + 13, 1, 1, '#a85a48');
      R(13, hy + 9, 2, 3, SKIN_D); // ear
    }
  }
  // hair
  if (dir === 1){
    H(5, hy - 1, 15, 15); H(6, hy - 2, 13, 1); H(4, hy + 1, 1, 11); H(20, hy + 1, 1, 11); HD(5, hy + 12, 15, 2);
    R(7, hy, 9, 1, hcL); R(6, hy + 1, 3, 1, hcL); [8, 12, 16].forEach(x => R(x, hy + 3 + (x % 3), 1, 8, hcD)); R(10, hy + 2, 1, 5, hcL); R(14, hy + 3, 1, 4, hcL);
    if (st === 1){ H(6, hy + 12, 13, 7); HD(7, hy + 18, 11, 2); [9, 13, 16].forEach(x => R(x, hy + 13, 1, 5, hcD)); R(11, hy + 13, 1, 4, hcL); }
    if (st === 2){ H(10, hy + 12, 5, 8); R(10, hy + 11, 5, 2, look.color); HD(11, hy + 18, 3, 2); }
    if (st === 3){ H(4, hy + 12, 17, 3); HD(4, hy + 14, 17, 1); }
    if (st === 4){ H(7, hy - 4, 2, 2); H(11, hy - 4, 3, 2); H(16, hy - 3, 2, 2); }
    if (st === 5){ H(3, hy - 4, 5, 5); H(17, hy - 4, 5, 5); R(4, hy - 4, 2, 1, hcL); R(18, hy - 4, 2, 1, hcL); }
  } else if (dir === 0){
    H(6, hy - 2, 13, 2); H(5, hy, 15, 4); H(4, hy + 1, 2, 9); H(19, hy + 1, 2, 9); R(8, hy, 5, 1, hcL); R(14, hy - 1, 2, 1, hcL);
    if (st === 0 || st === 2){ H(6, hy + 4, 13, 2); H(6, hy + 6, 2, 1); H(10, hy + 6, 3, 1); H(16, hy + 6, 3, 1); HD(4, hy + 9, 2, 1); HD(19, hy + 9, 2, 1); }
    if (st === 1){ H(6, hy + 4, 13, 1); H(6, hy + 5, 8, 1); H(6, hy + 6, 4, 1); H(4, hy + 1, 3, 13); H(18, hy + 1, 3, 13); }
    if (st === 3){ H(6, hy + 4, 13, 2); H(6, hy + 6, 4, 1); H(15, hy + 6, 4, 1); H(4, hy + 1, 3, 13); H(18, hy + 1, 3, 13); HD(4, hy + 13, 3, 1); HD(18, hy + 13, 3, 1); }
    if (st === 4){ H(6, hy + 4, 13, 1); H(6, hy + 5, 3, 2); H(11, hy + 5, 2, 2); H(15, hy + 5, 3, 1); H(7, hy - 4, 2, 2); H(11, hy - 5, 3, 3); H(16, hy - 3, 2, 2); H(3, hy + 2, 2, 3); H(20, hy + 2, 2, 3); }
    if (st === 5){ H(6, hy + 4, 13, 2); H(8, hy + 6, 9, 1); H(3, hy - 4, 5, 5); H(17, hy - 4, 5, 5); R(4, hy - 4, 2, 1, hcL); R(18, hy - 4, 2, 1, hcL); }
  } else { // side, facing left
    H(6, hy - 2, 12, 2); H(5, hy, 15, 4); H(11, hy + 4, 9, 6); H(14, hy + 10, 6, 4); H(5, hy + 4, 4, 2); H(5, hy + 6, 2, 1); R(8, hy, 5, 1, hcL);
    R(13, hy + 9, 2, 3, SKIN_D);
    if (st === 1 || st === 3){ H(14, hy + 10, 7, st === 1 ? 12 : 5); }
    if (st === 4){ H(7, hy - 4, 2, 2); H(11, hy - 5, 3, 3); H(16, hy - 3, 2, 2); H(4, hy + 4, 2, 3); }
    if (st === 5){ H(14, hy - 4, 6, 5); R(15, hy - 4, 2, 1, hcL); }
  }

  /* ---- accessories ---- */
  const A = '#2d2b38', AC = '#e8954a';
  if (acc === 1){ // headphones
    if (dir === 2){ R(7, hy - 3, 10, 2, A); R(15, hy - 1, 2, 9, A); R(12, hy + 7, 5, 6, A); R(13, hy + 8, 3, 4, AC); }
    else { R(6, hy - 3, 13, 2, A); R(4, hy - 1, 2, 9, A); R(19, hy - 1, 2, 9, A); R(2, hy + 7, 4, 7, A); R(19, hy + 7, 4, 7, A); R(3, hy + 8, 2, 5, AC); R(20, hy + 8, 2, 5, AC); }
  }
  if (acc === 2 && dir !== 1){ // glasses
    if (dir === 0){ R(7, hy + 7, 5, 1, A); R(7, hy + 11, 5, 1, A); R(7, hy + 7, 1, 5, A); R(11, hy + 7, 1, 5, A); R(13, hy + 7, 5, 1, A); R(13, hy + 11, 5, 1, A); R(13, hy + 7, 1, 5, A); R(17, hy + 7, 1, 5, A); R(12, hy + 8, 1, 1, A); }
    else { R(6, hy + 7, 5, 1, A); R(6, hy + 11, 5, 1, A); R(10, hy + 7, 1, 5, A); R(11, hy + 8, 4, 1, A); }
  }
  if (acc === 3){ // cat ears
    const ear = (a, flip) => { for (let i = 0; i < 4; i++) R(a + (flip ? 0 : i >> 1), hy - 5 + i, 4 - (i >> 1), 1, hc); R(a + 1, hy - 3, 1, 2, '#f3a6a0'); };
    if (dir === 2){ ear(8, false); ear(14, true); } else { ear(5, false); ear(16, true); }
  }
  if (acc === 4){ // beanie
    const bc = '#d4574a', bl = '#ec8070';
    R(5, hy - 4, 15, 6, bc); R(6, hy - 5, 13, 1, bc); R(4, hy + 1, 17, 3, bl); R(4, hy + 3, 17, 1, '#a3413a'); R(11, hy - 8, 3, 3, '#f6efe4');
    for (let i = 6; i < 20; i += 3) R(i, hy + 1, 1, 2, '#c24a40');
  }
  if (acc === 5 && dir !== 1){ // flower clip
    const fx = dir === 2 ? 9 : 16; R(fx, hy, 3, 3, '#f6a6c4'); R(fx + 1, hy - 1, 1, 5, '#f6a6c4'); R(fx - 1, hy + 1, 5, 1, '#f6a6c4'); R(fx + 1, hy + 1, 1, 1, '#ffe07a');
  }
}

/* ---------- enter screen ---------- */
function drawAvPrev(){
  const c = $('#avPrev'), g = c.getContext('2d'); c.width = 34; c.height = 44; g.clearRect(0, 0, 34, 44);
  const t = performance.now(), dir = [0, 3, 1, 2][Math.floor(t / 1800) % 4], fr = Math.floor(t / 160) % 4;
  g.fillStyle = 'rgba(60,30,20,.22)'; g.fillRect(10, 40, 14, 2);
  g.drawImage(charSprite(ME, dir, dir === 0 && Math.floor(t / 300) % 9 === 0 ? 4 : fr, 'stand'), 4, 2);
}
function optBtn(box, label, pressed, onclick, paint){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'hair'; b.setAttribute('aria-label', label); b.title = label; b.setAttribute('aria-pressed', pressed);
  const cv = document.createElement('canvas'); cv.width = 26; cv.height = 20; paint(cv.getContext('2d')); b.appendChild(cv); b.onclick = onclick; box.appendChild(b);
}
function buildEnter(){
  const sw = $('#swatches'); sw.innerHTML = '';
  COLORS.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.setAttribute('aria-label', 'สีเสื้อ'); b.setAttribute('aria-pressed', c === ME.color); b.onclick = () => { ME.color = c; ME_COLOR = c; saveMe(); buildEnter(); }; sw.appendChild(b); });
  const head = look => g => g.drawImage(charSprite(look, 0, 0, 'stand'), 0, -5);
  const hs = $('#hairs'); hs.innerHTML = '';
  for (let i = 0; i < HAIRS; i++) optBtn(hs, 'ทรงผม' + HAIR_NAMES[i], i === ME.hair, () => { ME.hair = i; saveMe(); buildEnter(); }, head({ ...ME, hair: i, acc: 0 }));
  const hcs = $('#hcs'); hcs.innerHTML = '';
  HC.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.setAttribute('aria-label', 'สีผม'); b.setAttribute('aria-pressed', i === (ME.hc ?? ME.hair % 4)); b.onclick = () => { ME.hc = i; saveMe(); buildEnter(); }; hcs.appendChild(b); });
  const as = $('#accs'); as.innerHTML = '';
  for (let i = 0; i < ACCS; i++) optBtn(as, ACC_NAMES[i], i === ME.acc, () => { ME.acc = i; saveMe(); buildEnter(); }, head({ ...ME, acc: i }));
  drawAvPrev();
}
setInterval(() => { if (!$('#enter').hidden) drawAvPrev(); }, 160);

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
  if (first) enterLobby(); else { Object.assign(Room.me, { name: ME.name, color: ME.color, hair: ME.hair, hc: ME.hc, acc: ME.acc }); sendPos(true); if (S.chan) S.chan.track({ name: ME.name, color: ME.color }).catch(() => {}); }
  Radio.userGesture();
};
