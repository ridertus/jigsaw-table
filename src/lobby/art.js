/* ----- static art: cozy 3/4 pixel room with outlined furniture ----- */
const PAD = 6;
bg.width = LW + PAD * 2; bg.height = LH + PAD * 2;
const P = {
  out: '#2a1c16', frame: '#1f4b52', frameL: '#2d6872', frameD: '#14363b',
  wall: '#f3e7c6', wallD: '#e4d3a6', wallL: '#fbf3dc', trim: '#9a6a42', trimD: '#6b4428',
  floor: '#6e4631', floorL: '#80553b', floorD: '#56362a', floorH: '#8c5f42',
  wood: '#a8703f', woodT: '#c48a52', woodF: '#8a5a32', woodD: '#6b4428',
  cur: '#2fae8f', curD: '#22866e', curL: '#5bcaa9', gold: '#e8c35a',
  glass: '#bfe6f0', glassD: '#93cde0',
  rug: '#57b3ab', rugL: '#86d3cb', rugD: '#3c8f88',
  red: '#d9574a', redD: '#a9433a', redL: '#ef8072',
  mus: '#e0a63a', musD: '#b47f25', musL: '#f2c562',
  blue: '#6ec3ef', blueD: '#4aa3d4', blueL: '#a8def7',
  metal: '#8a939e', metalD: '#5f6873', metalL: '#b3bcc6',
  leaf: '#4fae55', leafD: '#357f3c', leafL: '#7fd06a', white: '#fffaf1'
};
/* filled box with a 1px dark outline */
function obox(g, x, y, w, h, fill){ g.fillStyle = P.out; g.fillRect(x, y, w, h); g.fillStyle = fill; g.fillRect(x + 1, y + 1, w - 2, h - 2); }
/* 3/4 furniture block: lighter top face over a darker front face */
function block(g, x, y, w, topH, frontH, top, front, edge){
  obox(g, x, y, w, topH + frontH, front);
  g.fillStyle = top; g.fillRect(x + 1, y + 1, w - 2, topH - 1);
  g.fillStyle = edge || P.out; g.fillRect(x + 1, y + topH, w - 2, 1);
}
function paintRoom(){
  const g = bg.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, bg.width, bg.height); g.save(); g.translate(PAD, PAD);
  g.beginPath(); g.rect(0, 0, LW, LH); g.clip();
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // floor planks, staggered
  R(0, 30, LW, LH - 30, P.floor);
  for (let r = 0; r * 8 + 30 < LH; r++){
    const y = 30 + r * 8; R(0, y, LW, 1, P.floorD); R(0, y + 1, LW, 1, P.floorL);
    for (let x = (r % 2) * 20 - 20; x < LW; x += 40){ R(x, y + 1, 1, 7, P.floorD); R(x + 1, y + 2, 1, 5, P.floorH); }
    for (let x = (r * 13) % 37; x < LW; x += 37) R(x, y + 4, 4, 1, P.floorD);
  }
  // wall
  R(0, 0, LW, 30, P.wall); R(0, 0, LW, 2, P.wallL);
  for (let x = 6; x < LW; x += 12) R(x, 4, 1, 22, P.wallD);
  R(0, 26, LW, 3, P.trim); R(0, 29, LW, 1, P.trimD); R(0, 30, LW, 3, 'rgba(0,0,0,.18)');
  // windows with curtains
  const win = x => {
    obox(g, x, 5, 26, 19, P.trim); R(x + 2, 7, 22, 15, P.glass); R(x + 2, 7, 22, 4, P.white); R(x + 2, 17, 22, 5, P.glassD);
    R(x + 12, 7, 2, 15, P.trim); R(x + 2, 14, 22, 1, P.trim); R(x + 4, 9, 4, 1, P.white);
    R(x - 1, 23, 28, 2, P.trimD);
    [x - 5, x + 23].forEach((cx, i) => { obox(g, cx, 3, 8, 22, P.cur); R(cx + 1, 4, 2, 20, P.curL); R(cx + 5, 4, 2, 20, P.curD); R(cx + (i ? 1 : 2), 14, 5, 2, P.gold); });
    obox(g, x - 6, 2, 38, 3, P.trimD);
  };
  win(54); win(100);
  // bookshelf
  block(g, 12, 6, 24, 4, 38, P.woodT, P.woodF);
  [16, 28, 40].forEach((y, row) => {
    R(14, y - 4, 20, 10, P.woodD); R(14, y + 6, 20, 2, P.wood);
    const books = [P.red, P.blue, P.mus, P.cur, '#8a6fd0', P.white, P.redD];
    let x = 15; for (let i = 0; i < 6; i++){ const w = 2 + (i + row) % 2, h = 8 - ((i * 3 + row) % 3); R(x, y + 6 - h, w, h, books[(i + row * 2) % books.length]); R(x, y + 6 - h, w, 1, 'rgba(255,255,255,.35)'); x += w + 1; }
  });
  // grandfather clock
  obox(g, 142, 4, 15, 40, P.wood); R(143, 5, 13, 2, P.woodT); R(144, 8, 11, 11, P.woodD);
  obox(g, 145, 9, 9, 9, P.white); R(149, 11, 1, 4, P.out); R(149, 14, 3, 1, P.out);
  R(145, 22, 9, 16, P.woodD); R(147, 24, 5, 12, '#c9a24a'); R(149, 30, 1, 5, P.gold); obox(g, 147, 34, 5, 4, P.gold);
  R(141, 42, 17, 3, P.woodD);
  // whiteboard on the wall (drawing preview is painted live by drawWallBoard)
  obox(g, 158, 6, 20, 15, P.trimD); R(159, 7, 18, 13, P.trim); R(160, 8, 16, 11, P.white); R(160, 8, 16, 1, '#ffffff');
  R(160, 21, 16, 2, P.metalD); R(161, 20, 3, 1, P.red); R(165, 20, 3, 1, P.blue); R(169, 20, 2, 1, P.leaf);
  // standing lamp (blue shade)
  R(233, 22, 1, 20, P.metalD); obox(g, 228, 41, 11, 4, P.metal);
  obox(g, 226, 8, 15, 14, P.blue); R(227, 9, 13, 3, P.blueL); R(234, 12, 5, 9, P.blueD); R(226, 21, 15, 1, P.out);
  // radio cabinet
  block(g, 178, 22, 38, 5, 22, P.woodT, P.woodF);
  R(181, 30, 15, 13, P.woodD); R(198, 30, 15, 13, P.woodD); R(182, 31, 13, 11, P.wood); R(199, 31, 13, 11, P.wood);
  R(193, 36, 2, 2, P.gold); R(200, 36, 2, 2, P.gold);
  // rug with diamonds
  obox(g, 76, 60, 88, 58, P.rugD); R(78, 62, 84, 54, P.rug);
  for (let y = 66; y < 114; y += 10) for (let x = 82 + ((y - 66) / 10 % 2) * 7; x < 158; x += 14){ R(x + 2, y, 2, 1, P.rugL); R(x + 1, y + 1, 4, 1, P.rugL); R(x, y + 2, 6, 1, P.rugL); R(x + 1, y + 3, 4, 1, P.rugL); R(x + 2, y + 4, 2, 1, P.rugL); }
  R(78, 62, 84, 1, P.rugL);
  // sofa (left, facing right)
  obox(g, 10, 80, 10, 44, P.redD); R(11, 81, 3, 42, P.red);
  block(g, 18, 80, 18, 6, 4, P.redL, P.redD); block(g, 18, 114, 18, 6, 4, P.redL, P.redD);
  obox(g, 18, 89, 18, 26, P.red); R(19, 90, 16, 2, P.redL); R(19, 101, 16, 1, P.redD); R(19, 113, 16, 1, P.redD);
  obox(g, 21, 92, 9, 8, P.white); R(22, 93, 7, 2, '#ffffff'); R(22, 98, 7, 1, P.wallD);
  // armchair (right, facing left)
  obox(g, 208, 92, 10, 30, P.musD); R(214, 93, 3, 28, P.mus);
  block(g, 190, 92, 20, 5, 4, P.musL, P.musD); block(g, 190, 113, 20, 5, 4, P.musL, P.musD);
  obox(g, 190, 100, 20, 14, P.mus); R(191, 101, 18, 2, P.musL);
  // plant (bottom-left)
  obox(g, 2, 134, 10, 9, '#c75d4b'); R(3, 135, 8, 2, '#e07a62');
  [[1, 124, 4, 10], [6, 120, 3, 14], [9, 125, 3, 9], [4, 128, 6, 7]].forEach(([x, y, w, h], i) => { obox(g, x, y, w, h, i % 2 ? P.leaf : P.leafD); R(x + 1, y + 1, 1, h - 3, P.leafL); });
  // doormat
  obox(g, 104, 138, 32, 6, '#b8864e'); R(106, 140, 28, 1, '#d4a46a');
  g.restore();
  // room shell: thick teal walls with wooden posts at the open front
  const W = bg.width, H = bg.height, F = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  F(0, 0, W, PAD, P.frame); F(0, 0, PAD, H, P.frame); F(W - PAD, 0, PAD, H, P.frame);
  F(PAD - 1, PAD - 1, W - PAD * 2 + 2, 1, P.frameD); F(PAD - 1, PAD, 1, H - PAD, P.frameD); F(W - PAD, PAD, 1, H - PAD, P.frameD);
  F(1, 1, W - 2, 1, P.frameL); F(1, 1, 1, H - 2, P.frameL); F(W - 2, 1, 1, H - 2, P.frameL);
  F(0, H - 10, PAD + 1, 10, P.trim); F(W - PAD - 1, H - 10, PAD + 1, 10, P.trim); F(0, H - 10, PAD + 1, 1, P.trimD); F(W - PAD - 1, H - 10, PAD + 1, 1, P.trimD);
}
function drawTable(g, t){
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  // stools
  [[84, 68], [148, 68], [84, 90], [148, 90]].forEach(([x, y]) => { block(g, x - 2, y, 12, 4, 6, P.woodT, P.woodF); R(x, y + 10, 2, 2, P.woodD); R(x + 6, y + 10, 2, 2, P.woodD); });
  // table top and front
  block(g, 93, 68, 54, 24, 6, P.woodT, P.woodF);
  obox(g, 95, 97, 4, 6, P.woodD); obox(g, 141, 97, 4, 6, P.woodD);
  obox(g, 97, 70, 46, 20, '#ecd3a8');
  if (Room.tableImg){
    const img = Room.tableImg, k = Math.min(42 / img.width, 16 / img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
    g.imageSmoothingEnabled = true; g.drawImage(img, 120 - w / 2, 80 - h / 2, w, h); g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(120 - w / 2, 80 - h / 2, w, 1);
  } else {
    for (let y = 0; y < 18; y += 3) for (let x = (y / 3) % 2 * 3; x < 44; x += 6) R(98 + x, 71 + y, 3, 3, '#e0c08d');
  }
  if (Math.floor(t / 400) % 2 && [...Room.others.values(), Room.me].some(a => a && Math.abs(a.x - 120) < 40 && Math.abs(a.y - 84) < 26)){ R(146, 66, 2, 2, '#fff'); R(145, 67, 4, 0.5, '#fff'); }
}
function drawRadio(g, t){
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const on = Radio.isPlaying();
  obox(g, 183, 9, 28, 15, P.red); R(184, 10, 26, 2, P.redL); R(184, 22, 26, 1, P.redD);
  obox(g, 186, 13, 11, 9, '#3a2a2a'); for (let y = 15; y < 21; y += 2) R(187, y, 9, 1, '#5a4040');
  obox(g, 199, 13, 9, 4, on ? '#ffd36e' : '#7a5a50'); if (on) R(200 + Math.floor(t / 300) % 7, 14, 1, 2, P.redD);
  obox(g, 199, 18, 4, 4, P.white); obox(g, 204, 18, 4, 4, P.white);
  R(207, 2, 1, 8, P.metalD); R(206, 1, 3, 1, P.metalD);
  if (on){
    const k = (t / 1000) % 2;
    [[0, '#7c6cf0'], [1, P.red]].forEach(([o, c]) => {
      const p = (k + o) % 2, nx = 190 + o * 10 + Math.sin(p * 3) * 3, ny = 6 - p * 8;
      g.globalAlpha = 1 - p / 2; R(nx, ny, 2, 2, c); R(nx + 2, ny - 4, 1, 5, c); R(nx + 2, ny - 4, 2, 1, c); g.globalAlpha = 1;
    });
  }
}
/* outlined character sprites, cached per look */
const spriteCache = new Map();
function charSprite(color, hair, dir, frame){
  const key = color + hair + dir + frame;
  let c = spriteCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = 12; c.height = 18;
  const g = c.getContext('2d'); drawChar(g, 6, 17, color, hair, dir, frame, true);
  const d = g.getImageData(0, 0, 12, 18), px = d.data, out = new Uint8ClampedArray(px);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 12; x++){
    const i = (y * 12 + x) * 4; if (px[i + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < 12 && ny < 18 && px[(ny * 12 + nx) * 4 + 3] > 200; });
    if (near){ out[i] = 42; out[i + 1] = 28; out[i + 2] = 22; out[i + 3] = 255; }
  }
  d.data.set(out); g.putImageData(d, 0, 0);
  spriteCache.set(key, c); return c;
}
function drawAvatar(g, a){
  const x = Math.round(a.x), y = Math.round(a.y);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 4, y - 1, 8, 2); g.fillRect(x - 3, y + 1, 6, 1);
  g.drawImage(charSprite(a.color, a.hair, a.dir, a.path.length ? Math.floor(a.walk * 8) % 4 : 0), x - 6, y - 17);
}
