/* ---------- house cats ----------
   Everyone sees the same cats without any network traffic: each cat follows a schedule derived from
   the shared server clock (`serverNow`). Time is cut into slots; in slot k a cat walks to spot S(k)
   (or, sometimes, wanders over to a person) and naps/sits there until the next slot.
   Petting is the only thing sent over the network (`pet` broadcast) so the hearts show for everyone. */
const CAT_SPOTS = [
  // x,y = where the cat rests; floor = where it stands before hopping up (omit for floor spots); z = draw order
  { id: 'bed', x: 32, y: 257, z: 273, pose: 'sleep' },
  { id: 'sofaArm', x: 336, y: 84, z: 129, pose: 'loaf', floor: [348, 136] },
  { id: 'sofaSeat', x: 214, y: 104, z: 129, pose: 'sleep', floor: [208, 138] },
  { id: 'sofaBack', x: 300, y: 64, z: 129, pose: 'sleep', floor: [300, 136] },
  { id: 'table', x: 322, y: 206, z: 233, pose: 'loaf', floor: [346, 236] },
  { id: 'cabR', x: 494, y: 166, z: 233, pose: 'sleep', floor: [472, 190] },
  { id: 'tvTop', x: 40, y: 104, z: 191, pose: 'sit', floor: [84, 166] },
  { id: 'bean', x: 96, y: 200, z: 229, pose: 'sleep', floor: [120, 236] },
  { id: 'musicTop', x: 152, y: 74, z: 121, pose: 'loaf', floor: [160, 136] },
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
    cat.face = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
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
/* a cat napping where someone sits down moves onto their lap (drawn just in front of them) */
function lapSeat(cat){
  if (cat.mode !== 'rest' || cat.path.length || cat.hop) return null;
  const all = [...Room.others.values(), Room.me];
  for (const a of all) if (a && a.sit && Math.hypot(a.sit.x - cat.x, a.sit.y - cat.y) < 28) return a.sit;
  return null;
}
function catZ(cat){
  const lap = lapSeat(cat); if (lap) return (lap.z || lap.y) + 1;
  if (cat.mode === 'rest' && cat.spot && cat.spot.z && !cat.path.length && !cat.hop) return cat.spot.z;
  if (cat.hop && cat.spot && cat.spot.z) return Math.max(cat.y, cat.spot.z);
  return cat.y;
}

/* PixelLab cat sprites (tools/cats-build.py): rows orange/white/black; cols idle 8 dirs | walk S,E,N,W x4 | sleep 8 dirs */
const CAT_ATLAS = new Image(), CAT_FEET = /*CAT_FEET*/null, CAT_CELL = 32, COAT_ROW = { orange: 0, white: 1, black: 2 };
let catReady = false; CAT_ATLAS.onload = () => { catReady = true; }; CAT_ATLAS.src = 'assets/chars/cats.png';
const CAT_D8 = { 0: 0, 1: 4, 2: 6, 3: 2 }, CAT_W4 = { 0: 0, 3: 1, 1: 2, 2: 3 };
function drawCat(g, cat, t){
  const pose = catPose(cat, t), happy = cat.happy > performance.now(), lap = lapSeat(cat);
  const x = Math.round(lap ? lap.x + 1 : cat.x), y = Math.round(lap ? lap.y + 7 : cat.y - (cat.lift || 0));
  // contact shadow right under the paws (shrinks while jumping, none on a lap)
  if (!lap){ const k = cat.lift ? Math.max(.35, 1 - cat.lift / 30) : 1, gy = cat.lift ? Math.round(cat.y) : y; g.fillStyle = `rgba(30,15,10,${.34 * k})`; g.beginPath(); g.ellipse(x, gy + 1, 10 * k, 3 * k, 0, 0, Math.PI * 2); g.fill(); }
  if (!catReady) return;
  // resting cats face the room at three-quarters: SW when they last walked left, SE otherwise
  const rest = cat.dir === 2 ? 7 : 1;
  let col;
  if (pose === 'walk') col = 8 + CAT_W4[cat.face == null ? cat.dir : cat.face] * 4 + Math.floor(cat.walk * 8) % 4;
  else if (pose === 'jump') col = cat.dir === 2 ? 6 : 2;
  else if (pose === 'sleep' && !happy) col = 24 + (lap ? 0 : rest);
  else col = happy ? 0 : rest;
  const row = COAT_ROW[cat.coat] || 0, feet = CAT_FEET ? (col >= 8 && col < 24 ? CAT_FEET[row][CAT_D8[[0, 3, 1, 2][Math.floor((col - 8) / 4)]]] : CAT_FEET[row][col]) : 28;
  // gentle breathing while asleep
  const breathe = pose === 'sleep' && !happy && Math.floor(t / 1400 + hashStr(cat.id) % 5) % 2 ? 1 : 0;
  g.drawImage(CAT_ATLAS, col * CAT_CELL, row * CAT_CELL, CAT_CELL, CAT_CELL - breathe, x - CAT_CELL / 2, y - feet - 1 + breathe, CAT_CELL, CAT_CELL - breathe);
  if (pose === 'sleep' && !happy){
    const p = (t / 2400 + hashStr(cat.id) % 7 / 7) % 1; g.globalAlpha = p < .8 ? 1 - p / .8 : 0; g.fillStyle = '#fff8ea';
    const zx = x + 10 - p * 4, zy = y - 26 - p * 12; g.fillRect(zx, zy, 4, 1); g.fillRect(zx + 2, zy + 1, 1, 1); g.fillRect(zx + 1, zy + 2, 1, 1); g.fillRect(zx, zy + 3, 4, 1); g.globalAlpha = 1;
  }
}
/* hearts float up in room space */
function drawPetHearts(g, t){
  const now = performance.now();
  Pets.hearts = Pets.hearts.filter(h => now - h.at < 1600);
  Pets.hearts.forEach(h => {
    const cat = Pets.cats.find(c => c.id === h.cat); if (!cat) return;
    const p = (now - h.at) / 1600, x = Math.round(cat.x + h.dx + Math.sin(p * 8 + h.dx) * 3), y = Math.round(cat.y - 30 - (cat.lift || 0) - p * 26);
    g.globalAlpha = 1 - p; g.fillStyle = '#2b1a14'; g.fillRect(x - 1, y, 7, 4); g.fillRect(x, y + 4, 5, 2); g.fillRect(x + 1, y + 6, 3, 1); g.fillRect(x, y - 1, 2, 1); g.fillRect(x + 3, y - 1, 2, 1);
    g.fillStyle = '#ec6a8a'; g.fillRect(x, y, 2, 4); g.fillRect(x + 3, y, 2, 4); g.fillRect(x + 1, y + 1, 3, 4); g.fillRect(x + 2, y + 5, 1, 1);
    g.fillStyle = '#ffc0d0'; g.fillRect(x, y, 1, 1); g.globalAlpha = 1;
  });
}
function catAt(lx, ly){
  let best = null, bd = 20;
  Pets.cats.forEach(c => { const d = Math.hypot(c.x - lx, c.y - 12 - (c.lift || 0) - ly); if (d < bd){ bd = d; best = c; } });
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
