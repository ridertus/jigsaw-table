/* ---------- online + app ---------- */
const SB_URL = 'https://slbgazdgvhjqhwwjifus.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsYmdhemRndmhqcWh3d2ppZnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzE1MjYsImV4cCI6MjEwODQ0NzUyNn0.dNpq38nOC6cYS1mgpo9tBbgWaD8riTo0CqXUMHehSGM';
const sb = (window.supabase && window.supabase.createClient) ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 25 } } }) : null;

const LS = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
const COLORS = ['#e8728c', '#2fa79b', '#e8932c', '#7c6cf0', '#3f92d8', '#c95fd0', '#4fae55', '#d9573f'];
let ME = LS.get('jt-me', null);
if (!ME || !ME.id){ ME = { id: Math.random().toString(36).slice(2, 10), name: '' }; LS.set('jt-me', ME); }
const colorOf = k => COLORS[[...String(k)].reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7) % COLORS.length];
const ME_COLOR = colorOf(ME.id);

let toastT = 0;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function busy(msg){ $('#busy').hidden = !msg; if (msg) $('#busyMsg').textContent = msg; }
const fmtT = s => s >= 3600 ? Math.floor(s / 3600) + ':' + fmt(s % 3600) : fmt(s);
function hashStr(s){ let h = 2166136261; for (const ch of s){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const S = { game: false, pieces: [], W: 0, H: 0, filterEdges: false, ghost: LS.get('jt-ghost', false), chan: null, players: [], connected: false };
const remoteEl = $('#remote');

/* ---------- home ---------- */
const pick = { src: null, count: 48, cols: 0, rows: 0, E: null };
const prev = $('#prev');
function refreshPick(){
  const ar = pick.src.width / pick.src.height;
  [pick.cols, pick.rows] = gridFor(pick.count, ar);
  pick.E = makeEdges(pick.cols, pick.rows);
  renderChips(); drawPreview();
  const n = pick.cols * pick.rows;
  $('#gridHint').textContent = `รูปนี้จะได้ ${pick.cols} × ${pick.rows} = ${n} ชิ้น` + (n !== pick.count ? ` (ปรับจาก ${pick.count} ให้ชิ้นออกมาเป็นสี่เหลี่ยมพอดีรูป)` : '');
  $('#startBtn').textContent = `สร้างห้อง · ${n} ชิ้น`;
}
function renderChips(){
  const ar = pick.src.width / pick.src.height, box = $('#counts'); box.innerHTML = '';
  COUNTS.forEach(n => {
    const [c, r] = gridFor(n, ar), b = document.createElement('button');
    b.className = 'chip'; b.setAttribute('aria-pressed', n === pick.count);
    b.innerHTML = `<b>${c * r}</b><small>${c} × ${r}</small>`;
    b.onclick = () => { pick.count = n; $('#customN').value = ''; refreshPick(); };
    box.appendChild(b);
  });
}
$('#customN').addEventListener('input', e => {
  const n = parseInt(e.target.value, 10);
  if (!n || n < 4){ $('#gridHint').textContent = 'ใส่อย่างน้อย 4 ชิ้น'; return; }
  pick.count = Math.min(MAXN, n); if (n > MAXN) e.target.value = MAXN;
  refreshPick();
});
function drawPreview(){
  if (!pick.src || $('#setup').hidden) return;
  const wrap = $('#prevWrap'), maxW = Math.max(200, wrap.clientWidth - 16), maxH = Math.min(420, window.innerHeight * .46);
  const ar = pick.src.width / pick.src.height;
  let w = maxW, h = w / ar; if (h > maxH){ h = maxH; w = h * ar; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  prev.width = Math.round(w * dpr); prev.height = Math.round(h * dpr); prev.style.width = w + 'px'; prev.style.height = h + 'px';
  const g = prev.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(pick.src, 0, 0, w, h);
  const cw = w / pick.cols, ch = h / pick.rows, E = pick.E;
  const strokeAll = () => {
    for (let r = 1; r < pick.rows; r++) for (let c = 0; c < pick.cols; c++){ const p = edgePts(E, 'h', r, c, cw, ch); g.beginPath(); g.moveTo(p[0][0], p[0][1]); trace(g, p, false); g.stroke(); }
    for (let r = 0; r < pick.rows; r++) for (let c = 1; c < pick.cols; c++){ const p = edgePts(E, 'v', r, c, cw, ch); g.beginPath(); g.moveTo(p[0][0], p[0][1]); trace(g, p, false); g.stroke(); }
  };
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,20,10,.35)'; g.lineWidth = 3; strokeAll();
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 1.3; strokeAll();
}
function loadFile(file){
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { pick.src = toSrc(img); URL.revokeObjectURL(url); refreshPick(); };
  img.onerror = () => { URL.revokeObjectURL(url); homeErr('เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น'); };
  img.src = url;
}
$('#file').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
$('#sampleBtn').onclick = () => { pick.src = paintSample(); refreshPick(); };

const homeErr = m => { $('#homeErr').textContent = m || ''; };
$('#nick').value = ME.name || '';
$('#nick').addEventListener('input', () => { ME.name = $('#nick').value.trim().slice(0, 16); LS.set('jt-me', ME); homeErr(''); });
function needName(){
  const n = $('#nick').value.trim();
  if (!n){ homeErr('ใส่ชื่อเล่นก่อน เพื่อนจะได้เห็นว่าใครกำลังต่อชิ้นไหน'); $('#nick').focus(); return false; }
  ME.name = n.slice(0, 16); LS.set('jt-me', ME); return true;
}
function needNet(){ if (sb) return true; homeErr('โหลดระบบออนไลน์ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง'); return false; }

function compress(src){
  const m = Math.min(1, 1400 / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * m); c.height = Math.round(src.height * m);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/jpeg', .82);
  if (url.length > 3500000) url = c.toDataURL('image/jpeg', .6);
  return { canvas: c, url };
}
$('#startBtn').onclick = async () => {
  audioInit(); homeErr('');
  if (!needName() || !needNet()) return;
  let pass = null;
  if ($('#passOpt').checked){
    pass = $('#passNew').value.trim();
    if (pass.length < 4){ homeErr('รหัสผ่านต้องมีอย่างน้อย 4 ตัว'); $('#passNew').focus(); return; }
  }
  busy('กำลังสร้างห้อง…');
  const up = compress(pick.src);
  try {
    const { data, error } = await sb.rpc('create_room', { p_image: up.url, p_thumb: thumbOf(up.canvas, 240, .7), p_cols: pick.cols, p_rows: pick.rows, p_edges: pick.E,
      p_rotate: $('#rotOpt').checked, p_name: $('#roomName').value.trim() || null, p_host: ME.name, p_pass: pass });
    if (error || !data) throw error || new Error('no code');
    if (pass) savePass(data, pass);
    await joinRoom(data, up.canvas);
  } catch(e){ busy(); homeErr('สร้างห้องไม่สำเร็จ ลองเช็กอินเทอร์เน็ตแล้วกดใหม่อีกครั้ง'); }
};
const cleanCode = v => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
$('#joinCode').addEventListener('input', e => { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; });
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
$('#joinBtn').onclick = () => {
  audioInit(); homeErr('');
  const code = cleanCode($('#joinCode').value);
  if (code.length !== 6){ homeErr('รหัสห้องมี 6 ตัว ลองเช็กอีกครั้ง'); $('#joinCode').focus(); return; }
  if (!needName() || !needNet()) return;
  joinRoom(code);
};
$('#passOpt').addEventListener('change', e => { $('#passNew').hidden = !e.target.checked; if (e.target.checked) $('#passNew').focus(); });
const getPass = code => LS.get('jt-pass', {})[code] || null;
function savePass(code, pass){ const m = LS.get('jt-pass', {}); if (pass) m[code] = pass; else delete m[code]; LS.set('jt-pass', m); }
function thumbOf(canvas, size, q){ const t = document.createElement('canvas'), k = size / Math.max(canvas.width, canvas.height); t.width = Math.round(canvas.width * k); t.height = Math.round(canvas.height * k); t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', q); }

/* lobby */
const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
function ago(t){ const m = Math.round((Date.now() - Date.parse(t)) / 60000); if (m < 2) return 'เพิ่งเล่น'; if (m < 60) return `${m} นาทีที่แล้ว`; const h = Math.round(m / 60); if (h < 24) return `${h} ชม.ที่แล้ว`; return `${Math.round(h / 24)} วันที่แล้ว`; }
async function loadLobby(){
  const box = $('#lobby');
  if (!sb){ box.innerHTML = '<p class="note">โหลดรายการห้องไม่ได้</p>'; return; }
  try {
    const { data, error } = await sb.rpc('list_rooms');
    if (error) throw error;
    box.innerHTML = '';
    if (!data || !data.length){ box.innerHTML = '<p class="note">ยังไม่มีห้องที่เปิดอยู่ สร้างห้องแรกด้านล่างได้เลย</p>'; return; }
    data.forEach(r => {
      const b = document.createElement('button'); b.className = 'lr';
      b.innerHTML = (r.thumb ? '<img class="th" alt="">' : `<div class="th">${LOCK_SVG}</div>`) + '<b></b><small class="s1"></small><div class="bar2"><i></i></div><small class="s2"></small>' + (r.locked ? `<span class="lock" title="มีรหัสผ่าน">${LOCK_SVG}</span>` : '');
      if (r.thumb) b.querySelector('img').src = r.thumb;
      b.querySelector('b').textContent = r.name || (r.host ? `ห้องของ ${r.host}` : `ห้อง ${r.code}`);
      b.querySelector('.s1').textContent = `${r.placed} / ${r.total} ชิ้น` + (r.rotate ? ' · ยาก' : '');
      b.querySelector('.bar2 i').style.width = Math.round(r.placed / r.total * 100) + '%';
      b.querySelector('.s2').textContent = `${r.code} · ${ago(r.active_at)}`;
      b.setAttribute('aria-label', `${b.querySelector('b').textContent}${r.locked ? ' มีรหัสผ่าน' : ''}`);
      b.onclick = () => { audioInit(); homeErr(''); if (needName() && needNet()) joinRoom(r.code); };
      box.appendChild(b);
    });
  } catch(e){ box.innerHTML = '<p class="note">โหลดรายการห้องไม่ได้ ลองกดรีเฟรช</p>'; }
}
$('#lobbyRefresh').onclick = loadLobby;

/* password dialog */
let passCb = null;
function askPass(code, info, wrong){
  return new Promise(res => {
    passCb = res;
    $('#pbInfo').textContent = info;
    $('#passErr').textContent = wrong ? 'รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง' : '';
    $('#passIn').value = ''; $('#passBox').hidden = false; setTimeout(() => $('#passIn').focus(), 30);
  });
}
function closePass(v){ $('#passBox').hidden = true; const cb = passCb; passCb = null; if (cb) cb(v); }
$('#passForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#passIn').value.trim(); if (!v){ $('#passErr').textContent = 'ใส่รหัสผ่านก่อน'; return; } closePass(v); });
$('#passCancel').onclick = () => closePass(null);

function renderRecent(){
  const list = LS.get('jt-recent', []), box = $('#recent'); box.innerHTML = '';
  $('#recentWrap').hidden = !list.length;
  list.forEach(r => {
    const b = document.createElement('button'); b.className = 'rc';
    const d = new Date(r.at);
    b.innerHTML = `<img alt=""><b></b><small></small>`;
    b.querySelector('img').src = r.thumb || '';
    b.querySelector('b').textContent = r.code;
    b.querySelector('small').textContent = r.done ? 'ต่อเสร็จแล้ว' : `${d.getDate()}/${d.getMonth() + 1}`;
    b.onclick = () => { audioInit(); homeErr(''); if (needName() && needNet()) joinRoom(r.code); };
    box.appendChild(b);
  });
}
function remember(code, canvas, done){
  let list = LS.get('jt-recent', []);
  const old = list.find(r => r.code === code);
  let thumb = old && old.thumb;
  if (!thumb) thumb = thumbOf(canvas, 120, .6);
  list = [{ code, thumb, at: Date.now(), done: !!done }].concat(list.filter(r => r.code !== code)).slice(0, 8);
  LS.set('jt-recent', list);
}
const loadCanvas = url => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); res(c); }; img.onerror = rej; img.src = url; });

async function joinRoom(code, canvas){
  let pass = getPass(code), wrong = false, res;
  try {
    for (;;){
      busy('กำลังเข้าห้อง…');
      const { data, error } = await sb.rpc('open_room', { p_code: code, p_pass: pass });
      if (error) throw error;
      res = data;
      if (res.status === 'ok') break;
      busy();
      if (res.status === 'not_found'){ savePass(code, null); homeErr(`ไม่พบห้องรหัส ${code} ลองเช็กรหัสอีกครั้ง`); return; }
      if (res.status === 'wrong_password') savePass(code, null);
      pass = await askPass(code, `ใส่รหัสผ่านเพื่อเข้าห้อง ${code}`, res.status === 'wrong_password' && pass != null);
      if (pass == null) return;
    }
    if (pass) savePass(code, pass);
    const room = res.room, rows = res.pieces;
    S.pass = pass;
    const cv = canvas || await loadCanvas(room.image);
    remember(code, cv, !!room.done_at);
    try { history.replaceState(null, '', location.pathname + '?r=' + code); } catch(e){}
    busy();
    startGame(room, cv, rows || []);
    connect(code);
  } catch(e){ busy(); homeErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองเช็กอินเทอร์เน็ตแล้วลองใหม่'); }
}

function showHome(){
  $('#game').hidden = true; $('#setup').hidden = false; $('#inviteBox').hidden = true;
  renderRecent(); drawPreview(); loadLobby();
}

/* ---------- game ---------- */
function startGame(room, canvas, rows){
  S.room = room; S.code = room.code; S.src = canvas; S.cols = room.cols; S.rows = room.rows; S.E = room.edges; S.rotate = room.rotate;
  S.created = Date.parse(room.created_at); S.doneAt = room.done_at ? Date.parse(room.done_at) : null; S.doneShown = false;
  $('#ghost').src = $('#full').src = $('#refImg').src = room.image;
  placedEl.innerHTML = ''; looseEl.innerHTML = ''; remoteEl.innerHTML = ''; tray.innerHTML = '';
  $('#done').hidden = true; $('#full').classList.remove('show');
  board.querySelectorAll('.conf').forEach(n => n.remove());
  S.pieces = [];
  for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++){
    const id = r * S.cols + c, el = document.createElement('canvas'), slot = document.createElement('div');
    el.dataset.id = id; slot.className = 'slot gone'; slot.dataset.id = id;
    S.pieces.push({ id, r, c, el, slot, where: null, deg: 0, srv: { state: 'tray', fx: 0, fy: 0, rot: 0 }, holder: null, rpos: null, tag: null, inflight: 0, lastRow: null,
      edge: r === 0 || c === 0 || r === S.rows - 1 || c === S.cols - 1 });
  }
  const R = rng(hashStr(S.code)), order = S.pieces.map(p => p.id);
  for (let i = order.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.forEach(id => tray.appendChild(S.pieces[id].slot));
  rows.forEach(r => { const p = S.pieces[r.id]; if (p) p.srv = { state: r.state, fx: r.fx, fy: r.fy, rot: r.rot }; });
  S.pieces.forEach(p => p.deg = p.srv.rot * 90);
  S.game = true; S.filterEdges = false;
  $('#setup').hidden = true; $('#game').hidden = false;
  setPressed('#tGhost', S.ghost); setPressed('#tEdge', false); setPressed('#tRef', false); $('#ref').hidden = true;
  board.classList.toggle('ghost-on', S.ghost);
  S.players = [{ key: ME.id, name: ME.name, color: ME_COLOR, me: true }]; renderPlayers();
  S.W = 0; layout(); S.pieces.forEach(p => show(p)); applyFilter(); updateProg(); tickTime(); tray.scrollLeft = 0;
  if (allPlaced()) complete(true);
}

function layout(){
  if (!S.game || $('#game').hidden) return;
  const area = $('#boardArea'), aw = area.clientWidth - 2 * FRAME - 6, ah = area.clientHeight - 2 * FRAME - 6;
  const ar = S.src.width / S.src.height;
  let W = aw, H = W / ar; if (H > ah){ H = ah; W = H * ar; }
  W = Math.max(120, Math.floor(W)); H = Math.max(90, Math.floor(H));
  if (W === S.W && H === S.H) return;
  S.W = W; S.H = H; S.cw = W / S.cols; S.ch = H / S.rows; S.pad = Math.ceil(Math.min(S.cw, S.ch) * .28);
  board.style.width = W + 'px'; board.style.height = H + 'px';
  const sq = Math.max(18, Math.round(Math.min(S.cw, S.ch) / 2)) * 2;
  board.style.backgroundSize = sq + 'px ' + sq + 'px';
  S.slotSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot')) || 76;
  S.pieces.forEach(renderPiece);
}

function renderPiece(p){
  const { cw, ch, pad } = S, pw = cw + 2 * pad, ph = ch + 2 * pad, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = p.el; cv.width = Math.ceil(pw * dpr); cv.height = Math.ceil(ph * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, pw, ph);
  const ox = p.c * cw - pad, oy = p.r * ch - pad; g.translate(-ox, -oy);
  g.save(); piecePath(g, S.E, p.r, p.c, cw, ch); g.clip();
  const kx = S.src.width / S.W, ky = S.src.height / S.H;
  const x0 = Math.max(0, ox), y0 = Math.max(0, oy), x1 = Math.min(S.W, ox + pw), y1 = Math.min(S.H, oy + ph);
  g.drawImage(S.src, x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, y0, x1 - x0, y1 - y0);
  const lw = Math.max(1.2, Math.min(cw, ch) * .022);
  g.lineWidth = lw * 1.5; g.lineJoin = 'round';
  g.save(); g.translate(lw * .6, lw * .6); piecePath(g, S.E, p.r, p.c, cw, ch); g.strokeStyle = 'rgba(255,255,255,.3)'; g.stroke(); g.restore();
  g.save(); g.translate(-lw * .6, -lw * .6); piecePath(g, S.E, p.r, p.c, cw, ch); g.strokeStyle = 'rgba(40,20,10,.2)'; g.stroke(); g.restore();
  g.restore();
  p.pw = pw; p.ph = ph; p.tx = ox; p.ty = oy;
  sizeFor(p); posTag(p);
}
function sizeFor(p){
  const st = p.el.style;
  if (p.where === 'tray'){
    const f = (S.slotSize - 4) / Math.max(p.pw, p.ph);
    st.width = p.pw * f + 'px'; st.height = p.ph * f + 'px'; st.left = st.top = ''; st.transform = `rotate(${p.deg}deg)`;
    return;
  }
  st.width = p.pw + 'px'; st.height = p.ph + 'px';
  if (p.where === 'placed'){ st.left = p.tx + 'px'; st.top = p.ty + 'px'; st.transform = ''; }
  else if (p.where === 'loose' || p.where === 'remote'){
    const q = p.where === 'loose' ? p.srv : p.rpos;
    st.left = (q.fx * S.W - p.pw / 2) + 'px'; st.top = (q.fy * S.H - p.ph / 2) + 'px'; st.transform = `rotate(${p.deg}deg)`;
  } else if (p.where === 'drag'){ st.left = '0px'; st.top = '0px'; }
}
const nearDeg = (cur, rot) => cur + ((((rot * 90 - cur) % 360) + 540) % 360 - 180);

/* put a piece where the shared state says it is */
function show(p, sound){
  if (drag && drag.p === p) return;
  const prevW = p.where;
  const w = (p.holder && p.rpos && p.srv.state !== 'placed') ? 'remote' : p.srv.state;
  p.deg = nearDeg(p.deg, w === 'placed' ? 0 : w === 'remote' ? p.rpos.rot : p.srv.rot);
  p.where = w;
  const el = p.el, parent = w === 'tray' ? p.slot : w === 'loose' ? looseEl : w === 'placed' ? placedEl : remoteEl;
  el.className = 'piece' + (w === 'tray' ? '' : ' ' + w);
  if (el.parentNode !== parent){ el.style.transition = 'none'; parent.appendChild(el); sizeFor(p); void el.offsetWidth; el.style.transition = ''; }
  else { if (w === 'loose') parent.appendChild(el); sizeFor(p); }
  p.slot.classList.toggle('gone', w !== 'tray');
  p.slot.classList.toggle('held', w === 'tray' && !!p.holder);
  if (w === 'placed' && prevW && prevW !== 'placed'){ el.classList.add('flash'); if (sound) sfxSnap(); }
  if (w === 'remote'){
    if (!p.tag){ p.tag = document.createElement('div'); p.tag.className = 'tag'; remoteEl.appendChild(p.tag); }
    p.tag.textContent = p.holder.name || 'เพื่อน'; p.tag.style.background = p.holder.color; posTag(p);
  } else if (p.tag){ p.tag.remove(); p.tag = null; }
}
function posTag(p){ if (p.tag && p.rpos){ p.tag.style.left = p.rpos.fx * S.W + 'px'; p.tag.style.top = (p.rpos.fy * S.H - p.ph / 2 + S.pad * .5) + 'px'; } }

/* ---------- hit test for pieces resting on the board ---------- */
function looseAt(x, y){
  const br = board.getBoundingClientRect(), bx = x - br.left, by = y - br.top;
  const kids = looseEl.children;
  for (let i = kids.length - 1; i >= 0; i--){
    const p = S.pieces[+kids[i].dataset.id];
    if (p.holder) continue;
    const dx = bx - p.srv.fx * S.W, dy = by - p.srv.fy * S.H, a = -p.srv.rot * Math.PI / 2;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= S.cw / 2 + S.pad * .6 && Math.abs(ly) <= S.ch / 2 + S.pad * .6) return p;
  }
  return null;
}

/* ---------- pointer input ---------- */
let pend = null, drag = null;
tray.addEventListener('pointerdown', e => {
  const slot = e.target.closest('.slot'); if (!slot || drag || pend || e.button > 0) return;
  const p = S.pieces[+slot.dataset.id];
  if (p.srv.state !== 'tray') return;
  audioInit();
  if (p.holder){ toast(`${p.holder.name || 'เพื่อน'} กำลังถือชิ้นนี้อยู่`); return; }
  pend = { p, from: 'tray', id: e.pointerId, x0: e.clientX, y0: e.clientY, type: e.pointerType };
  if (e.pointerType === 'mouse') e.preventDefault();
});
$('#boardArea').addEventListener('pointerdown', e => {
  if (drag || pend || e.button > 0 || !S.game || S.doneShown) return;
  const p = looseAt(e.clientX, e.clientY); if (!p) return;
  audioInit(); e.preventDefault();
  pend = { p, from: 'loose', id: e.pointerId, x0: e.clientX, y0: e.clientY, type: e.pointerType };
});
window.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.id){ drag.x = e.clientX; drag.y = e.clientY; place(); sendDrag(); e.preventDefault(); return; }
  if (pend && e.pointerId === pend.id){
    const dx = e.clientX - pend.x0, dy = e.clientY - pend.y0;
    if (Math.hypot(dx, dy) < 8) return;
    if (pend.from === 'tray' && pend.type !== 'mouse' && Math.abs(dx) > Math.abs(dy) * 1.3){ pend = null; return; }
    if (pend.p.holder){ pend = null; return; }
    startDrag(e);
  }
}, { passive: false });
window.addEventListener('pointerup', e => {
  if (pend && e.pointerId === pend.id){ const p = pend.p; pend = null; if (S.rotate) turn(p); return; }
  if (drag && e.pointerId === drag.id) drop();
});
window.addEventListener('pointercancel', e => { if (pend && e.pointerId === pend.id) pend = null; if (drag && e.pointerId === drag.id) cancelDrag(false); });
document.addEventListener('touchmove', e => {
  if (drag){ e.preventDefault(); return; }
  if (pend && e.touches[0]){ const t = e.touches[0]; if (pend.from === 'loose' || Math.abs(t.clientY - pend.y0) > Math.abs(t.clientX - pend.x0)) e.preventDefault(); }
}, { passive: false });

/* a drag must always end: capture the pointer on the page itself, and settle any drag whose end event got lost */
function settleDrag(){ if (drag) drop(); }
document.documentElement.addEventListener('lostpointercapture', e => { if (drag && e.target === document.documentElement && e.pointerId === drag.id) settleDrag(); });
document.addEventListener('touchend', e => { if (drag && e.touches.length === 0) settleDrag(); });
document.addEventListener('touchcancel', e => { if (drag && e.touches.length === 0) settleDrag(); });
window.addEventListener('blur', () => { if (drag) cancelDrag(false); pend = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden && drag) cancelDrag(false); });
document.addEventListener('pointerdown', e => { if (drag && e.pointerId !== drag.id) settleDrag(); }, true);

function startDrag(e){
  const p = pend.p, from = pend.from;
  drag = { p, from, id: pend.id, x: e.clientX, y: e.clientY, gx: 0, gy: 0, sent: 0 };
  if (from === 'tray') drag.gy = pend.type === 'mouse' ? 0 : Math.min(70, p.ph * .45);
  else { const br = board.getBoundingClientRect(); drag.gx = pend.x0 - (br.left + p.srv.fx * S.W); drag.gy = pend.y0 - (br.top + p.srv.fy * S.H); }
  pend = null;
  p.where = 'drag'; p.el.className = 'piece dragging'; sizeFor(p); dragLayer.appendChild(p.el);
  p.slot.classList.add('gone');
  try { document.documentElement.setPointerCapture(drag.id); } catch(err){}
  document.body.classList.add('is-dragging'); place(); sfxPick();
  setHold(p.id); sendDrag(true);
}
function place(){ const p = drag.p; p.el.style.transform = `translate3d(${drag.x - drag.gx - p.pw / 2}px, ${drag.y - drag.gy - p.ph / 2}px, 0) rotate(${p.deg}deg)`; }
function dragPos(){ const br = board.getBoundingClientRect(); return { bx: drag.x - drag.gx - br.left, by: drag.y - drag.gy - br.top }; }
let dragTimer = 0;
function sendDrag(now){
  if (!S.chan || !drag) return;
  const t = performance.now();
  if (!now && t - drag.sent < 90){ clearTimeout(dragTimer); dragTimer = setTimeout(() => sendDrag(true), 95); return; }
  drag.sent = t;
  const { bx, by } = dragPos(), p = drag.p;
  S.chan.send({ type: 'broadcast', event: 'drag', payload: { id: p.id, fx: +(bx / S.W).toFixed(4), fy: +(by / S.H).toFixed(4), rot: p.srv.rot, k: ME.id, name: ME.name, color: ME_COLOR } });
}
function endDrag(){ clearTimeout(dragTimer); drag = null; document.body.classList.remove('is-dragging'); setHold(null); }

function drop(){
  const p = drag.p, shelf = $('.shelf').getBoundingClientRect();
  const { bx, by } = dragPos();
  let res, snapped = false;
  if (drag.y > shelf.top + 4) res = { ...p.srv, state: 'tray' };
  else {
    const hx = (p.c + .5) * S.cw, hy = (p.r + .5) * S.ch, thr = Math.max(18, Math.min(S.cw, S.ch) * .4);
    if (p.srv.rot === 0 && Math.hypot(bx - hx, by - hy) < thr){ res = { state: 'placed', fx: hx / S.W, fy: hy / S.H, rot: 0 }; snapped = true; }
    else res = { state: 'loose', fx: clamp(bx, 0, S.W) / S.W, fy: clamp(by, 0, S.H) / S.H, rot: p.srv.rot };
  }
  endDrag();
  p.srv = res;
  if (snapped){
    show(p, true);
    const hx = (p.c + .5) * S.cw, hy = (p.r + .5) * S.ch;
    p.el.style.transition = 'none'; p.el.style.transform = `translate(${bx - hx}px, ${by - hy}px)`;
    void p.el.offsetWidth; p.el.style.transition = ''; p.el.style.transform = '';
  } else {
    show(p);
    if (res.state === 'loose') sfxSet();
    if (res.state === 'tray'){ p.slot.classList.remove('back'); void p.slot.offsetWidth; p.slot.classList.add('back'); p.slot.hidden = S.filterEdges && !p.edge; }
  }
  sendRelease(p); write(p); updateProg(); checkDone();
}
function cancelDrag(conflict){
  const p = drag.p; endDrag(); show(p);
  if (conflict) toast('เพื่อนหยิบชิ้นนี้ไปก่อนแล้ว');
}
function turn(p){
  if (p.holder || p.srv.state === 'placed' || p.srv.state === 'remote') return;
  const rot = (p.srv.rot + 1) % 4;
  p.srv = { ...p.srv, rot };
  if (p.srv.state === 'loose' && rot === 0){
    const hx = (p.c + .5) * S.cw, hy = (p.r + .5) * S.ch, thr = Math.max(18, Math.min(S.cw, S.ch) * .4);
    if (Math.hypot(p.srv.fx * S.W - hx, p.srv.fy * S.H - hy) < thr) p.srv = { state: 'placed', fx: hx / S.W, fy: hy / S.H, rot: 0 };
  }
  sfxTurn(); show(p, true); sendRelease(p); write(p); updateProg(); checkDone();
}

/* ---------- shared state ---------- */
async function write(p){
  if (!sb || !S.code) return;
  const code = S.code, s = p.srv;
  p.inflight++;
  let ok = false;
  try {
    const { data, error } = await sb.rpc('move_piece', { p_room: code, p_pass: S.pass, p_id: p.id, p_state: s.state, p_fx: s.fx, p_fy: s.fy, p_rot: s.rot });
    ok = !error && data === true;
    if (error) toast('บันทึกชิ้นนี้ไม่สำเร็จ ลองเช็กอินเทอร์เน็ต');
  } catch(e){ toast('บันทึกชิ้นนี้ไม่สำเร็จ ลองเช็กอินเทอร์เน็ต'); }
  p.inflight--;
  if (code !== S.code) return;
  if (!ok){
    try { const { data } = await sb.from('pieces').select('id,state,fx,fy,rot').eq('room', code).eq('id', p.id).maybeSingle(); if (data){ p.lastRow = null; applyRow(p, data, true); } } catch(e){}
  } else if (p.inflight === 0 && p.lastRow){ const r = p.lastRow; p.lastRow = null; if (r.state === 'placed') applyRow(p, r); }
}
function onRow(r){ const p = S.pieces[r.id]; if (!p) return; if (p.inflight > 0){ p.lastRow = r; return; } applyRow(p, r); }
function applyRow(p, r, force){
  const was = p.srv.state;
  if (was === 'placed' && r.state !== 'placed' && !force) return;
  p.srv = { state: r.state, fx: r.fx, fy: r.fy, rot: r.rot };
  if (r.state === 'placed'){ p.holder = null; p.rpos = null; }
  if (drag && drag.p === p){ if (r.state === 'placed') cancelDrag(true); return; }
  show(p, was !== 'placed');
  if (p.where === 'tray') p.slot.hidden = S.filterEdges && !p.edge;
  updateProg(); checkDone();
}
function sendRelease(p){ if (S.chan) S.chan.send({ type: 'broadcast', event: 'release', payload: { id: p.id, ...p.srv } }); }
function onDrag(m){
  const p = S.pieces[m.id]; if (!p || p.srv.state === 'placed' || m.k === ME.id) return;
  if (drag && drag.p === p){ if (m.k < ME.id) cancelDrag(true); else return; }
  if (!p.holder || p.holder.key !== m.k) p.holder = { key: m.k, name: m.name, color: m.color };
  p.rpos = { fx: m.fx, fy: m.fy, rot: m.rot }; p.holdAt = Date.now();
  if (p.where === 'remote'){ p.deg = nearDeg(p.deg, m.rot); sizeFor(p); posTag(p); } else show(p);
}
function onRelease(m){
  const p = S.pieces[m.id]; if (!p || p.inflight > 0) return;
  p.holder = null; p.rpos = null;
  applyRow(p, m);
}
function setHold(){}
/* a held piece is released if its holder goes quiet; my own drag sends a heartbeat */
setInterval(() => {
  if (!S.game) return;
  const now = Date.now();
  S.pieces.forEach(p => { if (p.holder && now - (p.holdAt || 0) > 5000){ p.holder = null; p.rpos = null; show(p); } });
  if (drag && performance.now() - drag.sent > 1500) sendDrag(true);
}, 1000);
setInterval(() => { if (S.game && !drag && !document.hidden) refetch(); }, 10000);

function syncPresence(){
  if (!S.chan) return;
  const st = S.chan.presenceState(), players = [];
  for (const [key, metas] of Object.entries(st)){
    const m = metas[metas.length - 1] || {};
    players.push({ key, name: m.name, color: m.color || colorOf(key), me: key === ME.id });
  }
  if (!players.some(p => p.me)) players.unshift({ key: ME.id, name: ME.name, color: ME_COLOR, me: true });
  S.players = players.sort((a, b) => (b.me - a.me)); renderPlayers();
  const here = new Set(players.map(p => p.key));
  S.pieces.forEach(p => { if (p.holder && !here.has(p.holder.key)){ p.holder = null; p.rpos = null; show(p); } });
}

async function refetch(){
  if (!S.code) return;
  try {
    const { data } = await sb.from('pieces').select('id,state,fx,fy,rot').eq('room', S.code);
    (data || []).forEach(r => { const p = S.pieces[r.id]; if (!p || p.inflight > 0 || (drag && drag.p === p)) return;
      const s = p.srv; if (s.state !== r.state || s.rot !== r.rot || Math.abs(s.fx - r.fx) > 1e-4 || Math.abs(s.fy - r.fy) > 1e-4) applyRow(p, r); });
  } catch(e){}
}

function connect(code){
  disconnect();
  const ch = sb.channel('room:' + code, { config: { presence: { key: ME.id }, broadcast: { self: false } } });
  S.chan = ch;
  ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pieces', filter: 'room=eq.' + code }, pl => { if (S.chan === ch) onRow(pl.new); })
    .on('broadcast', { event: 'drag' }, ({ payload }) => { if (S.chan === ch) onDrag(payload); })
    .on('broadcast', { event: 'release' }, ({ payload }) => { if (S.chan === ch) onRelease(payload); })
    .on('presence', { event: 'sync' }, () => { if (S.chan === ch) syncPresence(); })
    .subscribe((status, err) => {
      if (err) console.warn('realtime', status, err);
      if (S.chan !== ch) return;
      if (status === 'SUBSCRIBED'){
        S.connected = true; $('#conn').hidden = true; refetch();
        const t = Date.now(); if (!ch._trackedAt || t - ch._trackedAt > 5000){ ch._trackedAt = t; ch.track({ name: ME.name, color: ME_COLOR }).catch(() => {}); }
      }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){ S.connected = false; $('#conn').hidden = false; }
    });
  $('#conn').hidden = false;
}
function disconnect(){ if (S.chan){ const c = S.chan; S.chan = null; S.connected = false; try { sb.removeChannel(c); } catch(e){} } }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.game) refetch(); });

/* ---------- HUD, tools, tray ---------- */
const allPlaced = () => S.pieces.length > 0 && S.pieces.every(p => p.srv.state === 'placed');
function checkDone(){ if (!S.doneShown && allPlaced()) complete(false); }
function updateProg(){
  let placed = 0, inTray = 0, loose = 0;
  S.pieces.forEach(p => { if (p.srv.state === 'placed') placed++; else if (p.srv.state === 'tray') inTray++; else loose++; });
  $('#prog').textContent = `${placed} / ${S.pieces.length}`;
  $('#trayCount').textContent = `ในถาด ${inTray}` + (loose ? ` · พักบนกระดาน ${loose}` : '');
  let empty = tray.querySelector('.tray-empty');
  if (inTray === 0 && !empty){ empty = document.createElement('div'); empty.className = 'tray-empty'; tray.appendChild(empty); }
  if (inTray > 0 && empty){ empty.remove(); empty = null; }
  if (empty) empty.textContent = loose ? 'ถาดว่างแล้ว ที่เหลือพักอยู่บนกระดาน' : 'ถาดว่างแล้ว';
}
function applyFilter(){
  let shown = 0;
  S.pieces.forEach(p => { const hide = S.filterEdges && !p.edge; p.slot.hidden = hide; if (!hide && p.srv.state === 'tray') shown++; });
  if (S.filterEdges && shown === 0){ S.filterEdges = false; setPressed('#tEdge', false); applyFilter(); toast('ชิ้นขอบหมดถาดแล้ว'); }
}
function renderPlayers(){
  const box = $('#players'); box.innerHTML = '';
  const list = S.players, max = 4;
  list.slice(0, max).forEach(pl => { const d = document.createElement('div'); d.className = 'av'; d.style.background = pl.color; d.textContent = [...(pl.name || '?')][0]; d.title = (pl.name || 'เพื่อน') + (pl.me ? ' (คุณ)' : ''); box.appendChild(d); });
  if (list.length > max){ const d = document.createElement('div'); d.className = 'av more'; d.textContent = '+' + (list.length - max); box.appendChild(d); }
  const ul = $('#ibPlayers'); ul.innerHTML = '';
  list.forEach(pl => { const li = document.createElement('li'), i = document.createElement('i'); i.style.background = pl.color; li.append(i, (pl.name || 'เพื่อน') + (pl.me ? ' (คุณ)' : '')); ul.appendChild(li); });
}
function setPressed(sel, v){ $(sel).setAttribute('aria-pressed', v ? 'true' : 'false'); }
$('#tRef').onclick = () => { const r = $('#ref'); r.hidden = !r.hidden; setPressed('#tRef', !r.hidden); };
$('#ref').onclick = () => { $('#ref').hidden = true; setPressed('#tRef', false); };
$('#tGhost').onclick = () => { S.ghost = !S.ghost; board.classList.toggle('ghost-on', S.ghost); setPressed('#tGhost', S.ghost); LS.set('jt-ghost', S.ghost); };
$('#tEdge').onclick = () => { S.filterEdges = !S.filterEdges; setPressed('#tEdge', S.filterEdges); applyFilter(); tray.scrollLeft = 0; };
$('#tGather').onclick = async () => {
  const loose = S.pieces.filter(p => p.srv.state === 'loose' && !p.holder);
  if (!loose.length){ toast('ไม่มีชิ้นพักอยู่บนกระดาน'); return; }
  loose.forEach(p => { p.srv = { ...p.srv, state: 'tray' }; p.inflight++; show(p); p.slot.hidden = S.filterEdges && !p.edge; });
  updateProg(); tray.scrollLeft = 0;
  try { const { error } = await sb.rpc('gather_loose', { p_room: S.code, p_pass: S.pass }); if (error) throw error; } catch(e){ toast('เก็บชิ้นไม่สำเร็จ ลองใหม่อีกครั้ง'); }
  loose.forEach(p => { p.inflight--; p.lastRow = null; });
  refetch();
};
$('#tShuffle').onclick = () => { shuffle([...tray.querySelectorAll('.slot')]).forEach(s => tray.appendChild(s)); const e = tray.querySelector('.tray-empty'); if (e) tray.appendChild(e); tray.scrollLeft = 0; };
$('#tSound').onclick = () => { soundOn = !soundOn; setPressed('#tSound', soundOn); $('#wave').style.opacity = soundOn ? 1 : .15; if (soundOn){ audioInit(); sfxSnap(); } };
$('#tl').onclick = () => tray.scrollBy({ left: -tray.clientWidth * .8, behavior: 'smooth' });
$('#tr').onclick = () => tray.scrollBy({ left: tray.clientWidth * .8, behavior: 'smooth' });
tray.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)){ tray.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
function leave(){ disconnect(); S.game = false; S.code = null; try { history.replaceState(null, '', location.pathname); } catch(e){} showHome(); }
$('#backBtn').onclick = () => { if (drag) cancelDrag(false); pend = null; leave(); };
$('#againBtn').onclick = leave;
$('#viewBtn').onclick = () => { $('#done').hidden = true; };

/* invite */
const roomLink = () => location.origin + location.pathname + '?r=' + S.code;
$('#inviteBtn').onclick = () => { $('#ibCode').textContent = S.code; $('#ibLink').textContent = roomLink(); $('#shareBtn').hidden = !navigator.share; $('#ibLocked').hidden = !S.room.locked; renderPlayers(); $('#inviteBox').hidden = false; };
$('#ibClose').onclick = () => { $('#inviteBox').hidden = true; };
$('#inviteBox').addEventListener('click', e => { if (e.target.id === 'inviteBox') $('#inviteBox').hidden = true; });
$('#copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(roomLink()); toast('คัดลอกลิงก์แล้ว'); }
  catch(e){ const r = document.createRange(); r.selectNodeContents($('#ibLink')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('เลือกลิงก์ไว้แล้ว กดคัดลอกได้เลย'); }
};
$('#shareBtn').onclick = () => { navigator.share({ title: 'มาต่อจิ๊กซอว์กัน', text: `มาต่อจิ๊กซอว์ด้วยกัน รหัสห้อง ${S.code}`, url: roomLink() }).catch(() => {}); };

function complete(silent){
  S.doneShown = true; if (!S.doneAt) S.doneAt = Date.now();
  const list = LS.get('jt-recent', []).map(r => r.code === S.code ? { ...r, done: true } : r); LS.set('jt-recent', list);
  tickTime();
  $('#doneInfo').textContent = `${S.pieces.length} ชิ้น · ใช้เวลา ${fmtT(Math.max(0, Math.round((S.doneAt - S.created) / 1000)))}` + (S.rotate ? ' · ระดับยาก' : '');
  $('#done').hidden = false; $('#full').classList.add('show');
  if (silent) return;
  sfxDone();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = ['#e8728c', '#38b2a6', '#ffd36e', '#a78bfa', '#fff'];
  for (let i = 0; i < 46; i++){
    const s = document.createElement('span'); s.className = 'conf';
    s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % cols.length];
    s.style.setProperty('--d', S.H + 30 + 'px'); s.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    s.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; s.style.animationDelay = Math.random() * .6 + 's';
    board.appendChild(s);
  }
}

function tickTime(){ if (!S.game) return; const end = S.doneAt || Date.now(); $('#time').textContent = fmtT(Math.max(0, Math.floor((end - S.created) / 1000))); }
setInterval(tickTime, 1000);

let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#game').hidden){ layout(); S.pieces.forEach(p => { if (p.where !== 'drag') sizeFor(p); posTag(p); }); } else drawPreview(); }, 120); });

/* ---------- boot ---------- */
pick.src = paintSample(); refreshPick(); renderRecent(); loadLobby();
document.fonts && document.fonts.ready.then(drawPreview);
if (!sb) homeErr('โหลดระบบออนไลน์ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง');
(() => {
  const code = cleanCode(new URLSearchParams(location.search).get('r') || '');
  if (code.length !== 6) return;
  $('#joinCode').value = code;
  if (ME.name && sb) joinRoom(code);
  else { homeErr('ใส่ชื่อเล่นแล้วกด "เข้าห้อง" ได้เลย'); $('#nick').focus(); }
})();
