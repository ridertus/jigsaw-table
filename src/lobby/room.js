/* ---------- the living room ---------- */
/* 22x13 tiles of 24px (wall = top 4 rows). Static art lives in `bg`; anything a person can walk
   behind is a prop with its own canvas and a base line, drawn y-sorted together with the avatars. */
const T = 24, MC = 22, MR = 13, WALLR = 4, LW = MC * T, LH = MR * T, PAD = 10;
const roomCv = $('#room'), rg = roomCv.getContext('2d');
const bg = document.createElement('canvas'); bg.width = LW + PAD * 2; bg.height = LH + PAD * 2;

/* furniture you can tap. hit = tap rectangle in room px, block = tiles nobody can stand on,
   spots = tiles you stand on to use it (default: any free tile next to `block`) */
const FURN = [
  { id: 'shelf', hit: [4, 14, 46, 108], block: [[0, 4], [1, 4]] },
  { id: 'radio', hit: [56, 24, 128, 96], block: [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]], act: 'radio' },
  { id: 'window', hit: [196, 8, 142, 56], block: [], spots: [[9, 5], [10, 5], [11, 5], [12, 5]], act: 'window' },
  { id: 'sofa', hit: [190, 64, 154, 64], block: [[8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4]], act: 'sit', seats: ['so1', 'so2', 'so3', 'so4'] },
  { id: 'side', hit: [350, 80, 32, 42], block: [[14, 4], [15, 4]] },
  { id: 'fan', hit: [384, 50, 26, 72], block: [[16, 4]] },
  { id: 'easel', hit: [410, 10, 92, 120], block: [[17, 4], [18, 4], [19, 4], [20, 4]], act: 'board' },
  { id: 'plantR', hit: [500, 40, 28, 82], block: [[21, 4]] },
  { id: 'tv', hit: [4, 104, 72, 84], block: [[0, 6], [1, 6], [2, 6], [0, 7], [1, 7], [2, 7]], act: 'tv' },
  { id: 'bean', hit: [80, 186, 44, 42], block: [[3, 8], [4, 8]], act: 'sit', seats: ['bean'] },
  { id: 'snack', hit: [70, 234, 44, 30], block: [[3, 10]] },
  { id: 'catbed', hit: [6, 232, 52, 40], block: [[0, 10], [1, 10]] },
  { id: 'table', hit: [192, 164, 144, 70], block: [[8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8]], act: 'table' },
  { id: 'cushL', hit: [164, 192, 26, 22], block: [], spots: [[7, 8]], act: 'sit', seats: ['cuL'] },
  { id: 'cushR', hit: [338, 192, 26, 22], block: [], spots: [[14, 8]], act: 'sit', seats: ['cuR'] },
  { id: 'cushB1', hit: [226, 240, 28, 22], block: [], spots: [[9, 10]], act: 'sit', seats: ['cuB1'] },
  { id: 'cushB2', hit: [276, 240, 28, 22], block: [], spots: [[11, 10]], act: 'sit', seats: ['cuB2'] },
  { id: 'cushT', hit: [250, 150, 28, 18], block: [], spots: [[10, 6]], act: 'sit', seats: ['cuT'] },
  { id: 'cab', hit: [486, 140, 42, 92], block: [[20, 7], [21, 7], [20, 8], [21, 8]] },
  { id: 'umb', hit: [500, 244, 26, 42], block: [[21, 10]] },
  { id: 'front', hit: [0, 0, 0, 0], block: Array.from({ length: MC }, (_, c) => [c, 12]).filter(([c]) => c !== 10 && c !== 11) }
];
/* places to sit: x,y = where the avatar's feet anchor, z = draw order (so a sofa never covers its sitter) */
const SEATS = {
  so1: { x: 228, y: 109, dir: 0, z: 128, kind: 'sofa' }, so2: { x: 254, y: 109, dir: 0, z: 128, kind: 'sofa' },
  so3: { x: 280, y: 109, dir: 0, z: 128, kind: 'sofa' }, so4: { x: 306, y: 109, dir: 0, z: 128, kind: 'sofa' },
  bean: { x: 102, y: 210, dir: 0, z: 228, kind: 'bean' },
  cuL: { x: 178, y: 206, dir: 3, kind: 'floor' }, cuR: { x: 351, y: 206, dir: 2, kind: 'floor' },
  cuB1: { x: 240, y: 254, dir: 1, kind: 'floor' }, cuB2: { x: 290, y: 254, dir: 1, kind: 'floor' },
  cuT: { x: 264, y: 162, dir: 0, kind: 'floor' }
};
Object.entries(SEATS).forEach(([id, s]) => s.id = id);
const blocked = Array.from({ length: MR }, (_, r) => Array.from({ length: MC }, () => r < WALLR));
FURN.forEach(f => f.block.forEach(([c, r]) => blocked[r][c] = true));
const SPAWN = [10, 11];
const Room = { me: null, others: new Map(), s: 2, ox: 0, oy: 0, cam: 0, tableImg: null, notes: [], props: [] };

/* ----- avatars ----- */
function makeAvatar(k, name, color, hair, x, y, look){
  return Object.assign({ k, name, color, hair: hair || 0, hc: null, acc: 0, x, y, path: [], dir: 0, walk: 0, bubble: null, seen: Date.now(), goal: null, sit: null, sitGoal: null, typing: 0 }, look || {});
}
const tileOf = (x, y) => [clamp(Math.floor(x / T), 0, MC - 1), clamp(Math.floor((y - 1) / T), 0, MR - 1)];
function nearestFree(c, r){
  if (!blocked[r][c]) return [c, r];
  let best = null, bd = 1e9;
  for (let rr = WALLR; rr < MR; rr++) for (let cc = 0; cc < MC; cc++) if (!blocked[rr][cc]){ const d = (cc - c) ** 2 + (rr - r) ** 2; if (d < bd){ bd = d; best = [cc, rr]; } }
  return best;
}
function findPath(from, to){
  const key = (c, r) => r * MC + c, prev = new Map([[key(...from), null]]), q = [from];
  while (q.length){
    const [c, r] = q.shift();
    if (c === to[0] && r === to[1]) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= MC || nr >= MR || blocked[nr][nc] || prev.has(key(nc, nr))) continue;
      prev.set(key(nc, nr), [c, r]); q.push([nc, nr]);
    }
  }
  if (!prev.has(key(...to))) return [];
  const out = []; let cur = to;
  while (cur && !(cur[0] === from[0] && cur[1] === from[1])){ out.unshift(cur); cur = prev.get(key(...cur)); }
  return out.map(([c, r]) => [c * T + T / 2, r * T + T - 2]);
}
function walkTo(a, tx, ty){
  const from = nearestFree(...tileOf(a.x, a.y)), to = nearestFree(...tileOf(tx, ty));
  if (!from || !to) return;
  a.sit = null;
  a.path = findPath(from, to);
  if (!a.path.length && (from[0] !== to[0] || from[1] !== to[1])) return;
  if (!a.path.length) a.path = [[from[0] * T + T / 2, from[1] * T + T - 2]];
  const last = a.path[a.path.length - 1];
  a.dest = [last[0], last[1]];
}
function stepAvatar(a, dt){
  if (!a.path.length){ a.walk = 0; return false; }
  const [px, py] = a.path[0], dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy), sp = 84 * dt;
  if (Math.abs(dx) > Math.abs(dy)) a.dir = dx < 0 ? 2 : 3; else if (Math.abs(dy) > .01) a.dir = dy < 0 ? 1 : 0;
  if (d <= sp){ a.x = px; a.y = py; a.path.shift(); } else { a.x += dx / d * sp; a.y += dy / d * sp; }
  a.walk += dt;
  if (!a.path.length){ a.walk = 0; return true; }
  return false;
}
function seatTaken(id, who){
  const all = [...Room.others.values(), Room.me];
  return all.some(a => a && a !== who && (a.sit && a.sit.id === id || a.sitGoal === id));
}
function sitDown(a, seat){
  a.path = []; a.sit = seat; a.sitGoal = null; a.x = seat.x; a.y = seat.y; a.dir = seat.dir; a.dest = [seat.x, seat.y];
}

/* ----- interactions ----- */
function furnAt(lx, ly){
  let hit = null;
  FURN.forEach(f => { if (!f.act) return; const [x, y, w, h] = f.hit; if (lx >= x && lx <= x + w && ly >= y && ly <= y + h && (!hit || y + h > hit.hit[1] + hit.hit[3])) hit = f; });
  return hit;
}
function spotsOf(f){
  if (f.spots) return f.spots.filter(([c, r]) => !blocked[r][c]);
  const out = [];
  for (let r = WALLR; r < MR; r++) for (let c = 0; c < MC; c++) if (!blocked[r][c] && f.block.some(([bc, br]) => Math.abs(bc - c) + Math.abs(br - r) === 1)) out.push([c, r]);
  return out;
}
function approach(f, a){
  a = a || Room.me; let best = null, bd = 1e9;
  spotsOf(f).forEach(([c, r]) => { const d = (c * T + 12 - a.x) ** 2 + (r * T + 22 - a.y) ** 2; if (d < bd){ bd = d; best = [c * T + 12, r * T + 22]; } });
  return best;
}
function atFurn(f, a){
  a = a || Room.me; if (a.sit) return false;
  const [c, r] = tileOf(a.x, a.y);
  return spotsOf(f).some(([sc, sr]) => sc === c && sr === r);
}
function freeSeat(f, a){
  const ids = (f.seats || []).filter(id => !seatTaken(id, a));
  if (!ids.length) return null;
  return ids.map(id => SEATS[id]).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
}
function goUse(f){
  const me = Room.me; if (!me) return;
  if (f.act === 'sit'){
    if (me.sit && f.seats.includes(me.sit.id)) return;
    const seat = freeSeat(f, me); if (!seat){ toast('ตรงนั้นมีคนนั่งแล้ว'); return; }
    me.sitGoal = seat.id;
  }
  if (atFurn(f)){ useFurn(f); return; }
  const spot = approach(f); if (!spot) return;
  walkTo(me, spot[0], spot[1]); me.goal = f; sendPos(true);
}
roomCv.addEventListener('pointerdown', e => {
  if (!Room.me || e.button > 0) return;
  audioInit();
  const lx = (e.clientX - Room.ox) / Room.s, ly = (e.clientY - Room.oy) / Room.s;
  if (lx < -PAD || ly < -PAD || lx > LW + PAD || ly > LH + PAD) return;
  $('#hint').classList.add('fade');
  const cat = catAt(lx, ly); if (cat){ petCat(cat); return; }
  const f = furnAt(lx, ly);
  if (f){ Room.me.sitGoal = null; goUse(f); return; }
  Room.me.goal = null; Room.me.sitGoal = null;
  walkTo(Room.me, lx, ly); sendPos(true);
});
function faceToward(a, f){
  const [x, y, w, h] = f.hit, fc = (x + w / 2) / T, fr = (y + h) / T - .5, [c, r] = tileOf(a.x, a.y);
  if (Math.abs(fc - c - .5) > Math.abs(fr - r - .5)) a.dir = fc < c + .5 ? 2 : 3; else a.dir = fr < r + .5 ? 1 : 0;
}
function useFurn(f){
  const me = Room.me;
  if (f.act === 'sit'){
    const seat = me.sitGoal && SEATS[me.sitGoal] && !seatTaken(me.sitGoal, me) ? SEATS[me.sitGoal] : freeSeat(f, me);
    if (seat) sitDown(me, seat); else me.sitGoal = null;
    sendPos(true); return;
  }
  faceToward(me, f); sendPos(true);
  if (f.act === 'table') openTableSheet();
  if (f.act === 'radio' || f.act === 'tv') Radio.openPanel();
  if (f.act === 'window') openWindowSheet();
  if (f.act === 'board') openBoard();
}
/* dock buttons: open right away, and stroll over so friends see where you went */
function strollTo(id){
  const f = FURN.find(x => x.id === id), me = Room.me; if (!f || !me || atFurn(f)) return;
  const spot = approach(f); if (!spot) return;
  me.goal = null; me.sitGoal = null; walkTo(me, spot[0], spot[1]); sendPos(true);
}

/* ----- frame ----- */
let lastT = performance.now();
function uiInsets(){
  const H = roomCv.clientHeight, top = $('.topbar').getBoundingClientRect().bottom + 6;
  let bottom = 0; document.querySelectorAll('.chatpanel,.dock').forEach(el => { const r = el.getBoundingClientRect(); if (r.height) bottom = Math.max(bottom, H - r.top); });
  return { top: Math.max(0, top), bottom };
}
let insets = { top: 60, bottom: 120 }, insetT = 0;
function frame(t){
  const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
  const W = roomCv.clientWidth, H = roomCv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (roomCv.width !== Math.round(W * dpr) || roomCv.height !== Math.round(H * dpr)){ roomCv.width = Math.round(W * dpr); roomCv.height = Math.round(H * dpr); }
  if (t - insetT > 500){ insetT = t; insets = uiInsets(); }
  const TW = LW + PAD * 2, TH = LH + PAD * 2, wide = W > 760;
  // on wide screens the panels float over the room's front edge (like a game HUD); on phones the room sits between them
  const top = insets.top, bottom = wide ? Math.min(insets.bottom, 64) : insets.bottom;
  const availH = Math.max(140, H - top - bottom);
  const contain = Math.min(W / TW, availH / TH);
  const s = Math.max(contain, Math.min(availH / TH, 1.75));
  Room.s = s;
  if (Room.me){ if (stepAvatar(Room.me, dt) && Room.me.goal){ const f = Room.me.goal; Room.me.goal = null; if (atFurn(f)) useFurn(f); } }
  Room.others.forEach(a => { if (stepAvatar(a, dt) && a.sitGoal && SEATS[a.sitGoal]) sitDown(a, SEATS[a.sitGoal]); });
  stepCats(dt);
  // camera follows me horizontally when the room is wider than the screen
  const rw = TW * s, rh = TH * s;
  let fx;
  if (rw <= W) fx = (W - rw) / 2;
  else { const target = clamp(W / 2 - ((Room.me ? Room.me.x : LW / 2) + PAD) * s, W - rw, 0); Room.cam += (target - Room.cam) * Math.min(1, dt * 6); fx = Room.cam; }
  Room.ox = fx + PAD * s; Room.oy = top + Math.max(0, (availH - rh) / 2) + PAD * s;
  const g = rg; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#140d10'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(Math.round(Room.ox), Math.round(Room.oy)); g.scale(s, s);
  g.drawImage(bg, -PAD, -PAD); drawWindows(g, t); drawWallLive(g, t); drawSunbeams(g);
  const all = [...Room.others.values()]; if (Room.me) all.push(Room.me);
  const items = Room.props.map(p => ({ z: p.base, p }));
  all.forEach(a => items.push({ z: a.sit && a.sit.z ? a.sit.z : a.y, a }));
  Pets.cats.forEach(c => items.push({ z: catZ(c) + .5, c }));
  items.sort((p, q) => p.z - q.z).forEach(it => { if (it.p){ g.drawImage(it.p.cv, it.p.x, it.p.y); if (it.p.live) it.p.live(g, t); } else if (it.c) drawCat(g, it.c, t); else drawAvatar(g, it.a, t); });
  drawRoomLight(g, t); drawPetHearts(g, t);
  g.restore();
  // names and bubbles in screen space
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  const now = Date.now();
  all.forEach(a => {
    const hgt = 48, sx = Room.ox + a.x * s, sy = Room.oy + (a.y - hgt) * s;
    g.font = '700 12px Nunito, Mitr, system-ui, sans-serif';
    const nw = g.measureText(a.name || '').width + 14;
    g.fillStyle = a === Room.me ? 'rgba(232,154,60,.95)' : 'rgba(26,18,24,.72)';
    roundRect(g, sx - nw / 2, sy - 20, nw, 18, 6); g.fill();
    g.fillStyle = '#fff'; g.fillText(a.name || '', sx, sy - 5);
    if (a.bubble && a.bubble.until > now) drawBubble(g, sx, sy - 30, a.bubble.text, a.bubble.until - now);
    else if (a.typing > now) drawIconBubble(g, sx, sy - 30, 'dots', t);
    else if (a.sit && Radio.isPlaying() && (hashStr(a.k + '') + Math.floor(now / 9000)) % 3 === 0) drawIconBubble(g, sx, sy - 30, 'note', t);
  });
  drawEmojis(g);
  requestAnimationFrame(frame);
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrapText(g, text, maxW){
  const out = []; let line = '';
  for (const ch of [...text]){ const t = line + ch; if (g.measureText(t).width > maxW && line){ out.push(line); line = ch; } else line = t; }
  if (line) out.push(line);
  return out.slice(0, 4);
}
/* pixel-style speech balloon: cream box, dark 2px outline, little tail */
function balloon(g, x, y, w, h){
  x = Math.round(x - w / 2); y = Math.round(y - h); w = Math.round(w); h = Math.round(h);
  g.fillStyle = '#2b1a14';
  g.fillRect(x + 2, y, w - 4, h); g.fillRect(x, y + 2, w, h - 4); g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillRect(x + w / 2 - 6, y + h - 2, 12, 4); g.fillRect(x + w / 2 - 4, y + h + 2, 8, 2); g.fillRect(x + w / 2 - 2, y + h + 4, 4, 2);
  g.fillStyle = '#fff7e8';
  g.fillRect(x + 3, y + 2, w - 6, h - 4); g.fillRect(x + 2, y + 3, w - 4, h - 6);
  g.fillRect(x + w / 2 - 4, y + h - 2, 8, 2); g.fillRect(x + w / 2 - 2, y + h, 4, 2);
  g.fillStyle = '#e9d6b4'; g.fillRect(x + 3, y + h - 4, w - 6, 2);
  return [x, y];
}
function drawBubble(g, x, y, text, left){
  g.font = '500 13px Mitr, Nunito, system-ui, sans-serif';
  const lines = wrapText(g, text, 170), lh = 18, w = Math.min(192, Math.max(...lines.map(l => g.measureText(l).width)) + 20), h = lines.length * lh + 12;
  g.globalAlpha = Math.min(1, left / 400);
  const [bx, by] = balloon(g, x, y, w, h);
  g.fillStyle = '#3b2b20'; g.textAlign = 'left'; g.textBaseline = 'bottom';
  lines.forEach((l, i) => g.fillText(l, bx + 10, by + 4 + (i + 1) * lh));
  g.textAlign = 'center'; g.globalAlpha = 1;
}
function drawIconBubble(g, x, y, kind, t){
  const [bx, by] = balloon(g, x, y, 34, 26);
  g.fillStyle = '#3b2b20';
  if (kind === 'dots') for (let i = 0; i < 3; i++){ const up = Math.floor(t / 180) % 4 === i ? 2 : 0; g.fillRect(bx + 8 + i * 7, by + 12 - up, 4, 4); }
  if (kind === 'note'){ const k = Math.floor(t / 400) % 2; g.fillRect(bx + 12, by + 15 - k, 5, 4); g.fillRect(bx + 16, by + 5 - k, 2, 13); g.fillRect(bx + 16, by + 5 - k, 7, 2); g.fillRect(bx + 21, by + 5 - k, 2, 4); }
}

/* ----- network: positions ----- */
let posSent = 0;
function sendPos(force){
  if (!S.chan || !Room.me) return;
  const now = Date.now(); if (!force && now - posSent < 3500) return; posSent = now;
  const a = Room.me, d = a.dest || [a.x, a.y];
  S.chan.send({ type: 'broadcast', event: 'pos', payload: { k: ME.id, name: ME.name, color: ME.color, ch: ME.ch, x: Math.round(a.x), y: Math.round(a.y), tx: Math.round(d[0]), ty: Math.round(d[1]), dir: a.dir, sit: a.sit ? a.sit.id : (a.sitGoal || null), v: 2 } }).catch(() => {});
}
setInterval(() => sendPos(false), 4000);
function onPos(m){
  if (!m || m.k === ME.id || m.v !== 2) return; // v1 clients use the old, smaller room
  let a = Room.others.get(m.k);
  if (!a){ a = makeAvatar(m.k, m.name, m.color, m.hair, m.x, m.y); Room.others.set(m.k, a); }
  a.name = m.name; a.color = m.color; a.ch = m.ch; a.seen = Date.now();
  const seat = m.sit && SEATS[m.sit];
  if (seat){
    if (a.sit === seat) return;
    if (a.sit || Math.hypot(a.x - m.x, a.y - m.y) > T * 4){ sitDown(a, seat); return; }
    a.sitGoal = seat.id; walkTo(a, m.tx, m.ty); a.sitGoal = seat.id;
    if (!a.path.length) sitDown(a, seat);
    return;
  }
  a.sitGoal = null;
  if (a.sit){ a.sit = null; const f = nearestFree(...tileOf(a.x, a.y)); if (f){ a.x = f[0] * T + 12; a.y = f[1] * T + 22; } }
  if (Math.hypot(a.x - m.x, a.y - m.y) > T * 4){ a.x = m.x; a.y = m.y; a.path = []; }
  const d = a.dest || [a.x, a.y];
  if (Math.hypot(d[0] - m.tx, d[1] - m.ty) > 2) walkTo(a, m.tx, m.ty);
  if (!a.path.length) a.dir = m.dir || 0;
}
setInterval(() => { const now = Date.now(); Room.others.forEach((a, k) => { if (now - a.seen > 14000) Room.others.delete(k); }); }, 3000);
