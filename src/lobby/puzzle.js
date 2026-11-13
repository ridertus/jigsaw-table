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
  setPressed('#tGhost', S.ghost); setPressed('#tEdge', false); setPressed('#tRef', false); $('#ref').hidden = true;
  board.classList.toggle('ghost-on', S.ghost);
  S.W = 0; S.layoutPending = true; tray.scrollLeft = 0;
  if (!$('#game').hidden) relayout();
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

/* Capture on the stable interaction container before the piece is moved to dragLayer. */
function capturePointer(e){
  const target = e.currentTarget;
  try { target.setPointerCapture(e.pointerId); return target; }
  catch(err){ console.warn('[puzzle] setPointerCapture failed; using global pointer events.', err); return null; }
}
function releasePointer(state){
  const target = state && state.captureTarget;
  if (!target || typeof target.hasPointerCapture !== 'function') return;
  try { if (target.hasPointerCapture(state.id)) target.releasePointerCapture(state.id); }
  catch(err){ console.warn('[puzzle] releasePointerCapture failed.', err); }
}
function clearPending(){ const current = pend; pend = null; releasePointer(current); }

tray.addEventListener('pointerdown', e => {
  const slot = e.target.closest('.slot'); if (!slot || drag || pend || e.button > 0) return;
  const p = S.pieces[+slot.dataset.id];
  if (p.srv.state !== 'tray') return;
  audioInit();
  if (p.holder){ toast(`${p.holder.name || 'เพื่อน'} กำลังถือชิ้นนี้อยู่`); return; }
  const captureTarget = capturePointer(e);
  pend = { p, from: 'tray', id: e.pointerId, x0: e.clientX, y0: e.clientY, type: e.pointerType, captureTarget };
  if (e.pointerType === 'mouse') e.preventDefault();
});
$('#boardArea').addEventListener('pointerdown', e => {
  if (drag || pend || e.button > 0 || !S.game || S.doneShown) return;
  const p = looseAt(e.clientX, e.clientY); if (!p) return;
  audioInit(); e.preventDefault();
  const captureTarget = capturePointer(e);
  pend = { p, from: 'loose', id: e.pointerId, x0: e.clientX, y0: e.clientY, type: e.pointerType, captureTarget };
});
window.addEventListener('pointermove', e => {
  if (drag && e.pointerId === drag.id){ drag.x = e.clientX; drag.y = e.clientY; place(); sendDrag(); e.preventDefault(); return; }
  if (pend && e.pointerId === pend.id){
    const dx = e.clientX - pend.x0, dy = e.clientY - pend.y0;
    if (Math.hypot(dx, dy) < 8) return;
    if (pend.p.holder){ clearPending(); return; }
    startDrag(e);
  }
}, { passive: false, capture: true });
window.addEventListener('pointerup', e => {
  if (pend && e.pointerId === pend.id){ const p = pend.p; clearPending(); if (S.rotate) turn(p); return; }
  if (drag && e.pointerId === drag.id){ drag.x = e.clientX; drag.y = e.clientY; place(); dropPuzzle(); }
}, true);
window.addEventListener('pointercancel', e => {
  if (pend && e.pointerId === pend.id) clearPending();
  if (drag && e.pointerId === drag.id) cancelDrag(false);
}, true);
document.addEventListener('lostpointercapture', e => {
  if (pend && e.pointerId === pend.id && e.target === pend.captureTarget) clearPending();
  else if (drag && e.pointerId === drag.id && e.target === drag.captureTarget) cancelDrag(false);
});
document.addEventListener('touchmove', e => {
  if (drag){ e.preventDefault(); return; }
  if (pend && e.touches[0]){ const t = e.touches[0]; if (pend.from === 'loose' || Math.abs(t.clientY - pend.y0) > 8) e.preventDefault(); }
}, { passive: false });

/* Pointer Events are primary; touchend is a fallback for Safari versions that omit pointerup. */
function settleDrag(){ if (drag && !drag.finishing) dropPuzzle(); }
document.addEventListener('touchend', e => { if (drag && e.touches.length === 0) settleDrag(); }, { passive: true });
document.addEventListener('touchcancel', e => {
  if (drag && e.touches.length === 0) cancelDrag(false);
  else if (pend && e.touches.length === 0) clearPending();
}, { passive: true });
window.addEventListener('blur', () => { if (drag) cancelDrag(false); clearPending(); });
document.addEventListener('visibilitychange', () => { if (document.hidden){ if (drag) cancelDrag(false); clearPending(); } });
document.addEventListener('pointerdown', e => { if (drag && e.pointerId !== drag.id) settleDrag(); }, true);

function startDrag(e){
  if (!pend || drag) return;
  const pending = pend, p = pending.p, from = pending.from;
  const rect = p.el.getBoundingClientRect();
  drag = { p, from, id: pending.id, captureTarget: pending.captureTarget, x: e.clientX, y: e.clientY, gx: 0, gy: 0, sent: 0, finishing: false };
  if (from === 'tray'){
    drag.gx = pending.x0 - (rect.left + rect.width / 2);
    drag.gy = pending.y0 - (rect.top + rect.height / 2);
  } else { const br = board.getBoundingClientRect(); drag.gx = pending.x0 - (br.left + p.srv.fx * S.W); drag.gy = pending.y0 - (br.top + p.srv.fy * S.H); }
  pend = null;
  p.where = 'drag'; p.el.className = 'piece dragging'; sizeFor(p); dragLayer.appendChild(p.el);
  p.slot.classList.add('gone');
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
  S.chan.send({ type: 'broadcast', event: 'drag', payload: { r: S.code, id: p.id, fx: +(bx / S.W).toFixed(4), fy: +(by / S.H).toFixed(4), rot: p.srv.rot, k: ME.id, name: ME.name, color: ME_COLOR } });
}
function endDrag(){
  const current = drag;
  clearTimeout(dragTimer); drag = null;
  document.body.classList.remove('is-dragging'); setHold(null);
  releasePointer(current);
}

function dropPuzzle(){
  const active = drag;
  if (!active || active.finishing) return;
  active.finishing = true;
  const p = active.p, shelf = $('.shelf').getBoundingClientRect();
  const { bx, by } = dragPos();
  console.log('[JIGSAW DROP CHECK]', {
  pointerY: active.y,
  shelfTop: shelf.top,
  bx,
  by,
  boardWidth: S.W,
  boardHeight: S.H
  });
  let res, snapped = false;
  if (active.y > shelf.top + 4) res = { ...p.srv, state: 'tray' };
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
  const active = drag;
  if (!active || active.finishing) return;
  active.finishing = true;
  const p = active.p; endDrag(); show(p); sendRelease(p);
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
    console.log('[JIGSAW RPC]', {
      requestedState: s.state,
      data,
      error,
      accepted: ok
    });
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
function sendRelease(p){ if (S.chan) S.chan.send({ type: 'broadcast', event: 'release', payload: { r: S.code, id: p.id, ...p.srv } }); }
function onDrag(m){
  if (m.r !== S.code) return;
  const p = S.pieces[m.id]; if (!p || p.srv.state === 'placed' || m.k === ME.id) return;
  if (drag && drag.p === p){ if (m.k < ME.id) cancelDrag(true); else return; }
  if (!p.holder || p.holder.key !== m.k) p.holder = { key: m.k, name: m.name, color: m.color };
  p.rpos = { fx: m.fx, fy: m.fy, rot: m.rot }; p.holdAt = Date.now();
  if (p.where === 'remote'){ p.deg = nearDeg(p.deg, m.rot); sizeFor(p); posTag(p); } else show(p);
}
function onRelease(m){
  if (m.r !== S.code) return;
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
setInterval(() => { if (S.game && !$('#game').hidden && !drag && !document.hidden) refetch(); }, 10000);

async function refetch(){
  if (!S.code) return;
  try {
    const { data } = await sb.from('pieces').select('id,state,fx,fy,rot').eq('room', S.code);
    (data || []).forEach(r => { const p = S.pieces[r.id]; if (!p || p.inflight > 0 || (drag && drag.p === p)) return;
      const s = p.srv; if (s.state !== r.state || s.rot !== r.rot || Math.abs(s.fx - r.fx) > 1e-4 || Math.abs(s.fy - r.fy) > 1e-4) applyRow(p, r); });
  } catch(e){}
}

/* lay the board out once the overlay is visible */
function relayout(){
  if (!S.game || $('#game').hidden) return;
  layout(); S.pieces.forEach(p => show(p)); applyFilter(); updateProg(); tickTime();
  S.layoutPending = false;
  if (allPlaced() && !S.doneShown) complete(true);
}
