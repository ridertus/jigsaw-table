/* ---------- house cats ----------
   Everyone sees the same cats without any network traffic: each cat follows a schedule derived from
   the shared server clock (`serverNow`). Time is cut into slots; in slot k a cat walks to spot S(k)
   (or, sometimes, wanders over to a person) and naps/sits there until the next slot.
   Petting is the only thing sent over the network (`pet` broadcast) so the hearts show for everyone. */
const CAT_SPOTS = [
  // x,y = where the cat rests; floor = where it stands before hopping up (omit for floor spots); z = draw order
  { id: 'bed', x: 32, y: 257, z: 273, pose: 'sleep' },
  { id: 'sofaArm', x: 336, y: 82, z: 129, pose: 'loaf', floor: [348, 136] },
  { id: 'sofaSeat', x: 214, y: 102, z: 129, pose: 'sleep', floor: [208, 138] },
  { id: 'sofaBack', x: 300, y: 64, z: 129, pose: 'sleep', floor: [300, 136] },
  { id: 'table', x: 326, y: 214, z: 233, pose: 'loaf', floor: [346, 236] },
  { id: 'cabR', x: 494, y: 166, z: 233, pose: 'sleep', floor: [472, 190] },
  { id: 'tvTop', x: 68, y: 148, z: 191, pose: 'sit', floor: [84, 166] },
  { id: 'bean', x: 96, y: 200, z: 229, pose: 'sleep', floor: [120, 236] },
  { id: 'musicTop', x: 178, y: 70, z: 121, pose: 'loaf', floor: [180, 136] },
  { id: 'rug', x: 300, y: 270, pose: 'groom' },
  { id: 'window', x: 360, y: 150, pose: 'sit' },
  { id: 'door', x: 254, y: 286, pose: 'loaf' }
];
const CATS = [
  { id: 'mochi', name: 'โมจิ', coat: 'orange', slot: 61000, phase: 0, like: ['bed', 'sofaSeat', 'table', 'rug'] },
  { id: 'kaopun', name: 'ข้าวปั้น', coat: 'white', slot: 73000, phase: 17000, like: ['cabR', 'sofaBack', 'bean', 'window'] },
  { id: 'cocoa', name: 'โกโก้', coat: 'black', slot: 83000, phase: 39000, like: ['tvTop', 'musicTop', 'sofaArm', 'door'] }
];
const COATS = {
  orange: { base: '#e8954a', light: '#f6b878', dark: '#c06f2e', mark: '#c86a28', belly: '#f8dcb4', eye: '#3a7a3a' },
  white: { base: '#f4f0e8', light: '#ffffff', dark: '#d6cfc2', mark: '#9aa0aa', belly: '#ffffff', eye: '#4a8ad8' },
  black: { base: '#3a3640', light: '#56505e', dark: '#26232a', mark: '#26232a', belly: '#f2ece2', eye: '#e8c040' }
};
const spotById = id => CAT_SPOTS.find(s => s.id === id);
const catNow = () => { const n = serverNow(); return Number.isFinite(n) ? n : Date.now(); };
const Pets = { cats: [], hearts: [] };

function catRand(cat, k, salt){ return hashStr(cat.id + ':' + k + ':' + salt) / 4294967296; }
/* what slot k means for a cat: {spot, follow} */
function catPlan(cat, k){
  if (catRand(cat, k, 'stay') < .3 && k > 0) return catPlan(cat, k - 1);  // keep napping
  const follow = catRand(cat, k, 'f') < .16;
  // cats earlier in the list have first pick, so two cats don't squeeze into the same spot
  const idx = CATS.findIndex(c => c.id === cat.id), t0 = k * cat.slot - cat.phase;
  const taken = CATS.slice(0, idx).map(o => catPlan(o, Math.floor((t0 + o.phase) / o.slot)).spot.id);
  const pool0 = catRand(cat, k, 'p') < .7 ? cat.like : CAT_SPOTS.map(s => s.id), pool = pool0.filter(id => !taken.includes(id));
  const list = pool.length ? pool : CAT_SPOTS.map(s => s.id).filter(id => !taken.includes(id));
  return { spot: spotById(list[Math.floor(catRand(cat, k, 's') * list.length)]), follow, k };
}
function floorPoint(spot){ return spot.floor || [spot.x, spot.y]; }
function initCats(){
  Pets.cats = CATS.map(c => {
    const now = catNow(), k = Math.floor((now + c.phase) / c.slot), plan = catPlan(c, k), s = plan.spot;
    return Object.assign({}, c, { k, x: s.x, y: s.y, dir: 3, mode: 'rest', spot: s, restPose: s.pose, up: !!s.floor, upSpot: s, path: [], steps: [], walk: 0, hop: null, happy: 0, tgt: null });
  });
}
function catRoute(cat, to){
  const from = nearestFree(...tileOf(cat.x, cat.y)), dst = nearestFree(...tileOf(to[0], to[1]));
  const p = from && dst ? findPath(from, dst) : [];
  const [tc, tr] = tileOf(to[0], to[1]);
  if (!blocked[tr][tc]) p.push([to[0], to[1]]); // finish exactly on the point, cats aren't stuck to tile centres
  return p;
}
function startSlot(cat, k){
  cat.k = k; const plan = catPlan(cat, k), s = plan.spot;
  if (!plan.follow && s === cat.spot && cat.mode === 'rest') return;   // same nap spot: keep sleeping
  cat.mode = 'move'; cat.path = []; cat.steps = [];
  if (cat.up && cat.upSpot && !cat.hop) cat.steps.push({ hop: cat.upSpot.floor, down: true });
  if (plan.follow){
    const people = [...Room.others.values(), Room.me].filter(Boolean).sort((a, b) => String(a.k).localeCompare(String(b.k)));
    if (people.length){ cat.steps.push({ follow: people[Math.floor(catRand(cat, k, 'w') * people.length)].k }); cat.spot = null; return; }
  }
  cat.steps.push({ walk: floorPoint(s) });
  if (s.floor) cat.steps.push({ hop: [s.x, s.y], up: s });
  cat.steps.push({ rest: s });
  cat.spot = s;
}
function stepCat(cat, dt){
  const now = catNow(), k = Math.floor((now + cat.phase) / cat.slot);
  if (k !== cat.k) startSlot(cat, k);
  if (cat.hop){
    const h = cat.hop; h.t += dt / .45;
    const p = Math.min(1, h.t); cat.x = h.x0 + (h.x1 - h.x0) * p; cat.y = h.y0 + (h.y1 - h.y0) * p; cat.lift = Math.sin(p * Math.PI) * 14;
    if (p >= 1){ cat.hop = null; cat.lift = 0; if (h.up){ cat.up = true; cat.upSpot = h.up; } }
    return;
  }
  if (cat.path.length){
    const [px, py] = cat.path[0], dx = px - cat.x, dy = py - cat.y, d = Math.hypot(dx, dy), sp = (cat.mode === 'follow' ? 52 : 38) * dt;
    if (Math.abs(dx) > .5) cat.dir = dx < 0 ? 2 : 3;
    if (d <= sp){ cat.x = px; cat.y = py; cat.path.shift(); } else { cat.x += dx / d * sp; cat.y += dy / d * sp; }
    cat.walk += dt; return;
  }
  cat.walk = 0;
  if (cat.mode === 'follow'){
    const who = cat.tgt === ME.id ? Room.me : Room.others.get(cat.tgt);
    if (!who){ cat.mode = 'rest'; cat.restPose = 'sit'; return; }
    const tx = who.x + (cat.x < who.x ? -18 : 18), ty = who.y + 2;
    if (Math.hypot(tx - cat.x, ty - cat.y) > 30 && (cat.repath || 0) < now){ cat.path = catRoute(cat, [tx, ty]); cat.repath = now + 1200; }
    else if (!cat.path.length) cat.dir = who.x < cat.x ? 2 : 3;
    return;
  }
  const st = cat.steps.shift();
  if (!st) return;
  if (st.hop){
    if (st.down) cat.up = false;
    cat.hop = { x0: cat.x, y0: cat.y, x1: st.hop[0], y1: st.hop[1], t: 0, up: st.up || null };
    if (Math.abs(st.hop[0] - cat.x) > 1) cat.dir = st.hop[0] < cat.x ? 2 : 3; return;
  }
  if (st.walk){ cat.path = catRoute(cat, st.walk); return; }
  if (st.follow){ cat.mode = 'follow'; cat.tgt = st.follow; cat.repath = 0; return; }
  if (st.rest){ cat.mode = 'rest'; cat.restPose = st.rest.pose; cat.x = st.rest.x; cat.y = st.rest.y; }
}
function catPose(cat, t){
  if (cat.hop) return 'jump';
  if (cat.path.length) return 'walk';
  if (cat.happy > performance.now()) return cat.restPose === 'sleep' ? 'loaf' : 'sit';
  if (cat.mode === 'follow') return 'sit';
  return cat.restPose || 'sit';
}
function catZ(cat){
  if (cat.mode === 'rest' && cat.spot && cat.spot.z && !cat.path.length && !cat.hop) return cat.spot.z;
  if (cat.hop && cat.spot && cat.spot.z) return Math.max(cat.y, cat.spot.z);
  return cat.y;
}

/* ----- drawing: 24x18 side-view sprites (facing left; mirrored for right) ----- */
const catCache = new Map();
function catSprite(coat, pose, frame, happy){
  const key = coat + pose + frame + happy; let c = catCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = 26; c.height = 20;
  const g = c.getContext('2d'), C = COATS[coat], R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x + 1, y + 1, w, h); };
  const head = (hx, hy, closed) => {
    R(hx, hy + 1, 8, 6, C.base); R(hx + 1, hy, 6, 1, C.base); R(hx, hy - 2, 2, 3, C.base); R(hx + 6, hy - 2, 2, 3, C.base);
    R(hx + 1, hy - 1, 1, 1, '#f3a6a0'); R(hx + 6, hy - 1, 1, 1, '#f3a6a0');
    R(hx + 1, hy + 1, 6, 1, C.light);
    if (coat === 'orange'){ R(hx + 3, hy, 2, 2, C.mark); }
    if (coat === 'white'){ R(hx + 5, hy - 1, 3, 3, C.mark); }
    if (closed || happy){ R(hx + 1, hy + 4, 2, 1, '#2b1a14'); R(hx + 5, hy + 4, 2, 1, '#2b1a14'); if (happy){ R(hx + 1, hy + 3, 1, 1, '#2b1a14'); R(hx + 6, hy + 3, 1, 1, '#2b1a14'); } }
    else { R(hx + 1, hy + 3, 2, 2, C.eye); R(hx + 5, hy + 3, 2, 2, C.eye); R(hx + 1, hy + 3, 1, 1, '#1d1a24'); R(hx + 5, hy + 3, 1, 1, '#1d1a24'); }
    R(hx + 3, hy + 5, 2, 1, '#f3a6a0'); R(hx, hy + 6, 8, 1, C.belly);
  };
  const stripes = (x, y, w) => { if (coat === 'orange') for (let i = 2; i < w - 1; i += 3) R(x + i, y, 1, 3, C.mark); if (coat === 'white') R(x + 3, y, 5, 3, C.mark); };
  if (pose === 'walk' || pose === 'jump'){
    const f = pose === 'jump' ? 1 : frame % 4, up = f === 1 || f === 3 ? 1 : 0;
    R(6, 7 - up, 12, 6, C.base); R(6, 7 - up, 12, 1, C.light); R(7, 12 - up, 10, 1, C.belly); stripes(8, 7 - up, 10);
    const legs = pose === 'jump' ? [[5, 13, 2, 3], [16, 11, 2, 3]] : [[7 + (f === 1 ? -1 : f === 3 ? 1 : 0), 13 - up, 2, 4], [10, 13 - up, 2, 3 + up], [14 + (f === 1 ? 1 : f === 3 ? -1 : 0), 13 - up, 2, 4], [17, 13 - up, 2, 3 + up]];
    legs.forEach(([x, y, w, h]) => { R(x, y, w, h, C.base); R(x, y + h - 1, w, 1, coat === 'black' ? '#f2ece2' : C.dark); });
    R(18, 4 - up + (f % 2), 2, 5, C.base); R(19, 2 - up + (f % 2), 2, 3, C.base); R(20, 1 - up, 1, 2, C.dark); // tail up
    head(0, 3 - up, false);
  } else if (pose === 'sit'){
    R(8, 6, 9, 10, C.base); R(9, 6, 7, 1, C.light); R(9, 10, 5, 6, C.belly); stripes(12, 7, 6);
    R(8, 15, 3, 2, C.base); R(12, 15, 3, 2, C.base); R(16, 13, 5, 3, C.base); R(20, 11, 2, 3, C.base); R(17, 15, 4, 1, C.dark);
    if (coat === 'black'){ R(8, 16, 3, 1, '#f2ece2'); R(12, 16, 3, 1, '#f2ece2'); }
    head(5, 1, frame === 1);
  } else if (pose === 'loaf'){
    R(5, 8, 15, 8, C.base); R(6, 8, 13, 1, C.light); R(5, 15, 15, 1, C.dark); stripes(9, 8, 10);
    R(18, 13, 5, 2, C.base); R(22, 12, 1, 2, C.dark);
    head(1, 5, frame === 1);
  } else if (pose === 'groom'){
    R(8, 6, 9, 10, C.base); R(9, 10, 5, 6, C.belly); stripes(12, 7, 6); R(16, 13, 5, 3, C.base);
    head(5, 2 + (frame % 2), true); R(6, 8 - (frame % 2), 2, 3, C.base); R(6, 7 - (frame % 2), 2, 1, '#f3a6a0');
  } else { // sleep: curled into a round ball, head resting on the tail
    const b = frame === 1 ? 1 : 0, E = (cx, cy, rx, ry, col) => { for (let yy = -ry; yy <= ry; yy++){ const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy / (ry + .5)) ** 2))); R(cx - hw, cy + yy, hw * 2, 1, col); } };
    E(13, 12 - b, 9, 5 + b, C.base); E(14, 11 - b, 6, 2, C.light);
    if (coat === 'orange') for (let i = 0; i < 4; i++) R(11 + i * 3, 8 - b, 1, 4, C.mark);
    if (coat === 'white'){ E(16, 10 - b, 3, 2, C.mark); }
    R(7, 15, 14, 2, C.base); R(9, 16, 12, 1, coat === 'black' ? '#56505e' : C.dark); R(19, 13, 3, 3, C.dark); // tail wrapped round the front
    E(7, 13, 4, 3, C.base); R(3, 9, 2, 3, C.base); R(8, 9, 2, 3, C.base); R(3, 10, 1, 1, '#f3a6a0'); R(9, 10, 1, 1, '#f3a6a0'); // head + ears
    R(5, 13, 2, 1, '#2b1a14'); R(8, 13, 2, 1, '#2b1a14'); R(6, 15, 2, 1, '#f3a6a0'); R(4, 14, 7, 1, C.belly);
  }
  outlineSprite(c);
  catCache.set(key, c); return c;
}
function drawCat(g, cat, t){
  const pose = catPose(cat, t), happy = cat.happy > performance.now();
  const frame = pose === 'walk' ? Math.floor(cat.walk * 8) % 4 : pose === 'sleep' ? Math.floor(t / 1400) % 2 : pose === 'groom' ? Math.floor(t / 300) % 2 : (Math.floor((t + hashStr(cat.id) % 3000) / 2600) % 5 === 0 ? 1 : 0);
  const spr = catSprite(cat.coat, pose, frame, happy ? 1 : 0), x = Math.round(cat.x), y = Math.round(cat.y - (cat.lift || 0));
  if (!cat.lift){ g.fillStyle = 'rgba(30,15,10,.25)'; g.fillRect(x - 8, y - 1, 16, 2); }
  if (cat.dir === 3){ g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(spr, -13, y - 19); g.restore(); }
  else g.drawImage(spr, x - 13, y - 19);
  if (pose === 'sleep' && !happy){
    const p = (t / 2400 + hashStr(cat.id) % 7 / 7) % 1; g.globalAlpha = p < .8 ? 1 - p / .8 : 0; g.fillStyle = '#fff8ea';
    const zx = x + (cat.dir === 3 ? 8 : -12) - p * 4, zy = y - 18 - p * 12; g.fillRect(zx, zy, 4, 1); g.fillRect(zx + 2, zy + 1, 1, 1); g.fillRect(zx + 1, zy + 2, 1, 1); g.fillRect(zx, zy + 3, 4, 1); g.globalAlpha = 1;
  }
}
/* hearts float up in room space */
function drawPetHearts(g, t){
  const now = performance.now();
  Pets.hearts = Pets.hearts.filter(h => now - h.at < 1600);
  Pets.hearts.forEach(h => {
    const cat = Pets.cats.find(c => c.id === h.cat); if (!cat) return;
    const p = (now - h.at) / 1600, x = Math.round(cat.x + h.dx + Math.sin(p * 8 + h.dx) * 3), y = Math.round(cat.y - 22 - (cat.lift || 0) - p * 26);
    g.globalAlpha = 1 - p; g.fillStyle = '#2b1a14'; g.fillRect(x - 1, y, 7, 4); g.fillRect(x, y + 4, 5, 2); g.fillRect(x + 1, y + 6, 3, 1); g.fillRect(x, y - 1, 2, 1); g.fillRect(x + 3, y - 1, 2, 1);
    g.fillStyle = '#ec6a8a'; g.fillRect(x, y, 2, 4); g.fillRect(x + 3, y, 2, 4); g.fillRect(x + 1, y + 1, 3, 4); g.fillRect(x + 2, y + 5, 1, 1);
    g.fillStyle = '#ffc0d0'; g.fillRect(x, y, 1, 1); g.globalAlpha = 1;
  });
}
function catAt(lx, ly){
  let best = null, bd = 18;
  Pets.cats.forEach(c => { const d = Math.hypot(c.x - lx, c.y - 8 - (c.lift || 0) - ly); if (d < bd){ bd = d; best = c; } });
  return best;
}
const sfxMeow = () => { tone(620, 0, .12, 'triangle', .1, 900); tone(900, .1, .22, 'triangle', .09, 520); };
function petCat(cat, fromNet){
  cat.happy = performance.now() + 2200;
  for (let i = 0; i < 3; i++) Pets.hearts.push({ cat: cat.id, at: performance.now() + i * 180, dx: (i - 1) * 6 });
  sfxMeow();
  if (!fromNet && S.chan) S.chan.send({ type: 'broadcast', event: 'pet', payload: { k: ME.id, cat: cat.id } }).catch(() => {});
}
function onPet(m){ const c = m && Pets.cats.find(x => x.id === m.cat); if (c) petCat(c, true); }
function stepCats(dt){ if (!Pets.cats.length) initCats(); Pets.cats.forEach(c => stepCat(c, dt)); }
