/* ---------- shared drawing board (Jamboard-like infinite paper) ----------
   items live in Supabase table board_items (RPC board_add / board_del / board_clear)
   live ink + changes go over the lobby channel as broadcast 'bd' { op: ink|add|del|clear|reload } */
const INK = ['#2a1c16', '#d9574a', '#e8932c', '#4fae55', '#2fa79b', '#3f92d8', '#7c6cf0', '#e8728c', '#ffffff'];
const NOTE_BG = ['#ffe58a', '#ffc2cf', '#bfe3ff', '#c8f0b8', '#e3d4ff'];
const SIZES = [2, 5, 10, 22];
const NOTE = 180, NOTE_FS = 22;
const Board = {
  items: new Map(), live: new Map(), undo: [], redo: [], open: false, dirty: true, thumbDirty: true, loaded: false,
  tool: LS.get('jt-bd-tool', 'pen'), color: LS.get('jt-bd-color', INK[0]), size: LS.get('jt-bd-size', 5), noteBg: LS.get('jt-bd-note', NOTE_BG[0]),
  view: LS.get('jt-bd-view', null), pendAdd: new Map(), pendDel: new Set(), penSeen: false, editing: null, cursor: null
};
if (!INK.includes(Board.color)) Board.color = INK[0];
if (!SIZES.includes(Board.size)) Board.size = 5;
if (!['hand', 'pen', 'hl', 'eraser', 'text', 'note'].includes(Board.tool)) Board.tool = 'pen';
const bdCv = $('#drawCv'), bdG = bdCv.getContext('2d'), measureG = document.createElement('canvas').getContext('2d');
const bdId = () => ME.id.slice(0, 6) + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const r1 = v => Math.round(v * 10) / 10;
const textFont = s => `500 ${s}px Mitr, Nunito, system-ui, sans-serif`;

/* ----- geometry ----- */
function wrapNote(t){
  measureG.font = textFont(NOTE_FS);
  const out = [], maxW = NOTE - 28;
  for (const para of String(t || '').split('\n')){
    let line = '';
    for (const ch of [...para]){ const tt = line + ch; if (measureG.measureText(tt).width > maxW && line){ out.push(line); line = ch.trim() ? ch : ''; } else line = tt; }
    out.push(line);
  }
  return out.slice(0, 7);
}
function prep(it){
  const d = it.data || {}; it.data = d;
  if (it.kind === 'pen'){
    const p = d.p || [], path = new Path2D(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < p.length; i += 2){ x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    if (p.length <= 2){ path.moveTo(p[0], p[1]); path.lineTo(p[0] + .01, p[1]); }
    else {
      path.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) path.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      path.lineTo(p[p.length - 2], p[p.length - 1]);
    }
    const h = (d.w || 4) / 2 + 1; it.path = path; it.bb = [x0 - h, y0 - h, x1 + h, y1 + h];
  } else if (it.kind === 'text'){
    measureG.font = textFont(d.s || 24);
    const lines = String(d.t || '').split('\n'), w = Math.max(8, ...lines.map(l => measureG.measureText(l).width));
    it.lines = lines; it.bb = [d.x, d.y, d.x + w, d.y + lines.length * (d.s || 24) * 1.3];
  } else if (it.kind === 'note'){
    it.lines = wrapNote(d.t); it.bb = [d.x, d.y, d.x + NOTE, d.y + NOTE];
  }
  return it;
}
const plain = it => ({ id: it.id, author: it.author, kind: it.kind, data: it.data });
const hitBox = (it, x, y, pad) => it.bb && x >= it.bb[0] - pad && x <= it.bb[2] + pad && y >= it.bb[1] - pad && y <= it.bb[3] + pad;
function segDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function hitItem(it, x, y, r){
  if (!hitBox(it, x, y, r)) return false;
  if (it.kind !== 'pen') return true;
  const p = it.data.p, lim = r + (it.data.w || 4) / 2;
  if (p.length <= 2) return Math.hypot(p[0] - x, p[1] - y) <= lim;
  for (let i = 0; i < p.length - 2; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= lim) return true;
  return false;
}
function topAt(x, y, kinds){
  const all = [...Board.items.values()];
  for (let i = all.length - 1; i >= 0; i--){ const it = all[i]; if (kinds.includes(it.kind) && hitItem(it, x, y, 4 / Board.view.z)) return it; }
  return null;
}

/* ----- view ----- */
function bdSize(){ return [bdCv.clientWidth || 1, bdCv.clientHeight || 1]; }
function ensureView(){ if (!Board.view || !(Board.view.z > 0)){ const [W, H] = bdSize(); Board.view = { x: W / 2, y: H / 2, z: 1 }; } }
const toWorld = (sx, sy) => [(sx - Board.view.x) / Board.view.z, (sy - Board.view.y) / Board.view.z];
function zoomAt(sx, sy, z){
  const v = Board.view, nz = clamp(z, .08, 8), [wx, wy] = toWorld(sx, sy);
  v.z = nz; v.x = sx - wx * nz; v.y = sy - wy * nz; bdDirty();
}
function fitAll(){
  const [W, H] = bdSize(); let b = null;
  Board.items.forEach(it => { if (!it.bb) return; b = b ? [Math.min(b[0], it.bb[0]), Math.min(b[1], it.bb[1]), Math.max(b[2], it.bb[2]), Math.max(b[3], it.bb[3])] : [...it.bb]; });
  if (!b){ Board.view = { x: W / 2, y: H / 2, z: 1 }; bdDirty(); return; }
  const pad = 60, bottom = 120, z = clamp(Math.min((W - pad * 2) / Math.max(1, b[2] - b[0]), (H - pad - bottom) / Math.max(1, b[3] - b[1])), .08, 2);
  Board.view = { z, x: W / 2 - (b[0] + b[2]) / 2 * z, y: (H - bottom + pad) / 2 - (b[1] + b[3]) / 2 * z }; bdDirty();
}

/* ----- render ----- */
let bdRaf = 0;
function bdDirty(thumb){ Board.dirty = true; if (thumb) Board.thumbDirty = true; if (Board.open && !bdRaf) bdRaf = requestAnimationFrame(bdRender); }
function drawPen(g, it){
  const d = it.data; g.globalAlpha = d.hl ? .35 : 1; g.strokeStyle = d.c || INK[0]; g.lineWidth = d.w || 4;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(it.path); g.globalAlpha = 1;
}
function drawText(g, it){
  const d = it.data, s = d.s || 24; g.font = textFont(s); g.fillStyle = d.c || INK[0]; g.textBaseline = 'top'; g.textAlign = 'left';
  it.lines.forEach((l, i) => g.fillText(l, d.x, d.y + i * s * 1.3 + s * .08));
}
function drawNote(g, it){
  const d = it.data;
  g.fillStyle = 'rgba(60,40,20,.18)'; g.fillRect(d.x + 3, d.y + 5, NOTE, NOTE);
  g.fillStyle = d.bg || NOTE_BG[0]; g.fillRect(d.x, d.y, NOTE, NOTE);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(d.x, d.y, NOTE, 14);
  g.font = textFont(NOTE_FS); g.fillStyle = '#3b2b20'; g.textBaseline = 'top'; g.textAlign = 'left';
  it.lines.forEach((l, i) => g.fillText(l, d.x + 14, d.y + 20 + i * NOTE_FS * 1.3));
  if (d.by){ g.font = textFont(12); g.fillStyle = 'rgba(59,43,32,.55)'; g.textAlign = 'right'; g.fillText(d.by, d.x + NOTE - 10, d.y + NOTE - 20); g.textAlign = 'left'; }
}
function drawAny(g, it){ if (it.kind === 'pen') drawPen(g, it); else if (it.kind === 'text') drawText(g, it); else if (it.kind === 'note') drawNote(g, it); }
function bdRender(){
  bdRaf = 0; if (!Board.open) return;
  const [W, H] = bdSize(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (bdCv.width !== Math.round(W * dpr) || bdCv.height !== Math.round(H * dpr)){ bdCv.width = Math.round(W * dpr); bdCv.height = Math.round(H * dpr); }
  ensureView();
  const g = bdG, v = Board.view;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fbf5e6'; g.fillRect(0, 0, W, H);
  // dot grid
  let sp = 40; while (sp * v.z < 18) sp *= 2;
  const step = sp * v.z, ox = ((v.x % step) + step) % step, oy = ((v.y % step) + step) % step, ds = Math.max(1.2, Math.min(2.4, step / 18));
  g.fillStyle = 'rgba(122,92,60,.22)';
  for (let y = oy; y < H; y += step) for (let x = ox; x < W; x += step) g.fillRect(x - ds / 2, y - ds / 2, ds, ds);
  // items, culled to the visible area
  g.setTransform(dpr * v.z, 0, 0, dpr * v.z, dpr * v.x, dpr * v.y);
  const [wx0, wy0] = toWorld(0, 0), [wx1, wy1] = toWorld(W, H), ed = Board.editing && Board.editing.id;
  Board.items.forEach(it => { if (it.id === ed || !it.bb || it.bb[2] < wx0 || it.bb[0] > wx1 || it.bb[3] < wy0 || it.bb[1] > wy1) return; drawAny(g, it); });
  const now = Date.now();
  Board.live.forEach((s, id) => { if (now - s.seen > 8000){ Board.live.delete(id); return; } if (s.p.length >= 2) drawPen(g, prep({ kind: 'pen', data: { c: s.c, w: s.w, hl: s.hl, p: s.p } })); });
  if (cur && cur.type === 'draw' && cur.p.length >= 2) drawPen(g, prep({ kind: 'pen', data: { c: cur.c, w: cur.w, hl: cur.hl, p: cur.p } }));
  // screen-space: names on live strokes, eraser ring
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = '700 12px Nunito, Mitr, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  Board.live.forEach(s => {
    if (s.p.length < 2) return;
    const sx = s.p[s.p.length - 2] * v.z + v.x + 10, sy = s.p[s.p.length - 1] * v.z + v.y - 14, w = g.measureText(s.name || '').width + 12;
    g.fillStyle = colorOf(s.k); roundRect(g, sx, sy - 9, w, 18, 9); g.fill(); g.fillStyle = '#fff'; g.fillText(s.name || '', sx + 6, sy);
  });
  if (Board.tool === 'eraser' && Board.cursor){ g.strokeStyle = 'rgba(59,43,32,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(Board.cursor[0], Board.cursor[1], eraserR() * v.z, 0, Math.PI * 2); g.stroke(); }
  if (Board.editing) placeText();
  if (Board.live.size) bdDirty();
  Board.dirty = false;
}
const eraserR = () => (Board.size * 1.4 + 8) / Board.view.z; // constant size on screen

/* tiny preview on the whiteboard in the room */
const bdThumb = document.createElement('canvas'); bdThumb.width = 64; bdThumb.height = 44;
let thumbAt = 0;
function updateThumb(){
  const now = Date.now(); if (!Board.thumbDirty || now - thumbAt < 1500) return; thumbAt = now; Board.thumbDirty = false;
  const g = bdThumb.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 64, 44);
  let b = null; Board.items.forEach(it => { if (it.bb) b = b ? [Math.min(b[0], it.bb[0]), Math.min(b[1], it.bb[1]), Math.max(b[2], it.bb[2]), Math.max(b[3], it.bb[3])] : [...it.bb]; });
  if (!b) return;
  const k = Math.min(60 / Math.max(1, b[2] - b[0]), 40 / Math.max(1, b[3] - b[1]), 1);
  g.setTransform(k, 0, 0, k, 32 - (b[0] + b[2]) / 2 * k, 22 - (b[1] + b[3]) / 2 * k);
  Board.items.forEach(it => {
    if (it.kind === 'pen'){ const w = it.data.w; it.data.w = Math.max(w || 4, 1.6 / k); drawPen(g, it); it.data.w = w; }
    else if (it.kind === 'note'){ g.fillStyle = it.data.bg || NOTE_BG[0]; g.fillRect(it.data.x, it.data.y, NOTE, NOTE); }
    else if (it.kind === 'text'){ g.fillStyle = it.data.c || INK[0]; g.globalAlpha = .7; g.fillRect(it.bb[0], it.bb[1], it.bb[2] - it.bb[0], (it.bb[3] - it.bb[1]) * .7); g.globalAlpha = 1; }
  });
}
function drawWallBoard(g){
  updateThumb();
  g.imageSmoothingEnabled = true; g.drawImage(bdThumb, 160, 8, 16, 11); g.imageSmoothingEnabled = false;
}

/* ----- local changes: apply, persist, broadcast ----- */
function bdSend(payload){ if (S.chan) S.chan.send({ type: 'broadcast', event: 'bd', payload: { k: ME.id, ...payload } }).catch(() => {}); }
function put(items, silent){
  items.forEach(it => { Board.items.delete(it.id); Board.items.set(it.id, prep(it)); Board.pendDel.delete(it.id); Board.pendAdd.set(it.id, plain(it)); });
  if (!silent){ if (items.length <= 60) for (let i = 0; i < items.length; i += 20) bdSend({ op: 'add', items: items.slice(i, i + 20).map(plain) }); else Board.reloadAfter = true; }
  bdDirty(true); flushSoon();
}
function drop(ids){
  ids.forEach(id => { Board.items.delete(id); Board.pendAdd.delete(id); Board.pendDel.add(id); });
  if (ids.length <= 300) bdSend({ op: 'del', ids }); else Board.reloadAfter = true;
  bdDirty(true); flushSoon();
}
function record(op){ Board.undo.push(op); if (Board.undo.length > 100) Board.undo.shift(); Board.redo = []; renderBdTools(); }
function applyOp(op, back){
  const clone = it => ({ id: it.id, author: it.author, kind: it.kind, data: JSON.parse(JSON.stringify(it.data)) });
  if (op.add) back ? drop(op.add.map(i => i.id)) : put(op.add.map(clone));
  if (op.del) back ? put(op.del.map(clone)) : drop(op.del.map(i => i.id));
  if (op.upd) put([clone(back ? op.upd[0] : op.upd[1])]);
}
function undo(){ commitText(); const op = Board.undo.pop(); if (!op) return; applyOp(op, true); Board.redo.push(op); renderBdTools(); }
function redo(){ commitText(); const op = Board.redo.pop(); if (!op) return; applyOp(op, false); Board.undo.push(op); renderBdTools(); }

let flushT = 0, flushing = false, flushFails = 0;
function flushSoon(ms){ clearTimeout(flushT); flushT = setTimeout(flush, ms || 250); }
async function flush(){
  if (flushing){ flushSoon(400); return; }
  if (!Board.pendAdd.size && !Board.pendDel.size) return;
  flushing = true;
  try {
    const adds = [...Board.pendAdd.values()].slice(0, 150);
    if (adds.length){
      const { error } = await sb.rpc('board_add', { p_items: adds }); if (error) throw error;
      adds.forEach(a => { if (Board.pendAdd.get(a.id) === a) Board.pendAdd.delete(a.id); });
    }
    const dels = [...Board.pendDel].slice(0, 1500);
    if (dels.length){
      const { error } = await sb.rpc('board_del', { p_ids: dels }); if (error) throw error;
      dels.forEach(id => { if (!Board.pendAdd.has(id)) Board.pendDel.delete(id); });
    }
    flushFails = 0;
    if (!Board.pendAdd.size && !Board.pendDel.size && Board.reloadAfter){ Board.reloadAfter = false; bdSend({ op: 'reload' }); }
  } catch(e){
    if (flushFails++ === 1) toast('บันทึกกระดานไม่สำเร็จ จะลองใหม่เอง');
    flushing = false; flushSoon(Math.min(30000, 3000 * flushFails)); return;
  }
  flushing = false;
  if (Board.pendAdd.size || Board.pendDel.size) flushSoon(50);
}
window.addEventListener('pagehide', () => { if (Board.pendAdd.size || Board.pendDel.size) flush(); });

async function loadBoard(){
  if (!sb) return;
  try {
    const rows = [];
    for (let from = 0; from < 4000; from += 1000){
      const { data, error } = await sb.from('board_items').select('id,author,kind,data,created_at').eq('board', 'main').order('created_at', { ascending: true }).range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    const m = new Map();
    rows.forEach(r => { if (!Board.pendDel.has(r.id)) m.set(r.id, prep({ id: r.id, author: r.author, kind: r.kind, data: r.data })); });
    Board.pendAdd.forEach((it, id) => { m.delete(id); m.set(id, prep(JSON.parse(JSON.stringify(it)))); });
    Board.items = m; Board.loaded = true; bdDirty(true);
    if (Board.editing && Board.editing.before && !m.has(Board.editing.id)) cancelText();
  } catch(e){ if (Board.open) toast('โหลดกระดานไม่สำเร็จ'); }
}

/* ----- realtime from friends ----- */
function onBoard(m){
  if (!m || m.k === ME.id) return;
  if (m.op === 'ink'){
    let s = Board.live.get(m.id);
    if (!s){ s = { id: m.id, k: m.k, name: m.name, c: m.c, w: m.w, hl: m.hl, p: [], seen: 0 }; Board.live.set(m.id, s); }
    if (Array.isArray(m.p) && s.p.length < 8000) s.p.push(...m.p);
    s.seen = Date.now(); bdDirty(); return;
  }
  if (m.op === 'add' && Array.isArray(m.items)) m.items.forEach(it => {
    if (!it || !it.id || Board.pendDel.has(it.id)) return;
    Board.live.delete(it.id); Board.items.delete(it.id); Board.items.set(it.id, prep(it));
  });
  if (m.op === 'del' && Array.isArray(m.ids)) m.ids.forEach(id => Board.items.delete(id));
  if (m.op === 'clear'){
    Board.items = new Map(); Board.pendAdd.forEach((it, id) => Board.items.set(id, prep(JSON.parse(JSON.stringify(it)))));
    toast(`${m.name || 'เพื่อน'} ล้างกระดานแล้ว`);
  }
  if (m.op === 'reload') setTimeout(loadBoard, 800);
  if (Board.editing && Board.editing.before && !Board.items.has(Board.editing.id)) cancelText();
  bdDirty(true);
}

/* ----- input ----- */
const ptrs = new Map();
let cur = null, inkSent = 0, inkT = 0, spaceDown = false;
const drawTool = () => ['pen', 'hl', 'eraser'].includes(Board.tool);
function localPt(e){ const r = bdCv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function startPinch(){
  const [a, b] = [...ptrs.values()];
  cur = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: Board.view.z, w: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
}
function endGesture(cancel){
  const c = cur; cur = null; if (!c) return;
  if (c.type === 'draw'){
    clearTimeout(inkT);
    if (cancel || !c.p.length){ if (c.sent) bdSend({ op: 'del', ids: [c.id] }); bdDirty(); return; }
    const data = { c: c.c, w: c.w, p: c.p }; if (c.hl) data.hl = 1;
    const it = { id: c.id, author: ME.id, kind: 'pen', data };
    put([it]); record({ add: [plain(it)] });
  }
  if (c.type === 'erase' && c.gone.length){ record({ del: c.gone }); }
  if (c.type === 'move' && c.moved){ const after = plain(c.it); put([after]); record({ upd: [c.before, JSON.parse(JSON.stringify(after))] }); }
  if (c.type === 'tap' && !cancel){
    if (Board.tool === 'text'){ const hit = topAt(c.wx, c.wy, ['text', 'note']); hit ? editText(hit) : newText(c.wx, c.wy); }
    else if (Board.tool === 'note'){ const hit = topAt(c.wx, c.wy, ['note', 'text']); hit ? editText(hit) : newNote(c.wx - NOTE / 2, c.wy - NOTE / 2); }
    else if (Board.tool === 'hand'){ const hit = topAt(c.wx, c.wy, ['note', 'text']); if (hit && c.dbl) editText(hit); }
  }
  bdDirty();
}
function sendInk(force){
  if (!cur || cur.type !== 'draw') return;
  const now = Date.now();
  if (!force && now - inkSent < 100){ clearTimeout(inkT); inkT = setTimeout(() => sendInk(true), 100 - (now - inkSent)); return; }
  if (cur.p.length > cur.sentN){ inkSent = now; cur.sent = true; bdSend({ op: 'ink', id: cur.id, name: ME.name, c: cur.c, w: cur.w, hl: cur.hl ? 1 : 0, p: cur.p.slice(cur.sentN) }); cur.sentN = cur.p.length; }
}
function eraseAt(wx, wy){
  const r = eraserR(), gone = [];
  Board.items.forEach(it => { if (hitItem(it, wx, wy, r)) gone.push(it); });
  if (!gone.length) return;
  cur.gone.push(...gone.map(it => JSON.parse(JSON.stringify(plain(it))))); drop(gone.map(it => it.id));
}
let lastTap = 0;
bdCv.addEventListener('pointerdown', e => {
  e.preventDefault(); audioInit();
  if (Board.editing){ commitText(); if (ptrs.size === 0 && (Board.tool === 'text' || Board.tool === 'note')){ ptrs.clear(); return; } }
  try { bdCv.setPointerCapture(e.pointerId); } catch(_){}
  if (e.pointerType === 'pen') Board.penSeen = true;
  const [x, y] = localPt(e); ptrs.set(e.pointerId, { x, y, t: e.pointerType });
  if (ptrs.size === 2){
    if (cur && cur.type === 'draw' && cur.p.length > 30) return; // a long stroke is already going: ignore a resting palm
    endGesture(cur && cur.type === 'draw'); startPinch(); return;
  }
  if (ptrs.size > 2) return;
  const [wx, wy] = toWorld(x, y);
  const pan = Board.tool === 'hand' || e.button === 1 || e.button === 2 || spaceDown || (Board.penSeen && e.pointerType === 'touch' && drawTool());
  if (pan){
    const now = Date.now(), dbl = now - lastTap < 350; lastTap = now;
    const hit = Board.tool === 'hand' && !spaceDown && e.button === 0 ? topAt(wx, wy, ['note', 'text']) : null;
    if (hit){ Board.items.delete(hit.id); Board.items.set(hit.id, hit); cur = { type: 'move', it: hit, before: JSON.parse(JSON.stringify(plain(hit))), sx: x, sy: y, ox: hit.data.x, oy: hit.data.y, moved: false, tap: { wx, wy, dbl } }; }
    else cur = { type: 'pan', sx: x, sy: y, vx: Board.view.x, vy: Board.view.y };
    bdDirty(); return;
  }
  if (Board.tool === 'pen' || Board.tool === 'hl'){
    const hl = Board.tool === 'hl';
    cur = { type: 'draw', id: bdId(), c: Board.color, w: hl ? Board.size * 3 + 6 : Board.size, hl, p: [r1(wx), r1(wy)], sentN: 0, sent: false };
    bdDirty(); return;
  }
  if (Board.tool === 'eraser'){ cur = { type: 'erase', gone: [] }; Board.cursor = [x, y]; eraseAt(wx, wy); bdDirty(); return; }
  cur = { type: 'tap', sx: x, sy: y, wx, wy, vx: Board.view.x, vy: Board.view.y };
});
bdCv.addEventListener('pointermove', e => {
  const [x, y] = localPt(e);
  if (Board.tool === 'eraser' && e.pointerType !== 'touch'){ Board.cursor = [x, y]; bdDirty(); }
  const pt = ptrs.get(e.pointerId); if (!pt) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  pt.x = x; pt.y = y;
  if (!cur) return;
  if (cur.type === 'pinch' && ptrs.size >= 2){
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), z = clamp(cur.z0 * d / cur.d0, .08, 8);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    Board.view.z = z; Board.view.x = mx - cur.w[0] * z; Board.view.y = my - cur.w[1] * z; bdDirty(); return;
  }
  if (cur.type === 'pan' || cur.type === 'tap'){
    if (cur.type === 'tap' && Math.hypot(x - cur.sx, y - cur.sy) < 8) return;
    if (cur.type === 'tap') cur = { type: 'pan', sx: cur.sx, sy: cur.sy, vx: cur.vx, vy: cur.vy };
    Board.view.x = cur.vx + x - cur.sx; Board.view.y = cur.vy + y - cur.sy; bdDirty(); return;
  }
  if (cur.type === 'move'){
    if (!cur.moved && Math.hypot(x - cur.sx, y - cur.sy) < 6) return;
    cur.moved = true; const z = Board.view.z;
    cur.it.data.x = r1(cur.ox + (x - cur.sx) / z); cur.it.data.y = r1(cur.oy + (y - cur.sy) / z); prep(cur.it); bdDirty(true); return;
  }
  if (cur.type === 'draw'){
    if (ptrs.size > 1) return;
    const min = 1.2 / Board.view.z;
    for (const ev of events){
      const [ex, ey] = localPt(ev), [wx, wy] = toWorld(ex, ey), p = cur.p;
      if (p.length >= 6000) break;
      if (Math.hypot(wx - p[p.length - 2], wy - p[p.length - 1]) >= min) p.push(r1(wx), r1(wy));
    }
    sendInk(false); bdDirty(); return;
  }
  if (cur.type === 'erase'){
    Board.cursor = [x, y];
    for (const ev of events){ const [ex, ey] = localPt(ev); eraseAt(...toWorld(ex, ey)); }
    bdDirty();
  }
});
function ptrUp(e){
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (e.pointerType === 'touch' && Board.tool === 'eraser') Board.cursor = null;
  if (!cur) return;
  if (cur.type === 'pinch'){ if (ptrs.size === 0) cur = null; else if (ptrs.size === 1){ const [p] = [...ptrs.values()]; cur = { type: 'pan', sx: p.x, sy: p.y, vx: Board.view.x, vy: Board.view.y }; } saveView(); return; }
  if (ptrs.size) return;
  if (cur.type === 'move' && !cur.moved){ const t = cur.tap; cur = null; if (t.dbl) editText(topAt(t.wx, t.wy, ['note', 'text'])); bdDirty(); return; }
  if (cur.type === 'pan') saveView();
  endGesture(e.type === 'pointercancel' && cur.type === 'draw' && cur.p.length < 6);
}
bdCv.addEventListener('pointerup', ptrUp);
bdCv.addEventListener('pointercancel', ptrUp);
bdCv.addEventListener('lostpointercapture', ptrUp);
bdCv.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch' && Board.cursor){ Board.cursor = null; bdDirty(); } });
bdCv.addEventListener('contextmenu', e => e.preventDefault());
bdCv.addEventListener('wheel', e => {
  e.preventDefault(); const [x, y] = localPt(e);
  if (e.ctrlKey || e.metaKey) zoomAt(x, y, Board.view.z * Math.exp(-clamp(e.deltaY, -50, 50) * .01));
  else { Board.view.x -= e.deltaX; Board.view.y -= e.deltaY; bdDirty(); }
  clearTimeout(Board.vt); Board.vt = setTimeout(saveView, 400);
}, { passive: false });
const saveView = () => LS.set('jt-bd-view', Board.view);
document.addEventListener('keydown', e => {
  if (!Board.open || e.target.matches('input,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y'){ e.preventDefault(); redo(); return; }
  if (e.key === ' '){ spaceDown = true; e.preventDefault(); return; }
  if (e.key === 'Escape'){ closeBoard(); return; }
  const map = { h: 'hand', p: 'pen', m: 'hl', e: 'eraser', t: 'text', n: 'note' };
  if (!e.ctrlKey && !e.metaKey && map[k]) setTool(map[k]);
});
document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

/* ----- text and sticky notes ----- */
const bdText = $('#bdText');
function placeText(){
  const ed = Board.editing; if (!ed) return;
  const v = Board.view, z = v.z, sx = ed.x * z + v.x, sy = ed.y * z + v.y;
  bdText.style.left = sx + 'px'; bdText.style.top = sy + 'px';
  if (ed.kind === 'note'){
    Object.assign(bdText.style, { width: NOTE * z + 'px', height: NOTE * z + 'px', fontSize: NOTE_FS * z + 'px', padding: `${20 * z}px ${14 * z}px`, background: ed.bg, color: '#3b2b20', lineHeight: '1.3' });
  } else {
    const s = ed.s * z; bdText.style.fontSize = s + 'px'; bdText.style.color = ed.c; bdText.style.background = 'rgba(255,255,255,.6)'; bdText.style.padding = '0'; bdText.style.lineHeight = '1.3';
    bdText.style.width = 'auto'; bdText.style.height = 'auto';
    measureG.font = textFont(s);
    const lines = (bdText.value || ' ').split('\n'), w = Math.max(...lines.map(l => measureG.measureText(l + 'MM').width));
    bdText.style.width = Math.min(Math.max(w, s * 3), bdSize()[0] - sx - 8) + 'px'; bdText.style.height = lines.length * s * 1.3 + 4 + 'px';
  }
}
function openEditor(ed, val){
  Board.editing = ed; bdText.value = val || ''; bdText.hidden = false;
  bdText.classList.toggle('note', ed.kind === 'note'); placeText();
  setTimeout(() => { bdText.focus(); bdText.setSelectionRange(bdText.value.length, bdText.value.length); }, 0);
  bdDirty();
}
function newText(x, y){ const s = Math.max(16, Board.size * 3 + 12); openEditor({ id: bdId(), kind: 'text', x: r1(x), y: r1(y - s * .65), s, c: Board.color === '#ffffff' ? INK[0] : Board.color, before: null }); }
function newNote(x, y){ openEditor({ id: bdId(), kind: 'note', x: r1(x), y: r1(y), bg: Board.noteBg, before: null }); }
function editText(it){
  if (!it) return;
  const d = it.data;
  openEditor({ id: it.id, kind: it.kind, x: d.x, y: d.y, s: d.s, c: d.c, bg: d.bg, before: JSON.parse(JSON.stringify(plain(it))) }, d.t);
}
function cancelText(){ Board.editing = null; bdText.hidden = true; bdText.blur(); bdDirty(); }
function commitText(){
  const ed = Board.editing; if (!ed) return;
  Board.editing = null; bdText.hidden = true;
  const t = bdText.value.replace(/\s+$/, '').slice(0, 1000);
  if (ed.before){
    if (!t){ drop([ed.id]); record({ del: [ed.before] }); }
    else if (t !== ed.before.data.t){ const after = { ...ed.before, data: { ...ed.before.data, t } }; put([after]); record({ upd: [ed.before, JSON.parse(JSON.stringify(after))] }); }
  } else if (t){
    const data = ed.kind === 'note' ? { x: ed.x, y: ed.y, t, bg: ed.bg, by: ME.name } : { x: ed.x, y: ed.y, t, s: ed.s, c: ed.c };
    const it = { id: ed.id, author: ME.id, kind: ed.kind, data }; put([it]); record({ add: [plain(it)] });
  }
  bdText.blur(); bdDirty(true);
}
bdText.addEventListener('input', placeText);
bdText.addEventListener('blur', () => setTimeout(() => { if (Board.editing && document.activeElement !== bdText) commitText(); }, 150));
bdText.addEventListener('keydown', e => {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))){ e.preventDefault(); commitText(); }
  e.stopPropagation();
});

/* ----- toolbar ----- */
const TOOLS = [
  ['hand', 'เลื่อนกระดาน · ลากโน้ต (แตะสองครั้งเพื่อแก้)', '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5M14 11.5V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.3 15a1.6 1.6 0 0 1 2.4-2.1L8 15"/>'],
  ['pen', 'ปากกา', '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>'],
  ['hl', 'ปากกาเน้นข้อความ', '<path d="M9 15l-3 3h5l1-1"/><path d="M9 15l7.5-7.5 3 3L12 18z"/><path d="M14.5 9.5l3 3"/><path d="M3 21h18" opacity=".45"/>'],
  ['eraser', 'ยางลบ (ลบทั้งเส้น)', '<path d="M7 20h13"/><path d="M4.6 15.4l9.9-9.9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.2z"/><path d="M9 11l5 5"/>'],
  ['text', 'ข้อความ', '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'],
  ['note', 'โน้ตแปะ', '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>']
];
function setTool(t){ commitText(); Board.tool = t; LS.set('jt-bd-tool', t); Board.cursor = null; renderBdTools(); bdDirty(); }
function renderBdTools(){
  const box = $('#bdTools'); if (!box.children.length){
    TOOLS.forEach(([id, label, svg]) => { const b = document.createElement('button'); b.className = 'bd-tool'; b.dataset.t = id; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`; b.onclick = () => setTool(id); box.appendChild(b); });
  }
  box.querySelectorAll('.bd-tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === Board.tool));
  const opts = $('#bdOpts'); opts.innerHTML = '';
  const t = Board.tool;
  if (['pen', 'hl', 'text'].includes(t)){
    INK.forEach(c => { if (t === 'text' && c === '#ffffff') return; const b = document.createElement('button'); b.className = 'bd-sw'; b.style.background = c; b.setAttribute('aria-label', 'สี'); b.setAttribute('aria-pressed', c === Board.color); b.onclick = () => { Board.color = c; LS.set('jt-bd-color', c); renderBdTools(); }; opts.appendChild(b); });
  }
  if (t === 'note'){
    NOTE_BG.forEach(c => { const b = document.createElement('button'); b.className = 'bd-sw sq'; b.style.background = c; b.setAttribute('aria-label', 'สีโน้ต'); b.setAttribute('aria-pressed', c === Board.noteBg); b.onclick = () => { Board.noteBg = c; LS.set('jt-bd-note', c); renderBdTools(); }; opts.appendChild(b); });
  }
  if (['pen', 'hl', 'eraser', 'text'].includes(t)){
    if (opts.children.length){ const sep = document.createElement('i'); sep.className = 'bd-sep'; opts.appendChild(sep); }
    SIZES.forEach(s => { const b = document.createElement('button'); b.className = 'bd-size'; b.setAttribute('aria-label', 'ขนาด ' + s); b.setAttribute('aria-pressed', s === Board.size); const dot = document.createElement('i'); const px = Math.round(4 + SIZES.indexOf(s) * 4); dot.style.width = dot.style.height = px + 'px'; if (t !== 'eraser') dot.style.background = Board.color === '#ffffff' ? '#ccc' : Board.color; b.appendChild(dot); b.onclick = () => { Board.size = s; LS.set('jt-bd-size', s); renderBdTools(); }; opts.appendChild(b); });
  }
  opts.hidden = !opts.children.length;
  $('#bdUndo').disabled = !Board.undo.length; $('#bdRedo').disabled = !Board.redo.length;
  bdCv.dataset.tool = t;
}
$('#bdUndo').onclick = undo;
$('#bdRedo').onclick = redo;
$('#bdFit').onclick = () => { fitAll(); saveView(); };
$('#bdBack').onclick = () => closeBoard();
$('#bdClear').onclick = () => { commitText(); if (!Board.items.size){ toast('กระดานว่างอยู่แล้ว'); return; } $('#bdAsk').hidden = false; };
$('#bdAskNo').onclick = () => { $('#bdAsk').hidden = true; };
$('#bdAsk').addEventListener('click', e => { if (e.target.id === 'bdAsk') $('#bdAsk').hidden = true; });
$('#bdAskYes').onclick = async () => {
  $('#bdAsk').hidden = true;
  const all = [...Board.items.values()].map(it => JSON.parse(JSON.stringify(plain(it))));
  Board.items = new Map(); Board.pendAdd.clear(); Board.pendDel.clear(); bdDirty(true);
  try { const { error } = await sb.rpc('board_clear'); if (error) throw error; bdSend({ op: 'clear', name: ME.name }); record({ del: all }); toast('ล้างกระดานแล้ว กดย้อนกลับได้ถ้าเผลอ'); }
  catch(e){ toast('ล้างกระดานไม่สำเร็จ'); loadBoard(); }
};

function openBoard(){
  Board.open = true; $('#draw').hidden = false; document.body.classList.add('draw-open');
  renderBdTools(); ensureView(); bdDirty(); loadBoard();
}
function closeBoard(){
  commitText(); if (cur) endGesture(true); ptrs.clear();
  Board.open = false; $('#draw').hidden = true; document.body.classList.remove('draw-open'); saveView(); flush();
}
window.addEventListener('resize', () => { if (Board.open){ placeText(); bdDirty(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Board.open) loadBoard(); });
