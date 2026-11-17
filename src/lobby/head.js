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

/* ---------- pixel characters: chibi (head ≈ half the height), modelled on the ChatGPT turnaround sheet ----------
   ~34x48 px, feet at the bottom. Parts are drawn separately so hair style/colour, hoodie colour and accessories stay swappable. */
const SKIN = '#f7d4b5', SKIN_D = '#ebb898', SKIN_S = '#d69c7c', EYE = '#2a2433', EYE_L = '#4d4463', BLUSH = '#f4a3a3';
const SHORTS = '#2b2933', SHORTS_L = '#3e3b48', SHOE = '#efe6d4', SHOE_D = '#cdbfa4', SOLE = '#a5977f', CREAM = '#efe4cc';
const HP = '#2c2b33', HP_L = '#4f4d5a', HP_D = '#1c1b22', HP_PAD = '#3b3a45';
const HC = ['#4a2f22', '#2b2230', '#c27a3a', '#7a4a2e', '#e8c46a', '#d98aa8', '#6f84d6', '#eee4d8'];
const HAIR_NAMES = ['ยุ่ง ๆ', 'ยาว', 'หางม้า', 'บ๊อบ', 'ชี้ฟู', 'ดังโงะ'];
const ACC_NAMES = ['ไม่มี', 'หูฟัง', 'แว่น', 'หูแมว', 'หมวกไหมพรม', 'กิ๊บดอกไม้'];
const HAIRS = HAIR_NAMES.length, ACCS = ACC_NAMES.length;
function shade(hex, k){ const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255; r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k); return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`; }
const hairColor = look => HC[look.hc != null && look.hc >= 0 ? look.hc % HC.length : (look.hair || 0) % 4];
/* draws a character with feet at (x,y). look = {color, hair, hc, acc}; dir 0 down 1 up 2 left 3 right;
   frame 0..3 walk cycle, 4 = blink; pose 'stand' | 'sit' */
function drawChar(g, x, y, look, dir, frame, pose){
  if (dir === 3){ g.save(); g.translate(Math.round(x) * 2, 0); g.scale(-1, 1); drawChar(g, x, y, look, 2, frame, pose); g.restore(); return; }
  const ox = Math.round(x) - 17, oy = Math.round(y) - 48, sit = pose === 'sit';
  const R = (a, b, w, h, c) => { g.fillStyle = c; g.fillRect(ox + a, oy + b, w, h); };
  const E = (cx, cy, rx, ry, c) => { for (let yy = -ry; yy <= ry; yy++){ const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / (ry + .5)) ** 2))); R(cx - hw, cy + yy, hw * 2 + 1, 1, c); } };
  const col = look.color || '#2f3152', colD = shade(col, .74), colS = shade(col, .58), colL = shade(col, 1.18);
  const hc = hairColor(look), hcD = shade(hc, .7), hcS = shade(hc, .52), hcL = shade(hc, 1.45);
  const st = (look.hair || 0) % HAIRS, acc = look.acc || 0;
  const wf = frame < 4 ? frame : 0, blink = frame === 4, bob = !sit && (wf === 1 || wf === 3) ? 1 : 0;
  const hy = (sit ? 7 : 0) + bob, by = 25 + (sit ? 7 : 0) + bob; // head top / hoodie top

  /* ===== behind the body: long hair, ponytail ===== */
  if (dir === 0){
    if (st === 1){ R(5, hy + 14, 5, 17, hc); R(24, hy + 14, 5, 17, hc); R(5, hy + 29, 4, 2, hcD); R(25, hy + 29, 4, 2, hcD); }
    if (st === 2){ R(27, hy + 6, 4, 13, hc); R(28, hy + 18, 3, 3, hcD); }
  }
  if (dir === 2){
    if (st === 1) { R(18, hy + 16, 10, 16, hc); R(19, hy + 30, 8, 2, hcD); }
    if (st === 2){ R(26, hy + 8, 5, 14, hc); R(27, hy + 21, 3, 3, hcD); R(25, hy + 8, 3, 3, col); }
  }

  /* ===== legs ===== */
  if (!sit){
    if (dir === 2){
      const s = wf === 1 ? 1 : wf === 3 ? -1 : 0;
      // back leg first
      R(17 + s * 3, 40, 3, 4, SKIN_D); R(16 + s * 3, 44, 7, 3, SHOE_D); R(16 + s * 3, 46, 7, 1, SOLE);
      R(13 - s * 3, 40, 4, 4, SKIN); R(10 - s * 3, 44, 8, 3, SHOE); R(10 - s * 3, 46, 8, 1, SOLE); R(11 - s * 3, 44, 3, 1, SHOE_D);
    } else {
      const lu = wf === 1 ? 1 : 0, ru = wf === 3 ? 1 : 0;
      R(12, 40, 4, 4 - lu, SKIN); R(18, 40, 4, 4 - ru, SKIN); R(15, 40, 1, 3, SKIN_D); R(21, 40, 1, 3, SKIN_D);
      R(11, 44 - lu, 6, 3, SHOE); R(17, 44 - ru, 6, 3, SHOE); R(11, 46 - lu, 6, 1, SOLE); R(17, 46 - ru, 6, 1, SOLE);
      if (dir === 0){ R(12, 44 - lu, 4, 1, SHOE_D); R(18, 44 - ru, 4, 1, SHOE_D); } else { R(11, 44 - lu, 6, 1, SHOE_D); R(17, 44 - ru, 6, 1, SHOE_D); }
    }
    // shorts
    if (dir === 2){ R(12, 36 + bob, 10, 4, SHORTS); R(12, 36 + bob, 10, 1, SHORTS_L); R(13, 37 + bob, 1, 2, CREAM); }
    else { R(11, 36 + bob, 12, 4, SHORTS); R(11, 36 + bob, 12, 1, SHORTS_L); R(17, 38 + bob, 1, 2, '#1a1820'); if (dir === 0){ R(13, 37 + bob, 1, 2, CREAM); R(21, 37 + bob, 1, 2, CREAM); } }
  } else {
    if (dir === 0){ // cross-legged, sneakers out to the sides
      R(9, 41, 16, 3, SHORTS); R(9, 41, 16, 1, SHORTS_L);
      R(5, 42, 6, 2, SKIN); R(23, 42, 6, 2, SKIN);
      R(2, 43, 8, 4, SHOE); R(24, 43, 8, 4, SHOE); R(2, 46, 8, 1, SOLE); R(24, 46, 8, 1, SOLE); R(3, 43, 4, 1, SHOE_D); R(27, 43, 4, 1, SHOE_D);
    }
    if (dir === 1){ R(9, 43, 16, 3, SHORTS); R(4, 44, 6, 3, SHOE); R(24, 44, 6, 3, SHOE); R(4, 46, 6, 1, SOLE); R(24, 46, 6, 1, SOLE); }
    if (dir === 2){ // hugging the knees
      R(13, 42, 11, 4, SHORTS); R(13, 42, 11, 1, SHORTS_L);
      R(8, 34, 7, 8, SHORTS); R(8, 34, 7, 1, SHORTS_L); // thighs up
      R(7, 39, 5, 5, SKIN); R(7, 39, 1, 5, SKIN_D);
      R(4, 43, 9, 4, SHOE); R(4, 46, 9, 1, SOLE); R(5, 43, 4, 1, SHOE_D);
    }
  }

  /* ===== hoodie ===== */
  if (dir === 2){
    R(11, by, 12, 11, col); R(11, by, 12, 1, colL); R(11, by + 10, 12, 1, colD); R(19, by + 1, 4, 9, colD);
    R(20, by - 1, 5, 6, colD); R(21, by, 3, 4, col); // hood
    R(12, by + 2, 1, 4, CREAM); R(12, by + 6, 1, 1, SHOE_D);
    if (sit){ R(7, by + 3, 10, 4, col); R(7, by + 3, 10, 1, colL); R(7, by + 7, 10, 1, colD); R(6, by + 4, 2, 3, SKIN); } // arms round the knees
    else { const sw = wf === 1 ? -1 : wf === 3 ? 1 : 0; R(14 + sw, by + 1, 5, 9, colS); R(14 + sw, by + 1, 4, 8, col); R(14 + sw, by + 1, 4, 1, colL); R(14 + sw, by + 9, 4, 2, SKIN); }
  } else {
    R(10, by, 14, 11, col); R(9, by + 3, 16, 8, col); R(9, by + 10, 16, 1, colD); R(22, by + 1, 2, 9, colD); R(10, by, 14, 1, colL);
    if (dir === 0){
      R(11, by, 12, 2, colD); R(13, by + 1, 8, 1, colS); R(14, by + 2, 6, 1, colD);
      R(14, by + 2, 1, 4, CREAM); R(19, by + 2, 1, 4, CREAM); R(14, by + 6, 1, 1, SHOE_D); R(19, by + 6, 1, 1, SHOE_D);
      R(12, by + 6, 10, 1, colD); R(12, by + 6, 1, 4, colD); R(21, by + 6, 1, 4, colD);
    } else {
      R(11, by, 12, 5, colD); R(12, by, 10, 4, col); R(12, by + 4, 10, 1, colD); R(13, by, 8, 1, colL); // hood lying on the back
    }
    if (sit && dir === 0){ R(7, by + 2, 3, 8, col); R(24, by + 2, 3, 8, colD); R(10, by + 9, 4, 2, SKIN); R(20, by + 9, 4, 2, SKIN_D); R(9, by + 8, 3, 2, col); R(22, by + 8, 3, 2, colD); }
    else {
      const la = sit ? 0 : wf === 1 ? 1 : wf === 3 ? -1 : 0;
      R(7, by + 1 + la, 3, 9, col); R(24, by + 1 - la, 3, 9, colD); R(7, by + 1 + la, 3, 1, colL);
      R(7, by + 9 + la, 3, 1, colD); R(24, by + 9 - la, 3, 1, colS);
      R(7, by + 10 + la, 3, 2, SKIN); R(24, by + 10 - la, 3, 2, SKIN_D);
    }
  }

  /* ===== head ===== */
  // hair mass
  if (dir === 2){ E(18, hy + 12, 11, 11, hc); R(9, hy + 6, 20, 13, hc); [[10, 2], [15, 0], [22, 1], [27, 5], [29, 11], [28, 17]].forEach(([x, yy]) => R(x, hy + yy, 2, 2, hc)); R(26, hy + 22, 2, 2, hc); }
  else {
    E(17, hy + 12, 12, 11, hc); R(6, hy + 8, 22, 12, hc);
    // fluffy, slightly messy silhouette
    [[8, 3], [12, 1], [22, 1], [25, 3], [4, 8], [29, 8], [4, 14], [29, 14]].forEach(([x, yy]) => R(x, hy + yy, 2, 2, hc));
    if (dir === 0 && st !== 3){ R(6, hy + 21, 2, 2, hc); R(26, hy + 21, 2, 2, hc); R(5, hy + 22, 1, 1, hcD); R(28, hy + 22, 1, 1, hcD); }
  }
  if (dir !== 1){
    if (dir === 0){
      R(10, hy + 12, 14, 10, SKIN); R(11, hy + 22, 12, 1, SKIN); R(12, hy + 23, 10, 1, SKIN_D); R(10, hy + 21, 1, 1, SKIN_D); R(23, hy + 21, 1, 1, SKIN_D);
      R(15, hy + 24, 4, 1, SKIN_S);
      if (blink){ R(11, hy + 18, 4, 1, EYE); R(19, hy + 18, 4, 1, EYE); }
      else {
        R(10, hy + 14, 5, 1, EYE); R(19, hy + 14, 5, 1, EYE);
        R(11, hy + 15, 4, 5, EYE); R(19, hy + 15, 4, 5, EYE); R(11, hy + 18, 4, 2, EYE_L); R(19, hy + 18, 4, 2, EYE_L);
        R(12, hy + 16, 2, 1, '#fff'); R(20, hy + 16, 2, 1, '#fff'); R(14, hy + 18, 1, 1, '#fff'); R(22, hy + 18, 1, 1, '#fff');
      }
      R(10, hy + 20, 2, 1, BLUSH); R(22, hy + 20, 2, 1, BLUSH); R(16, hy + 21, 2, 1, '#c0705e');
    } else {
      R(7, hy + 12, 11, 10, SKIN); R(8, hy + 22, 8, 1, SKIN); R(9, hy + 23, 6, 1, SKIN_D); R(6, hy + 18, 1, 2, SKIN); R(14, hy + 24, 4, 1, SKIN_S);
      if (blink) R(9, hy + 18, 3, 1, EYE);
      else { R(8, hy + 14, 4, 1, EYE); R(9, hy + 15, 3, 5, EYE); R(9, hy + 18, 3, 2, EYE_L); R(10, hy + 16, 1, 1, '#fff'); }
      R(8, hy + 20, 2, 1, BLUSH); R(7, hy + 21, 1, 1, '#c0705e');
      R(16, hy + 15, 2, 3, SKIN_D); R(17, hy + 14, 1, 1, SKIN_D); // ear
    }
  }
  // fringe, locks, shine
  if (dir === 0){
    const straight = st === 3 || st === 5;
    R(9, hy + 9, 16, 4, hc);
    if (straight){ R(9, hy + 13, 16, 1, hc); R(10, hy + 14, 4, 0, hc); }
    else { R(10, hy + 13, 3, 2, hc); R(14, hy + 13, 3, 3, hc); R(18, hy + 13, 3, 2, hc); R(22, hy + 13, 2, 1, hc); R(13, hy + 13, 1, 1, hcD); R(17, hy + 13, 1, 2, hcD); R(21, hy + 13, 1, 1, hcD); }
    R(7, hy + 12, 3, 9, hc); R(8, hy + 21, 2, 2, hc); R(24, hy + 12, 3, 9, hc); R(24, hy + 21, 2, 2, hc);
    if (st === 3){ R(6, hy + 12, 4, 12, hc); R(24, hy + 12, 4, 12, hc); R(6, hy + 23, 4, 1, hcD); R(24, hy + 23, 4, 1, hcD); }
    R(11, hy + 4, 6, 1, hcL); R(19, hy + 5, 4, 1, hcL); R(9, hy + 7, 2, 1, hcL); R(12, hy + 3, 3, 1, hcL); R(14, hy + 6, 2, 2, hcL); R(20, hy + 7, 2, 1, hcL);
    R(8, hy + 10, 1, 3, hcD); R(25, hy + 10, 1, 3, hcD); R(11, hy + 9, 1, 3, hcD); R(16, hy + 8, 1, 4, hcD); R(21, hy + 9, 1, 3, hcD);
  } else if (dir === 1){
    R(6, hy + 19, 22, 3, hc); R(8, hy + 22, 4, 1, hc); R(14, hy + 22, 6, 2, hc); R(22, hy + 22, 4, 1, hc);
    [10, 14, 19, 23].forEach((x, i) => R(x, hy + 9 + (i % 2) * 2, 1, 10, hcD)); R(11, hy + 4, 6, 1, hcL); R(18, hy + 6, 4, 1, hcL); R(9, hy + 8, 2, 1, hcL);
    if (st === 1){ R(7, hy + 21, 20, 11, hc); [10, 15, 20, 24].forEach(x => R(x, hy + 22, 1, 9, hcD)); R(8, hy + 31, 18, 1, hcD); }
    if (st === 2){ R(15, hy + 20, 5, 12, hc); R(15, hy + 19, 5, 2, col); R(16, hy + 30, 3, 2, hcD); }
    if (st === 3){ R(6, hy + 21, 22, 3, hc); R(6, hy + 23, 22, 1, hcD); }
  } else {
    R(7, hy + 9, 12, 4, hc); R(8, hy + 13, 2, 2, hc); R(11, hy + 13, 3, 3, hc); R(15, hy + 13, 3, 1, hc);
    R(17, hy + 12, 11, 10, hc); R(19, hy + 22, 7, 2, hc); R(22, hy + 9, 1, 10, hcD); R(26, hy + 10, 1, 8, hcD);
    R(12, hy + 3, 6, 1, hcL); R(20, hy + 4, 4, 1, hcL);
    if (st === 3){ R(17, hy + 20, 11, 4, hc); R(17, hy + 23, 11, 1, hcD); }
  }
  // ahoge + style extras on top
  if (st !== 5 && acc !== 4){ R(17, hy - 1, 1, 2, hc); R(18, hy - 2, 2, 1, hc); R(16, hy + 1, 2, 1, hc); }
  if (st === 4){ [[7, 1], [11, -1], [22, 0], [26, 2]].forEach(([x, yy]) => { R(x, hy + yy, 3, 3, hc); R(x + 1, hy + yy - 1, 1, 1, hc); }); R(4, hy + 9, 3, 2, hc); R(27, hy + 9, 3, 2, hc); }
  if (st === 5){
    if (dir === 2){ E(23, hy + 1, 4, 4, hc); R(21, hy, 3, 1, hcL); }
    else { E(8, hy + 2, 4, 4, hc); E(26, hy + 2, 4, 4, hc); R(6, hy, 3, 1, hcL); R(24, hy, 3, 1, hcL); }
  }

  /* ===== accessories ===== */
  if (acc === 1){ // big over-ear headphones
    if (dir === 2){
      R(19, hy + 1, 4, 11, HP); R(20, hy + 2, 1, 9, HP_L); R(14, hy, 7, 2, HP);
      E(20, hy + 16, 5, 5, HP); E(20, hy + 16, 3, 3, HP_L); E(20, hy + 16, 2, 2, HP_PAD); R(20, hy + 16, 1, 1, HP_D);
    } else {
      R(9, hy + 1, 16, 2, HP); R(11, hy + 1, 8, 1, HP_L); R(7, hy + 3, 2, 3, HP); R(25, hy + 3, 2, 3, HP); R(6, hy + 6, 2, 6, HP); R(26, hy + 6, 2, 6, HP);
      R(3, hy + 12, 6, 9, HP); R(4, hy + 11, 4, 1, HP); R(4, hy + 21, 4, 1, HP); R(4, hy + 12, 1, 8, HP_L); R(7, hy + 12, 2, 9, HP_PAD);
      R(25, hy + 12, 6, 9, HP); R(26, hy + 11, 4, 1, HP); R(26, hy + 21, 4, 1, HP); R(29, hy + 12, 1, 8, HP_L); R(25, hy + 12, 2, 9, HP_PAD);
      if (dir === 0){ R(5, hy + 13, 1, 2, '#e8a0c8'); R(28, hy + 13, 1, 2, '#e8a0c8'); }
    }
  }
  if (acc === 2 && dir !== 1){ const F = '#3a2d2a';
    if (dir === 0){ [10, 18].forEach(x => { R(x, hy + 14, 6, 1, F); R(x, hy + 20, 6, 1, F); R(x, hy + 14, 1, 7, F); R(x + 5, hy + 14, 1, 7, F); }); R(16, hy + 16, 2, 1, F); }
    else { R(8, hy + 14, 5, 1, F); R(8, hy + 20, 5, 1, F); R(12, hy + 14, 1, 7, F); R(8, hy + 14, 1, 7, F); R(13, hy + 16, 4, 1, F); }
  }
  if (acc === 3){ const ear = x => { for (let i = 0; i < 5; i++) R(x + (i >> 1), hy - 3 + i, 6 - (i >> 1) * 2, 1, hc); R(x + 2, hy - 1, 2, 2, BLUSH); };
    if (dir === 2){ ear(10); ear(20); } else { ear(6); ear(22); } }
  if (acc === 4){ const bc = '#c95a4e', bl = '#e27a6c', bd = '#9e4038';
    E(17, hy + 6, 12, 7, bc); R(5, hy + 7, 24, 4, bl); R(5, hy + 10, 24, 1, bd); for (let i = 6; i < 28; i += 3) R(i, hy + 7, 1, 3, bd);
    E(17, hy - 2, 3, 3, '#f6efe4'); R(16, hy - 3, 2, 1, '#fff'); R(9, hy + 2, 5, 1, bl); }
  if (acc === 5 && dir !== 1){ const fx = dir === 2 ? 10 : 22, fy = hy + 6; R(fx, fy, 4, 4, '#f6a6c4'); R(fx + 1, fy - 1, 2, 6, '#f6a6c4'); R(fx - 1, fy + 1, 6, 2, '#f6a6c4'); R(fx + 1, fy + 1, 2, 2, '#ffe07a'); }
}

/* ---------- enter screen ---------- */
function drawAvPrev(){
  const c = $('#avPrev'), g = c.getContext('2d'); c.width = 40; c.height = 56; g.clearRect(0, 0, 40, 56);
  const t = performance.now(), dir = [0, 3, 1, 2][Math.floor(t / 1800) % 4], fr = Math.floor(t / 160) % 4;
  g.fillStyle = 'rgba(60,30,20,.22)'; g.fillRect(11, 51, 18, 2);
  g.drawImage(charSprite(ME, dir, dir === 0 && Math.floor(t / 300) % 9 === 0 ? 4 : fr, 'stand'), 2, 2);
}
function optBtn(box, label, pressed, onclick, paint){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'hair'; b.setAttribute('aria-label', label); b.title = label; b.setAttribute('aria-pressed', pressed);
  const cv = document.createElement('canvas'); cv.width = 34; cv.height = 28; paint(cv.getContext('2d')); b.appendChild(cv); b.onclick = onclick; box.appendChild(b);
}
function buildEnter(){
  const sw = $('#swatches'); sw.innerHTML = '';
  COLORS.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.setAttribute('aria-label', 'สีเสื้อ'); b.setAttribute('aria-pressed', c === ME.color); b.onclick = () => { ME.color = c; ME_COLOR = c; saveMe(); buildEnter(); }; sw.appendChild(b); });
  const head = look => g => g.drawImage(charSprite(look, 0, 0, 'stand'), -1, -2);
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
