/* ----- static art: cozy 3/4 pixel living room (night-friendly warm palette, 1px dark outlines) ----- */
const P = {
  out: '#2b1a14', ink: '#3b2418',
  frame: '#3b2519', frameL: '#5a3a26', frameD: '#24150e',
  wall: '#e2c18e', wallL: '#ecd0a2', wallD: '#d1ad78', wallS: '#c39a64',
  pane: '#9a6338', paneL: '#b4794a', paneD: '#7a4a28',
  beam: '#5c3a24', beamL: '#7a5034', beamD: '#3f2617',
  floor: '#b8773f', floorL: '#c98a4f', floorD: '#9c6232', floorS: '#7d4a24', floorH: '#d59a5c',
  wood: '#8b5a34', woodT: '#a8703f', woodL: '#c48a52', woodD: '#6b4226', woodS: '#4f2f1a',
  sofa: '#6f8a4e', sofaL: '#8aa65f', sofaH: '#a2bd74', sofaD: '#526b39', sofaS: '#3d5229',
  cur: '#5b7fc4', curL: '#86a6e0', curD: '#3e5c9a', curS: '#2f467a',
  cream: '#f3e2bd', creamD: '#dcc493', creamS: '#c2a676',
  orange: '#e8954a', orangeL: '#f4b46e', orangeD: '#c06f2e',
  rug: '#c98a6a', rugL: '#e3b08a', rugD: '#9c5e46', rugS: '#7a4434', rugC: '#f0d2a6',
  blue: '#6c7fa8', blueL: '#8fa1c8', blueD: '#4e5f86', blueS: '#3a4768',
  bean: '#5d6b9a', beanL: '#7a89b8', beanH: '#97a6d0', beanD: '#465282', beanS: '#343e66',
  leaf: '#5a9a48', leafL: '#82c25e', leafH: '#a6dc7a', leafD: '#3c7234', leafS: '#2a5426',
  pot: '#c0663f', potL: '#dc8458', potD: '#94482a',
  metal: '#8a8f9e', metalL: '#b9bdc8', metalD: '#5c6070', dark: '#2e2a36', darkL: '#45404f', darkD: '#1d1a24',
  red: '#d4574a', redL: '#ec8070', redD: '#a3413a', mus: '#e6b04a', musL: '#f4cd72', musD: '#b88328',
  lamp: '#ffd98a', lampL: '#fff1c8', white: '#fff8ea', purple: '#8a6fd0', teal: '#3fa59a', pink: '#e88aa8'
};
/* tiny seeded random so the art is the same on every device */
function rng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* drawing kit, bound to one context */
function kit(g){
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const O = (x, y, w, h, fill) => { R(x, y, w, h, P.out); R(x + 1, y + 1, w - 2, h - 2, fill); };
  /* rounded rectangle, r = corner cut in px, outlined */
  const RR = (x, y, w, h, r, fill, out) => {
    const row = (yy, inset, c) => R(x + inset, yy, w - inset * 2, 1, c);
    for (let i = 0; i < h; i++){ const d = Math.min(i, h - 1 - i), ins = d < r ? Math.round(r - Math.sqrt(r * r - (r - d - .5) ** 2)) : 0; row(y + i, ins, out === false ? fill : P.out); }
    if (out !== false) for (let i = 1; i < h - 1; i++){ const d = Math.min(i - 1, h - 2 - i), rr = Math.max(0, r - 1), ins = d < rr ? Math.round(rr - Math.sqrt(rr * rr - (rr - d - .5) ** 2)) : 0; R(x + 1 + ins, y + i, w - 2 - ins * 2, 1, fill); }
  };
  /* pixel ellipse (filled), optionally outlined */
  const E = (cx, cy, rx, ry, fill, out) => {
    const row = (rx2, ry2, c) => { for (let yy = -ry2; yy <= ry2; yy++){ const hw = Math.round(rx2 * Math.sqrt(Math.max(0, 1 - (yy / (ry2 + .5)) ** 2))); R(cx - hw, cy + yy, hw * 2, 1, c); } };
    if (out !== false){ row(rx, ry, P.out); row(rx - 1, ry - 1, fill); } else row(rx, ry, fill);
  };
  /* 3/4 block: top face over a darker front face */
  const B = (x, y, w, topH, frontH, top, front, lip) => {
    O(x, y, w, topH + frontH, front);
    R(x + 1, y + 1, w - 2, topH - 1, top);
    R(x + 1, y + topH, w - 2, 1, lip || P.out);
  };
  const dith = (x, y, w, h, c, k) => { g.fillStyle = c; for (let yy = 0; yy < h; yy++) for (let xx = (yy % 2); xx < w; xx += (k || 2)) g.fillRect(x + xx, y + yy, 1, 1); };
  return { R, O, RR, E, B, dith };
}
/* ---- the picture room ---- */
const ROOM_SRC = { day: 'assets/room/room-day.webp', night: 'assets/room/room-night.webp', mask: 'assets/room/room-front-mask.png' };
/* pieces of the picture people can walk behind: r = rect in image px, base = draw-order line (feet y) */
const PROPS = [
  { id: 'tv', r: [88, 228, 257, 270], base: 452 }, { id: 'bean', r: [330, 414, 182, 148], base: 548 },
  { id: 'rtable', r: [255, 548, 181, 94], base: 628 }, { id: 'fplant', r: [222, 512, 58, 80], base: 586 },
  { id: 'ctable', r: [766, 474, 420, 168], base: 600, live: (g, t) => drawTable(g, t) },
  { id: 'umb', r: [1466, 330, 206, 292], base: 600 }, { id: 'lplant', r: [90, 538, 126, 166], base: 696 },
  { id: 'front', r: [0, 640, 1672, 301], base: 100000 }
];
const RoomImg = { day: null, night: null, frontDay: null, frontNight: null, ready: false };
function paintRoom(){
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  Promise.all([load(ROOM_SRC.day), load(ROOM_SRC.night), load(ROOM_SRC.mask)]).then(([day, night, mask]) => {
    if (!day || !night){ toast('โหลดภาพห้องไม่สำเร็จ'); return; }
    const cut = img => {
      const c = document.createElement('canvas'); c.width = RW; c.height = RH; const g = c.getContext('2d');
      g.drawImage(img, 0, 0); if (mask){ g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); } return c;
    };
    Object.assign(RoomImg, { day, night, frontDay: cut(day), frontNight: cut(night), ready: true });
    Room.props = PROPS;
  });
}
function drawRoomBase(g, nk){
  if (!RoomImg.ready) return;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (nk < .999) g.drawImage(RoomImg.day, 0, 0);
  if (nk > .001){ g.globalAlpha = nk; g.drawImage(RoomImg.night, 0, 0); g.globalAlpha = 1; }
}
function drawProp(g, p, nk, t){
  const [x, y, w, h] = p.r;
  g.imageSmoothingEnabled = true;
  if (nk < .999) g.drawImage(RoomImg.frontDay, x, y, w, h, x, y, w, h);
  if (nk > .001){ g.globalAlpha = nk; g.drawImage(RoomImg.frontNight, x, y, w, h, x, y, w, h); g.globalAlpha = 1; }
  if (p.live) p.live(g, t);
}
/* a parallelogram on the picture as a local drawing surface: o = top-left, u = top-right, v = bottom-left */
function onQuad(g, o, u, v, lw, lh, fn){
  g.save(); g.transform((u[0] - o[0]) / lw, (u[1] - o[1]) / lw, (v[0] - o[0]) / lh, (v[1] - o[1]) / lh, o[0], o[1]); fn(); g.restore();
}
const EASEL = { o: [1388, 236], u: [1468, 255], v: [1373, 320] };
function drawEasel(g){ if (Board.items && Board.items.size) onQuad(g, EASEL.o, EASEL.u, EASEL.v, 64, 44, () => drawWallBoard(g)); }

/* ---- the game table top (drawn in a 330x108 local space laid over the table) ---- */
const TABLE_Q = { o: [778, 486], u: [1104, 481], v: [824, 590] };
function drawTable(g, t){
  onQuad(g, TABLE_Q.o, TABLE_Q.u, TABLE_Q.v, 330, 108, () => {
    g.imageSmoothingEnabled = false;
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const O = (x, y, w, h, c) => { R(x - 2, y - 2, w + 4, h + 4, '#3a2418'); R(x, y, w, h, c); };
    if (Table.mode === 'guess'){
      R(64, 16, 200, 78, 'rgba(40,20,10,.3)'); O(60, 12, 200, 78, '#fffdf6');
      for (let y = 24; y < 86; y += 10) R(64, y, 192, 2, '#e4ecf6');
      const k = Math.floor(t / 900) % 3, ink = '#3b2418';
      R(96, 46, 34, 3, ink); R(92, 49, 4, 18, ink); R(130, 49, 4, 18, ink); R(96, 66, 34, 3, ink); R(100, 32, 26, 3, ink); R(96, 35, 4, 12, ink); R(126, 35, 4, 12, ink);
      if (k > 0){ R(150, 40, 26, 26, '#f4cd72'); R(156, 50, 4, 4, ink); R(166, 50, 4, 4, ink); R(158, 58, 10, 3, ink); }
      if (k > 1) for (let i = 0; i < 6; i++) R(190 + i * 9, 70 - (i % 2) * 6, 8, 3, '#5a9a48');
      O(276, 26, 30, 40, '#e6b04a'); R(282, 34, 18, 3, '#b88328'); R(282, 42, 12, 3, '#b88328');
      O(18, 52, 30, 36, '#f4c0c8'); R(24, 60, 18, 3, '#a3413a');
      ['#d4574a', '#5b7fc4', '#5a9a48', '#e6b04a'].forEach((c, i) => { R(220 + i * 12, 60 - i * 2, 6, 26, '#2b1a14'); R(221 + i * 12, 61 - i * 2, 4, 22, c); R(221 + i * 12, 83 - i * 2, 4, 3, '#f3e2bd'); });
    } else {
      O(70, 12, 190, 84, '#e9d3a5');
      if (Room.tableImg){
        const img = Room.tableImg, k = Math.min(184 / img.width, 78 / img.height), w = img.width * k, h = img.height * k;
        g.imageSmoothingEnabled = true; g.drawImage(img, 165 - w / 2, 54 - h / 2, w, h); g.imageSmoothingEnabled = false;
      } else for (let y = 0; y < 78; y += 10) for (let x = (y / 10) % 2 * 10; x < 184; x += 20) R(73 + x, 15 + y, 10, 10, '#dcc293');
      const rnd = rng(5);
      for (let i = 0; i < 14; i++){ const x = 10 + rnd() * 310, y = 6 + rnd() * 96; if (x > 60 && x < 268) continue; R(x - 1, y - 1, 12, 12, '#2b1a14'); R(x, y, 10, 10, ['#8aa65f', '#86a6e0', '#f4b46e', '#f4cd72', '#e3b08a'][i % 5]); }
      O(276, 20, 40, 30, '#3e5c9a'); R(278, 22, 36, 8, '#82c25e'); R(278, 30, 36, 18, '#86a6e0'); R(284, 34, 12, 8, '#f4b46e');
    }
    const near = [...Room.others.values(), Room.me].some(a => a && Math.abs(a.x - 975) < 260 && Math.abs(a.y - 560) < 140);
    if (near && Math.floor(t / 400) % 2){ R(258, 8, 6, 6, '#fff'); R(256, 10, 10, 2, '#fff'); R(260, 6, 2, 10, '#fff'); }
    const fx = (performance.now() - Table.fx) / 700;
    if (fx < 1) for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2, r = 30 + fx * 90; g.globalAlpha = 1 - fx; R(165 + Math.cos(a) * r * 1.4, 54 + Math.sin(a) * r * .6, 12 - fx * 8, 12 - fx * 8, '#fff3dc'); g.globalAlpha = 1; }
  });
}

/* ---- avatars: outlined chibi sprites, cached per look/pose ---- */
const spriteCache = new Map();
/* 1px dark outline around every opaque pixel of a sprite canvas */
function outlineSprite(c){
  const W = c.width, H = c.height, g = c.getContext('2d'), d = g.getImageData(0, 0, W, H), px = d.data, out = new Uint8ClampedArray(px);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = (y * W + x) * 4; if (px[i + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && px[(ny * W + nx) * 4 + 3] > 200; });
    if (near){ out[i] = 43; out[i + 1] = 26; out[i + 2] = 20; out[i + 3] = 255; }
  }
  d.data.set(out); g.putImageData(d, 0, 0);
}
const SPR_W = 26, SPR_H = 42;
function charSprite(look, dir, frame, pose){
  const key = [look.color, look.hair, look.hc, look.acc, dir, frame, pose].join('|');
  let c = spriteCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = SPR_W; c.height = SPR_H;
  const g = c.getContext('2d'); drawChar(g, SPR_W / 2, SPR_H - 2, look, dir, frame, pose);
  outlineSprite(c);
  if (spriteCache.size > 400) spriteCache.clear();
  spriteCache.set(key, c); return c;
}
function drawAvatar(g, a, t){
  const x = a.x, y = a.y, pose = a.sit ? 'sit' : 'stand';
  g.imageSmoothingEnabled = false;
  if (!a.sit || a.sit.kind === 'floor'){ g.fillStyle = 'rgba(30,15,10,.3)'; g.beginPath(); g.ellipse(x, y, 7 * SC, 2 * SC, 0, 0, Math.PI * 2); g.fill(); }
  const frame = a.path.length ? Math.floor(a.walk * 9) % 4 : (pose === 'stand' && Math.floor((t + hashStr(a.k + '') % 1000) / 700) % 6 === 0 ? 4 : 0);
  g.drawImage(charSprite(a, a.dir, frame, pose), Math.round(x - SPR_W * SC / 2), Math.round(y - (SPR_H - 2) * SC), SPR_W * SC, SPR_H * SC);
}
