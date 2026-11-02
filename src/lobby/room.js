/* ---------- the living room ---------- */
const T = 12, MC = 20, MR = 12, LW = MC * T, LH = MR * T;
const roomCv = $('#room'), rg = roomCv.getContext('2d');
const bg = document.createElement('canvas'); bg.width = LW; bg.height = LH;
const FURN = [
  { id: 'shelf', x: 1, y: 1, w: 2, h: 3, block: [[1, 3], [2, 3]] },
  { id: 'lamp', x: 12, y: 2, w: 1, h: 2, block: [[12, 3]] },
  { id: 'radio', x: 15, y: 2, w: 3, h: 2, block: [[15, 3], [16, 3], [17, 3]], act: 'radio' },
  { id: 'plantR', x: 19, y: 3, w: 1, h: 1, block: [[19, 3]] },
  { id: 'plantL', x: 0, y: 11, w: 1, h: 1, block: [[0, 11]] },
  { id: 'table', x: 8, y: 6, w: 4, h: 2, block: [[8, 6], [9, 6], [10, 6], [11, 6], [8, 7], [9, 7], [10, 7], [11, 7]], act: 'table' },
  { id: 'sofa', x: 1, y: 7, w: 2, h: 3, block: [[1, 7], [2, 7], [1, 8], [2, 8], [1, 9], [2, 9]] },
  { id: 'arm', x: 16, y: 8, w: 2, h: 2, block: [[16, 8], [17, 8], [16, 9], [17, 9]] }
];
const blocked = Array.from({ length: MR }, (_, r) => Array.from({ length: MC }, () => r < 3));
FURN.forEach(f => f.block.forEach(([c, r]) => blocked[r][c] = true));
const SPAWN = [9, 10];
const Room = { me: null, others: new Map(), s: 3, ox: 0, oy: 0, cam: 0, tableImg: null, notes: [] };

/* ----- avatars ----- */
function makeAvatar(k, name, color, hair, x, y){ return { k, name, color, hair: hair || 0, x, y, path: [], dir: 0, walk: 0, bubble: null, seen: Date.now(), goal: null }; }
const tileOf = (x, y) => [clamp(Math.floor(x / T), 0, MC - 1), clamp(Math.floor((y - 1) / T), 0, MR - 1)];
function nearestFree(c, r){
  if (!blocked[r][c]) return [c, r];
  let best = null, bd = 1e9;
  for (let rr = 3; rr < MR; rr++) for (let cc = 0; cc < MC; cc++) if (!blocked[rr][cc]){ const d = (cc - c) ** 2 + (rr - r) ** 2; if (d < bd){ bd = d; best = [cc, rr]; } }
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
  return out.map(([c, r]) => [c * T + T / 2, r * T + T - 1]);
}
function walkTo(a, tx, ty){
  const from = nearestFree(...tileOf(a.x, a.y)), to = nearestFree(...tileOf(tx, ty));
  if (!from || !to) return;
  a.path = findPath(from, to);
  const last = a.path[a.path.length - 1];
  a.dest = last ? [last[0], last[1]] : [a.x, a.y];
}
function stepAvatar(a, dt){
  if (!a.path.length){ a.walk = 0; return false; }
  const [px, py] = a.path[0], dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy), sp = 46 * dt;
  if (Math.abs(dx) > Math.abs(dy)) a.dir = dx < 0 ? 2 : 3; else if (Math.abs(dy) > .01) a.dir = dy < 0 ? 1 : 0;
  if (d <= sp){ a.x = px; a.y = py; a.path.shift(); } else { a.x += dx / d * sp; a.y += dy / d * sp; }
  a.walk += dt;
  if (!a.path.length){ a.walk = 0; return true; }
  return false;
}

/* ----- interactions ----- */
function furnAt(lx, ly){
  return FURN.find(f => f.act && lx >= f.x * T - 4 && lx <= (f.x + f.w) * T + 4 && ly >= f.y * T - 6 && ly <= (f.y + f.h) * T + 4);
}
function approach(f){
  const me = Room.me; let best = null, bd = 1e9;
  for (let r = 3; r < MR; r++) for (let c = 0; c < MC; c++){
    if (blocked[r][c]) continue;
    const adj = f.block.some(([bc, br]) => Math.abs(bc - c) + Math.abs(br - r) === 1);
    if (!adj) continue;
    const d = (c * T + 6 - me.x) ** 2 + (r * T + 11 - me.y) ** 2;
    if (d < bd){ bd = d; best = [c * T + 6, r * T + 11]; }
  }
  return best;
}
function atFurn(f){ const [c, r] = tileOf(Room.me.x, Room.me.y); return f.block.some(([bc, br]) => Math.abs(bc - c) + Math.abs(br - r) <= 1); }
roomCv.addEventListener('pointerdown', e => {
  if (!Room.me || e.button > 0) return;
  audioInit();
  const lx = (e.clientX - Room.ox) / Room.s, ly = (e.clientY - Room.oy) / Room.s;
  if (lx < 0 || ly < 0 || lx > LW || ly > LH) return;
  $('#hint').classList.add('fade');
  const f = furnAt(lx, ly);
  if (f){
    if (atFurn(f)){ useFurn(f); return; }
    const spot = approach(f); if (!spot) return;
    walkTo(Room.me, spot[0], spot[1]); Room.me.goal = f; sendPos(true); return;
  }
  Room.me.goal = null;
  walkTo(Room.me, lx, ly); sendPos(true);
});
function useFurn(f){
  const me = Room.me;
  const fc = f.x + f.w / 2, fr = f.y + f.h / 2, [c, r] = tileOf(me.x, me.y);
  if (Math.abs(fc - c) > Math.abs(fr - r)) me.dir = fc < c ? 2 : 3; else me.dir = fr < r ? 1 : 0;
  sendPos(true);
  if (f.act === 'table') tableTapped();
  if (f.act === 'radio') Radio.openPanel();
}

/* ----- frame ----- */
let lastT = performance.now();
function frame(t){
  const dt = Math.min(.05, (t - lastT) / 1000); lastT = t;
  const W = roomCv.clientWidth, H = roomCv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (roomCv.width !== Math.round(W * dpr) || roomCv.height !== Math.round(H * dpr)){ roomCv.width = Math.round(W * dpr); roomCv.height = Math.round(H * dpr); }
  const top = 56, bottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chatH')) + 10;
  const availH = Math.max(120, H - top - bottom);
  const TW = LW + PAD * 2, TH = LH + PAD * 2;
  const contain = Math.min(W / TW, availH / TH);
  const s = Math.max(contain, Math.min(availH / TH, 3.4));
  Room.s = s;
  if (Room.me){ if (stepAvatar(Room.me, dt) && Room.me.goal){ const f = Room.me.goal; Room.me.goal = null; if (atFurn(f)) useFurn(f); } }
  Room.others.forEach(a => stepAvatar(a, dt));
  // camera follows me horizontally when the room is wider than the screen
  const rw = TW * s, rh = TH * s;
  let fx;
  if (rw <= W) fx = (W - rw) / 2;
  else { const target = clamp(W / 2 - ((Room.me ? Room.me.x : LW / 2) + PAD) * s, W - rw, 0); Room.cam += (target - Room.cam) * Math.min(1, dt * 6); fx = Room.cam; }
  Room.ox = fx + PAD * s; Room.oy = top + Math.max(0, (availH - rh) / 2) + PAD * s;
  const g = rg; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#10292d'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(Math.round(Room.ox), Math.round(Room.oy)); g.scale(s, s);
  g.drawImage(bg, -PAD, -PAD); drawTable(g, t); drawRadio(g, t);
  const all = [...Room.others.values()]; if (Room.me) all.push(Room.me);
  all.sort((a, b) => a.y - b.y).forEach(a => drawAvatar(g, a));
  g.restore();
  // names and bubbles in screen space
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  const now = Date.now();
  all.forEach(a => {
    const sx = Room.ox + a.x * s, sy = Room.oy + (a.y - 18) * s;
    g.font = '700 12px Nunito, Mitr, system-ui, sans-serif';
    const nw = g.measureText(a.name || '').width + 12;
    g.fillStyle = a === Room.me ? 'rgba(47,167,155,.9)' : 'rgba(30,30,40,.6)';
    roundRect(g, sx - nw / 2, sy - 18, nw, 18, 9); g.fill();
    g.fillStyle = '#fff'; g.fillText(a.name || '', sx, sy - 3);
    if (a.bubble && a.bubble.until > now) drawBubble(g, sx, sy - 22, a.bubble.text, a.bubble.until - now);
  });
  requestAnimationFrame(frame);
}
function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function wrapText(g, text, maxW){
  const out = []; let line = '';
  for (const ch of [...text]){ const t = line + ch; if (g.measureText(t).width > maxW && line){ out.push(line); line = ch; } else line = t; }
  if (line) out.push(line);
  return out.slice(0, 4);
}
function drawBubble(g, x, y, text, left){
  g.font = '500 13px Mitr, Nunito, system-ui, sans-serif';
  const lines = wrapText(g, text, 170), lh = 18, w = Math.min(190, Math.max(...lines.map(l => g.measureText(l).width)) + 18), h = lines.length * lh + 10;
  g.globalAlpha = Math.min(1, left / 400);
  g.fillStyle = 'rgba(255,250,241,.97)'; g.strokeStyle = 'rgba(59,43,32,.25)'; g.lineWidth = 1;
  roundRect(g, x - w / 2, y - h, w, h, 10); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 5, y - .5); g.lineTo(x + 5, y - .5); g.lineTo(x, y + 6); g.closePath(); g.fill();
  g.fillStyle = '#3b2b20'; g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, x - w / 2 + 9, y - h + 5 + (i + 1) * lh));
  g.textAlign = 'center'; g.globalAlpha = 1;
}

/* ----- network: positions ----- */
let posSent = 0;
function sendPos(force){
  if (!S.chan || !Room.me) return;
  const now = Date.now(); if (!force && now - posSent < 3500) return; posSent = now;
  const a = Room.me, d = a.dest || [a.x, a.y];
  S.chan.send({ type: 'broadcast', event: 'pos', payload: { k: ME.id, name: ME.name, color: ME.color, hair: ME.hair, x: Math.round(a.x), y: Math.round(a.y), tx: Math.round(d[0]), ty: Math.round(d[1]), dir: a.dir } }).catch(() => {});
}
setInterval(() => sendPos(false), 4000);
function onPos(m){
  if (!m || m.k === ME.id) return;
  let a = Room.others.get(m.k);
  if (!a){ a = makeAvatar(m.k, m.name, m.color, m.hair, m.x, m.y); Room.others.set(m.k, a); }
  a.name = m.name; a.color = m.color; a.hair = m.hair || 0; a.seen = Date.now();
  if (Math.hypot(a.x - m.x, a.y - m.y) > T * 4){ a.x = m.x; a.y = m.y; a.path = []; }
  const d = a.dest || [a.x, a.y];
  if (Math.hypot(d[0] - m.tx, d[1] - m.ty) > 2) walkTo(a, m.tx, m.ty);
  if (!a.path.length) a.dir = m.dir || 0;
}
setInterval(() => { const now = Date.now(); Room.others.forEach((a, k) => { if (now - a.seen > 14000) Room.others.delete(k); }); }, 3000);
