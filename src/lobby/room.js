/* ---------- the living room ----------
   The room is a painted picture (assets/room/room-day.webp + room-night.webp, same geometry) in image pixels.
   People walk on a fine grid laid over the floor polygon; things you can walk behind are cut out of the
   picture by assets/room/room-front-mask.png and drawn y-sorted together with avatars and cats. */
const RW = 1672, RH = 941, G = 12, GC = Math.ceil(RW / G), GR = Math.ceil(RH / G), SC = 3; // SC: sprite pixel size in image px
const roomCv = $('#room'), rg = roomCv.getContext('2d');

/* floor you can stand on (image px) */
const FLOOR = [[345, 452], [372, 412], [650, 412], [652, 446], [1112, 450], [1118, 396], [1300, 400], [1300, 428], [1470, 430], [1478, 470],
  [1478, 612], [1458, 632], [1418, 672], [1418, 704], [1262, 706], [1094, 712], [1094, 782], [950, 782], [950, 712], [300, 712], [212, 694], [190, 668], [112, 600], [104, 506]];
/* footprints of things standing on the floor: [kind, ...] ellipse cx,cy,rx,ry | poly points */
const OBST = [
  ['ell', 420, 515, 96, 46], ['ell', 345, 598, 100, 34], ['ell', 250, 576, 30, 18],
  ['poly', [[770, 484], [1108, 478], [1182, 580], [1166, 596], [830, 604], [812, 600]]],
  ['poly', [[1218, 360], [1300, 360], [1300, 404], [1218, 404]]], ['poly', [[90, 630], [222, 630], [222, 712], [90, 712]]],
  ['poly', [[1340, 392], [1480, 392], [1480, 436], [1340, 436]]]
];
function inPoly(x, y, pts){ let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const blocked = Array.from({ length: GR }, (_, r) => Array.from({ length: GC }, (_, c) => {
  const x = c * G + G / 2, y = r * G + G / 2;
  if (!inPoly(x, y, FLOOR)) return true;
  return OBST.some(o => o[0] === 'ell' ? ((x - o[1]) / o[3]) ** 2 + ((y - o[2]) / o[4]) ** 2 < 1 : inPoly(x, y, o[1]));
}));

/* things you can tap. hit = tap rect, spots = where to stand to use it */
const FURN = [
  { id: 'radio', hit: [378, 200, 264, 104], spots: [[510, 440], [600, 440]], act: 'radio' },
  { id: 'tv', hit: [88, 228, 258, 222], spots: [[372, 470], [330, 490]], act: 'tv' },
  { id: 'window', hit: [662, 0, 448, 250], spots: [[860, 476], [960, 476]], act: 'window' },
  { id: 'sofa', hit: [648, 252, 466, 192], spots: [[805, 472], [905, 472], [1005, 472]], act: 'sit', seats: ['so1', 'so2', 'so3'] },
  { id: 'easel', hit: [1340, 205, 152, 222], spots: [[1400, 452], [1320, 452]], act: 'board' },
  { id: 'bean', hit: [334, 418, 172, 140], spots: [[540, 540], [520, 500]], act: 'sit', seats: ['bean'] },
  { id: 'table', hit: [766, 474, 420, 168], spots: [[730, 590], [1215, 570], [960, 676], [950, 466]], act: 'table' },
  { id: 'cuBL', hit: [700, 502, 96, 66], spots: [[745, 545]], act: 'sit', seats: ['cuBL'] },
  { id: 'cuBR', hit: [1118, 494, 110, 66], spots: [[1172, 535]], act: 'sit', seats: ['cuBR'] },
  { id: 'cuFL', hit: [724, 578, 116, 74], spots: [[782, 622]], act: 'sit', seats: ['cuFL'] },
  { id: 'cuFM', hit: [962, 600, 126, 64], spots: [[1025, 638]], act: 'sit', seats: ['cuFM'] },
  { id: 'cuFR', hit: [1168, 566, 124, 76], spots: [[1230, 612]], act: 'sit', seats: ['cuFR'] }
];
/* x,y = feet anchor of a sitting avatar, z = draw order */
const SEATS = {
  so1: { x: 808, y: 424, dir: 0, kind: 'sofa' }, so2: { x: 906, y: 424, dir: 0, kind: 'sofa' }, so3: { x: 1004, y: 424, dir: 0, kind: 'sofa' },
  bean: { x: 420, y: 506, dir: 0, z: 549, kind: 'bean' },
  cuBL: { x: 748, y: 546, dir: 3, kind: 'floor' }, cuBR: { x: 1172, y: 538, dir: 2, kind: 'floor' },
  cuFL: { x: 782, y: 628, dir: 1, kind: 'floor' }, cuFM: { x: 1025, y: 642, dir: 1, kind: 'floor' }, cuFR: { x: 1230, y: 616, dir: 1, kind: 'floor' }
};
Object.entries(SEATS).forEach(([id, s]) => s.id = id);
const SPAWN = [1022, 760];
const Room = { me: null, others: new Map(), s: 1, ox: 0, oy: 0, cam: 0, tableImg: null, props: [], nightK: 0 };

/* ----- avatars ----- */
function makeAvatar(k, name, color, hair, x, y, look){
  return Object.assign({ k, name, color, hair: hair || 0, hc: null, acc: 0, x, y, path: [], dir: 0, walk: 0, bubble: null, seen: Date.now(), goal: null, sit: null, sitGoal: null, typing: 0 }, look || {});
}
const tileOf = (x, y) => [clamp(Math.floor(x / G), 0, GC - 1), clamp(Math.floor(y / G), 0, GR - 1)];
const tileXY = (c, r) => [c * G + G / 2, r * G + G / 2];
function nearestFree(c, r){
  if (!blocked[r][c]) return [c, r];
  for (let d = 1; d < 40; d++) for (let dr = -d; dr <= d; dr++) for (const dc of [-d, d]) {
    for (const [cc, rr] of [[c + dc, r + dr], [c + dr, r + dc]]) if (cc >= 0 && rr >= 0 && cc < GC && rr < GR && !blocked[rr][cc]) return [cc, rr];
  }
  return null;
}
function clearLine(x0, y0, x1, y1){
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (G / 2));
  for (let i = 0; i <= n; i++){ const [c, r] = tileOf(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); if (blocked[r][c]) return false; }
  return true;
}
/* 8-way BFS on the grid, then pull the string tight so people walk in straight lines */
function findPath(from, to, x0, y0){
  const key = (c, r) => r * GC + c, prev = new Int32Array(GC * GR).fill(-2), q = [key(...from)], goal = key(...to);
  prev[q[0]] = -1;
  for (let h = 0; h < q.length; h++){
    const cur = q[h]; if (cur === goal) break;
    const c = cur % GC, r = (cur / GC) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]){
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= GC || nr >= GR || blocked[nr][nc]) continue;
      if (dc && dr && (blocked[r][nc] || blocked[nr][c])) continue;
      const k = key(nc, nr); if (prev[k] !== -2) continue; prev[k] = cur; q.push(k);
    }
  }
  if (prev[goal] === -2) return [];
  const cells = []; for (let k = goal; k !== -1; k = prev[k]) cells.unshift(tileXY(k % GC, (k / GC) | 0));
  const out = []; let ax = x0 == null ? cells[0][0] : x0, ay = y0 == null ? cells[0][1] : y0, i = 0;
  while (i < cells.length - 1){
    let j = cells.length - 1; while (j > i + 1 && !clearLine(ax, ay, cells[j][0], cells[j][1])) j--;
    out.push(cells[j]); [ax, ay] = cells[j]; i = j;
  }
  return out;
}
function walkTo(a, tx, ty){
  const from = nearestFree(...tileOf(a.x, a.y)), to = nearestFree(...tileOf(tx, ty));
  if (!from || !to) return;
  a.sit = null;
  const exact = !blocked[tileOf(tx, ty)[1]][tileOf(tx, ty)[0]];
  a.path = findPath(from, to, a.x, a.y);
  if (exact && a.path.length && clearLine(a.path[a.path.length - 1][0], a.path[a.path.length - 1][1], tx, ty)) a.path[a.path.length - 1] = [tx, ty];
  else if (exact && !a.path.length) a.path = [[tx, ty]];
  if (!a.path.length) return;
  const last = a.path[a.path.length - 1]; a.dest = [last[0], last[1]];
}
function stepAvatar(a, dt){
  if (!a.path.length){ a.walk = 0; return false; }
  const [px, py] = a.path[0], dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy), sp = 230 * dt;
  if (Math.abs(dx) > Math.abs(dy) * .8) a.dir = dx < 0 ? 2 : 3; else if (Math.abs(dy) > .01) a.dir = dy < 0 ? 1 : 0;
  if (d <= sp){ a.x = px; a.y = py; a.path.shift(); } else { a.x += dx / d * sp; a.y += dy / d * sp; }
  a.walk += dt;
  if (!a.path.length){ a.walk = 0; return true; }
  return false;
}
function seatTaken(id, who){ return [...Room.others.values(), Room.me].some(a => a && a !== who && (a.sit && a.sit.id === id || a.sitGoal === id)); }
function sitDown(a, seat){ a.path = []; a.sit = seat; a.sitGoal = null; a.x = seat.x; a.y = seat.y; a.dir = seat.dir; a.dest = [seat.x, seat.y]; }

/* ----- interactions ----- */
function furnAt(lx, ly){
  let hit = null;
  FURN.forEach(f => { const [x, y, w, h] = f.hit; if (lx >= x && lx <= x + w && ly >= y && ly <= y + h && (!hit || w * h < hit.hit[2] * hit.hit[3])) hit = f; });
  return hit;
}
function approach(f, a){
  a = a || Room.me; let best = null, bd = 1e9;
  f.spots.forEach(([x, y]) => { const d = (x - a.x) ** 2 + (y - a.y) ** 2; if (d < bd){ bd = d; best = [x, y]; } });
  return best;
}
function atFurn(f, a){ a = a || Room.me; if (a.sit) return false; return f.spots.some(([x, y]) => Math.hypot(x - a.x, y - a.y) < 30); }
function freeSeat(f, a){
  const ids = (f.seats || []).filter(id => !seatTaken(id, a)); if (!ids.length) return null;
  return ids.map(id => SEATS[id]).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
}
function goUse(f){
  const me = Room.me; if (!me) return;
  let spot = approach(f);
  if (f.act === 'sit'){
    if (me.sit && f.seats.includes(me.sit.id)) return;
    const seat = freeSeat(f, me); if (!seat){ toast('ตรงนั้นมีคนนั่งแล้ว'); return; }
    me.sitGoal = seat.id;
    spot = f.spots[f.seats.indexOf(seat.id)] || spot;
  }
  if (atFurn(f) && !(f.act === 'sit' && Math.hypot(spot[0] - me.x, spot[1] - me.y) > 30)){ useFurn(f); return; }
  if (!spot) return;
  walkTo(me, spot[0], spot[1]); me.goal = f; sendPos(true);
}
function toRoom(e){ return [(e.clientX - Room.ox) / Room.s, (e.clientY - Room.oy) / Room.s]; }
roomCv.addEventListener('pointerdown', e => {
  if (!Room.me || e.button > 0) return;
  audioInit();
  const [lx, ly] = toRoom(e);
  if (lx < 0 || ly < 0 || lx > RW || ly > RH) return;
  $('#hint').classList.add('fade');
  const cat = catAt(lx, ly); if (cat){ petCat(cat); return; }
  const f = furnAt(lx, ly);
  if (f){ Room.me.sitGoal = null; goUse(f); return; }
  Room.me.goal = null; Room.me.sitGoal = null;
  walkTo(Room.me, lx, ly); sendPos(true);
});
function faceToward(a, f){
  const [x, y, w, h] = f.hit, dx = x + w / 2 - a.x, dy = y + h / 2 - a.y;
  if (Math.abs(dx) > Math.abs(dy)) a.dir = dx < 0 ? 2 : 3; else a.dir = dy < 0 ? 1 : 0;
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
/* the part of the picture worth showing: drop some dark ceiling and the floor below the platform */
const VIEW = { x: 0, y: 40, w: RW, h: 830 };
function frame(t){
  const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
  const W = roomCv.clientWidth, H = roomCv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (roomCv.width !== Math.round(W * dpr) || roomCv.height !== Math.round(H * dpr)){ roomCv.width = Math.round(W * dpr); roomCv.height = Math.round(H * dpr); }
  if (t - insetT > 500){ insetT = t; insets = uiInsets(); }
  const wide = W > 760, top = wide ? 0 : insets.top, bottom = wide ? 0 : insets.bottom;
  const availH = Math.max(160, H - top - bottom);
  // wide screens: fill the window (HUD floats over the edges). phones: room between the HUD, pan sideways
  const cover = Math.max(W / VIEW.w, availH / VIEW.h), contain = Math.min(W / VIEW.w, availH / VIEW.h);
  const s = wide ? Math.min(cover, contain * 1.12) : availH / VIEW.h;
  Room.s = s;
  if (Room.me){ if (stepAvatar(Room.me, dt) && Room.me.goal){ const f = Room.me.goal; Room.me.goal = null; if (atFurn(f) || (f.act === 'sit' && Room.me.sitGoal)) useFurn(f); } }
  Room.others.forEach(a => { if (stepAvatar(a, dt) && a.sitGoal && SEATS[a.sitGoal]) sitDown(a, SEATS[a.sitGoal]); });
  stepCats(dt);
  const vw = VIEW.w * s, vh = VIEW.h * s;
  let fx;
  if (vw <= W) fx = (W - vw) / 2;
  else { const target = clamp(W / 2 - ((Room.me ? Room.me.x : RW / 2) - VIEW.x) * s, W - vw, 0); Room.cam += (target - Room.cam) * Math.min(1, dt * 5); fx = Room.cam; }
  const fy = top + (availH - vh) / 2;
  Room.ox = fx - VIEW.x * s; Room.oy = fy - VIEW.y * s;
  const g = rg; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#140d10'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(Room.ox, Room.oy); g.scale(s, s);
  const nk = Room.nightK = Room.nightK + ((isNightWx() ? 1 : 0) - Room.nightK) * Math.min(1, dt * 1.6);
  drawRoomBase(g, nk); drawEasel(g); drawWeatherFx(g, t);
  const all = [...Room.others.values()]; if (Room.me) all.push(Room.me);
  const items = Room.props.map(p => ({ z: p.base, p }));
  all.forEach(a => items.push({ z: a.sit && a.sit.z ? a.sit.z : a.y, a }));
  Pets.cats.forEach(c => items.push({ z: catZ(c) + .5, c }));
  items.sort((p, q) => p.z - q.z).forEach(it => { if (it.p) drawProp(g, it.p, nk, t); else if (it.c) drawCat(g, it.c, t); else drawAvatar(g, it.a, t); });
  drawRoomLight(g, t); drawPetHearts(g, t);
  g.restore();
  // names and bubbles in screen space
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  const now = Date.now();
  all.forEach(a => {
    const hgt = (a.sit ? 30 : 35) * SC, sx = Room.ox + a.x * s, sy = Room.oy + (a.y - hgt) * s;
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

/* ----- network: positions (v3 = picture room, image px) ----- */
let posSent = 0;
function sendPos(force){
  if (!S.chan || !Room.me) return;
  const now = Date.now(); if (!force && now - posSent < 3500) return; posSent = now;
  const a = Room.me, d = a.dest || [a.x, a.y];
  S.chan.send({ type: 'broadcast', event: 'pos', payload: { k: ME.id, name: ME.name, color: ME.color, hair: ME.hair, hc: ME.hc, acc: ME.acc, x: Math.round(a.x), y: Math.round(a.y), tx: Math.round(d[0]), ty: Math.round(d[1]), dir: a.dir, sit: a.sit ? a.sit.id : (a.sitGoal || null), v: 3 } }).catch(() => {});
}
setInterval(() => sendPos(false), 4000);
function onPos(m){
  if (!m || m.k === ME.id || m.v !== 3) return; // older clients use a different room
  let a = Room.others.get(m.k);
  if (!a){ a = makeAvatar(m.k, m.name, m.color, m.hair, m.x, m.y); Room.others.set(m.k, a); }
  a.name = m.name; a.color = m.color; a.hair = m.hair || 0; a.hc = m.hc == null ? null : m.hc; a.acc = m.acc || 0; a.seen = Date.now();
  const seat = m.sit && SEATS[m.sit];
  if (seat){
    if (a.sit === seat) return;
    if (a.sit || Math.hypot(a.x - m.x, a.y - m.y) > 200){ sitDown(a, seat); return; }
    walkTo(a, m.tx, m.ty); a.sitGoal = seat.id;
    if (!a.path.length) sitDown(a, seat);
    return;
  }
  a.sitGoal = null;
  if (a.sit){ a.sit = null; const f = nearestFree(...tileOf(a.x, a.y + 30)); if (f){ [a.x, a.y] = tileXY(...f); } }
  if (Math.hypot(a.x - m.x, a.y - m.y) > 200){ a.x = m.x; a.y = m.y; a.path = []; }
  const d = a.dest || [a.x, a.y];
  if (Math.hypot(d[0] - m.tx, d[1] - m.ty) > 4) walkTo(a, m.tx, m.ty);
  if (!a.path.length) a.dir = m.dir || 0;
}
setInterval(() => { const now = Date.now(); Room.others.forEach((a, k) => { if (now - a.seen > 14000) Room.others.delete(k); }); }, 3000);
