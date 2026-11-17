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
/* 3x5 pixel font for signs */
const GLYPH = { G: '111100101101111', O: '111101101101111', D: '110101101101110', V: '101101101101010', I: '111010010010111', B: '110101110101110', E: '111100110100111', S: '111100111001111', ' ': '000000000000000' };
function pixText(R, text, x, y, c, sc){ sc = sc || 1; [...text].forEach((ch, i) => { const gl = GLYPH[ch] || GLYPH[' ']; for (let k = 0; k < 15; k++) if (gl[k] === '1') R(x + (i * 4 + k % 3) * sc, y + Math.floor(k / 3) * sc, sc, sc, c); }); }

/* ---- reusable pieces ---- */
function plantArt(g, cx, by, size, seed, potW){
  const { R, O, E, RR } = kit(g), rnd = rng(seed), pw = potW || Math.round(size * .8);
  // leaves first, pot on top of their stems
  const leaves = Math.round(size * .9);
  for (let i = 0; i < leaves; i++){
    const ang = -Math.PI / 2 + (rnd() - .5) * 2.4, len = size * (.55 + rnd() * .6);
    const lx = cx + Math.cos(ang) * len * .9, ly = by - pw * .9 + Math.sin(ang) * len;
    const w = 3 + Math.round(rnd() * 3), h = 2 + Math.round(rnd() * 2);
    E(Math.round(lx), Math.round(ly), w, h, i % 3 === 0 ? P.leafD : i % 3 === 1 ? P.leaf : P.leafL);
  }
  for (let i = 0; i < leaves; i++){ const lx = cx + (rnd() - .5) * size * 1.1, ly = by - pw - rnd() * size * .9; R(Math.round(lx), Math.round(ly), 2, 1, P.leafH); }
  const ph = Math.round(pw * .9);
  RR(cx - pw / 2, by - ph, pw, ph, 2, P.pot); R(cx - pw / 2 + 1, by - ph + 1, pw - 2, 2, P.potL); R(cx - pw / 2 - 1, by - ph, pw + 2, 3, P.out); R(cx - pw / 2, by - ph + 1, pw, 1, P.potL);
  R(cx + pw / 2 - 4, by - ph + 3, 2, ph - 5, P.potD);
}
function booksArt(g, x, y, w, h, seed){
  const { R } = kit(g), rnd = rng(seed), cols = [P.red, P.blue, P.mus, P.teal, P.purple, P.cream, P.redD, P.sofa, P.orange, P.blueD, P.pink];
  let xx = x;
  while (xx < x + w - 1){
    if (rnd() < .12 && xx < x + w - 8){ // a leaning book or gap
      const bw = 3; R(xx, y + h - 3, 6, 3, cols[Math.floor(rnd() * cols.length)]); R(xx, y + h - 3, 6, 1, 'rgba(255,255,255,.3)'); xx += 7; continue;
    }
    const bw = 2 + Math.floor(rnd() * 3), bh = h - Math.floor(rnd() * 4); if (xx + bw > x + w) break;
    const c = cols[Math.floor(rnd() * cols.length)];
    R(xx, y + h - bh, bw, bh, c); R(xx, y + h - bh, 1, bh, 'rgba(255,255,255,.22)'); R(xx + bw - 1, y + h - bh, 1, bh, 'rgba(0,0,0,.25)');
    if (bh > 6) R(xx, y + h - bh + 2, bw, 1, 'rgba(255,240,200,.45)');
    xx += bw + (rnd() < .2 ? 1 : 0);
  }
}
function mugArt(g, x, y, c){ const { R, O } = kit(g); O(x, y, 6, 6, c); R(x + 1, y + 1, 4, 1, P.white); R(x + 1, y + 1, 4, 1, '#6b3f22'); R(x + 6, y + 2, 2, 3, P.out); R(x + 6, y + 3, 1, 1, c); }

/* ---- the background (wall, floor, flat decor) ---- */
function paintRoom(){
  const g = bg.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, bg.width, bg.height); g.save(); g.translate(PAD, PAD);
  const { R, O, RR, E, B, dith } = kit(g);
  // floor planks
  R(0, 96, LW, LH - 96, P.floor);
  const fr = rng(7);
  for (let row = 0; row * 12 + 96 < LH; row++){
    const y = 96 + row * 12;
    let x = -Math.floor(fr() * 60);
    while (x < LW){
      const len = 46 + Math.floor(fr() * 60), tone = fr();
      R(x, y, len, 12, tone < .3 ? P.floorD : tone > .8 ? P.floorL : P.floor);
      R(x, y, len, 1, P.floorH); R(x, y + 11, len, 1, P.floorS); R(x, y, 1, 12, P.floorS);
      for (let k = 0; k < 2; k++){ const gx = x + 4 + Math.floor(fr() * (len - 12)), gy = y + 3 + Math.floor(fr() * 6); R(gx, gy, 3 + Math.floor(fr() * 6), 1, 'rgba(90,50,20,.35)'); }
      if (fr() < .25){ const kx = x + 6 + Math.floor(fr() * (len - 12)); R(kx, y + 5, 2, 2, 'rgba(90,50,20,.45)'); }
      x += len;
    }
  }
  // shadow along the wall
  for (let i = 0; i < 8; i++) R(0, 96 + i, LW, 1, `rgba(40,20,10,${.32 - i * .04})`);

  // wall
  R(0, 0, LW, 96, P.wall);
  for (let x = 0; x < LW; x += 16){ R(x, 8, 1, 50, P.wallD); R(x + 8, 8, 1, 50, P.wallL); }
  dith(0, 8, LW, 50, 'rgba(255,240,210,.18)', 6);
  R(0, 0, LW, 8, P.beam); R(0, 0, LW, 1, P.beamL); R(0, 7, LW, 1, P.beamD); R(0, 8, LW, 2, 'rgba(60,30,10,.25)');
  for (let x = 20; x < LW; x += 72){ R(x, 2, 2, 2, P.beamD); }
  // wainscot panels
  R(0, 57, LW, 4, P.paneL); R(0, 57, LW, 1, P.out); R(0, 60, LW, 1, P.paneD);
  R(0, 61, LW, 31, P.pane);
  for (let x = 2; x < LW; x += 30){ O(x, 64, 26, 24, P.paneD); R(x + 1, 65, 24, 1, P.paneL); R(x + 2, 66, 22, 20, P.pane); R(x + 2, 66, 22, 1, P.paneD); R(x + 2, 85, 22, 1, P.paneL); }
  R(0, 90, LW, 6, P.beam); R(0, 90, LW, 1, P.out); R(0, 91, LW, 1, P.beamL); R(0, 95, LW, 1, P.beamD);

  // window hole (sky is painted live) + sill shadow
  R(196, 10, 142, 74, P.out);
  // clock (hands are live)
  E(80, 23, 11, 11, P.woodD); E(80, 23, 9, 9, P.cream, false); E(80, 23, 8, 8, P.white, false);
  for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; R(80 + Math.round(Math.sin(a) * 7) - (i % 3 ? 0 : 0), 23 - Math.round(Math.cos(a) * 7), 1, 1, i % 3 ? P.creamS : P.ink); }
  R(79, 11, 2, 1, P.woodL);
  // GOOD VIBES sign
  O(140, 10, 40, 26, P.woodS); R(141, 11, 38, 1, P.woodD); R(142, 12, 36, 22, '#3a2a22');
  pixText(R, 'GOOD', 153, 15, P.musL, 1); pixText(R, 'VIBES', 151, 23, P.musL, 1);
  R(146, 14, 1, 1, P.pink); R(173, 30, 1, 1, P.teal); R(171, 14, 2, 1, P.musD); R(144, 31, 3, 1, P.musD);
  R(159, 6, 2, 4, P.out); R(150, 8, 20, 1, 'rgba(40,20,10,.5)');
  // equalizer strip (bars are live)
  O(96, 38, 44, 12, P.darkD); R(97, 39, 42, 1, P.darkL);
  // hanging plant by the shelf
  R(55, 8, 1, 12, P.ink); R(52, 18, 7, 1, P.ink);
  plantArt(g, 55, 32, 9, 21, 9);
  for (let i = 0; i < 3; i++){ const vx = 50 + i * 4; for (let y = 32; y < 46 + i * 4; y += 3) R(vx + (y % 6 ? 0 : 1), y, 2, 2, (y / 3) % 2 ? P.leaf : P.leafD); }
  // cat picture above the side table
  O(352, 20, 26, 24, P.woodD); R(354, 22, 22, 20, '#f2d7a8'); R(354, 36, 22, 6, '#e7b77e');
  E(365, 32, 6, 5, P.orange); R(359, 26, 3, 3, P.out); R(368, 26, 3, 3, P.out); R(360, 27, 1, 1, P.orange); R(369, 27, 1, 1, P.orange);
  R(362, 31, 1, 1, P.out); R(367, 31, 1, 1, P.out); R(364, 33, 2, 1, P.pink);
  // pendant lamp cord (shade is drawn lit in drawRoomLight)
  R(404, 0, 1, 30, P.out);
  // corkboard with pinned things
  O(412, 8, 90, 50, P.woodD); R(413, 9, 88, 1, P.woodL); R(414, 10, 86, 46, '#c89a62'); dith(414, 10, 86, 46, '#b5854e', 3);
  const pins = [[418, 13, 14, 12, '#f6e7b4'], [436, 12, 12, 14, '#bfe0f0'], [452, 14, 16, 11, '#f4c0c8'], [472, 12, 12, 12, '#d8f0c0'], [488, 15, 10, 13, '#f6e7b4'], [420, 30, 16, 12, '#ffffff'], [440, 30, 14, 12, '#f6d38a'], [470, 30, 13, 14, '#bfe0f0'], [486, 32, 12, 11, '#f4c0c8']];
  pins.forEach(([x, y, w, h, c], i) => {
    R(x + 1, y + 1, w, h, 'rgba(40,20,10,.35)'); R(x, y, w, h, c);
    if (i % 3 === 0){ R(x + 2, y + 3, w - 4, 1, 'rgba(60,40,30,.4)'); R(x + 2, y + 6, w - 6, 1, 'rgba(60,40,30,.4)'); }
    else if (i % 3 === 1){ R(x + 1, y + h - 5, w - 2, 4, P.leafL); E(x + w / 2, y + 4, 2, 2, P.mus, false); }
    else { R(x + 2, y + 2, w - 4, h - 4, P.blueL); R(x + 2, y + h - 5, w - 4, 3, P.leaf); }
    R(x + w / 2, y, 2, 2, [P.red, P.teal, P.mus][i % 3]);
  });
  // doormat at the entrance
  O(240, 292, 48, 18, P.rugS); R(241, 293, 46, 16, '#9b7a52'); dith(242, 294, 44, 14, '#86663f', 2); R(244, 296, 40, 1, '#c4a070'); R(244, 305, 40, 1, '#c4a070');

  // big rug under the table
  RR(154, 148, 224, 136, 10, P.rugD); RR(158, 152, 216, 128, 8, P.rug, false);
  RR(164, 158, 204, 116, 6, P.rugS); RR(166, 160, 200, 112, 5, P.rugL, false);
  RR(172, 166, 188, 100, 4, P.rug, false);
  for (let y = 172; y < 262; y += 14) for (let x = 180 + ((y - 172) / 14 % 2) * 12; x < 354; x += 24){
    R(x + 3, y, 2, 1, P.rugC); R(x + 2, y + 1, 4, 1, P.rugC); R(x + 1, y + 2, 6, 1, P.rugL); R(x + 2, y + 3, 4, 1, P.rugC); R(x + 3, y + 4, 2, 1, P.rugC);
  }
  for (let y = 154; y < 280; y += 3){ R(150, y, 4, 1, P.rugC); R(378, y, 4, 1, P.rugC); }
  // braided round rug under the bean bag
  E(98, 236, 52, 30, P.rugS); E(98, 236, 49, 27, '#b98f6a', false);
  for (let k = 0; k < 4; k++) E(98, 236, 44 - k * 10, 23 - k * 5, k % 2 ? '#d9b28a' : '#a77a58', false);
  E(98, 236, 6, 3, P.cream, false);

  // floor cushions (zabuton)
  const cushion = (cx, cy, c, cl, cd) => {
    RR(cx - 13, cy - 8, 26, 18, 4, cd); RR(cx - 12, cy - 8, 24, 14, 4, c, false); R(cx - 9, cy - 7, 18, 1, cl);
    R(cx - 1, cy - 2, 2, 2, cd); R(cx - 7, cy - 5, 1, 1, cl); R(cx + 6, cy + 2, 1, 1, cd);
  };
  cushion(178, 204, P.orange, P.orangeL, P.orangeD);
  cushion(351, 204, P.blue, P.blueL, P.blueD);
  cushion(240, 252, P.sofa, P.sofaL, P.sofaD);
  cushion(290, 252, P.orange, P.orangeL, P.orangeD);
  cushion(264, 160, P.blue, P.blueL, P.blueD);
  // little floor things
  O(126, 264, 10, 6, P.dark); R(127, 265, 3, 2, P.red); R(132, 265, 2, 2, P.teal); // controller
  O(214, 296, 7, 5, P.red); O(222, 297, 7, 5, P.red); R(215, 297, 5, 1, P.redL); R(223, 298, 5, 1, P.redL); // slippers
  g.restore();

  // room shell: dark wood frame with beams at the front corners
  const W = bg.width, H = bg.height, F = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  F(0, 0, W, PAD, P.frame); F(0, 0, PAD, H, P.frame); F(W - PAD, 0, PAD, H, P.frame);
  F(0, 0, W, 2, P.frameL); F(0, 0, 2, H, P.frameL); F(W - 2, 0, 2, H, P.frameD);
  F(PAD - 2, PAD - 2, W - PAD * 2 + 4, 2, P.frameD); F(PAD - 2, PAD, 2, H - PAD, P.frameD); F(W - PAD, PAD, 2, H - PAD, P.frameD);
  for (let x = 14; x < W; x += 40) F(x, 4, 2, 2, P.frameD);
  F(0, H - 4, W, 4, P.frameD);
  buildWindowOverlay(); buildProps();
}

/* ---- window frame + curtains, drawn over the live sky ---- */
const winOver = document.createElement('canvas'); winOver.width = 180; winOver.height = 96;
const WIN = { x: 200, y: 14, w: 134, h: 66 }; // glass area in room px
function buildWindowOverlay(){
  const g = winOver.getContext('2d'); g.clearRect(0, 0, 180, 96); g.save(); g.translate(-178, -2);
  const { R, O, RR } = kit(g);
  // frame
  R(196, 10, 142, 4, P.out); R(196, 80, 142, 4, P.out); R(196, 10, 4, 74, P.out); R(334, 10, 4, 74, P.out);
  R(197, 11, 140, 2, P.woodT); R(197, 81, 140, 2, P.woodD); R(197, 11, 2, 72, P.woodT); R(335, 11, 2, 72, P.woodD);
  // mullions
  [243, 288].forEach(x => { R(x, 14, 3, 66, P.out); R(x + 1, 14, 1, 66, P.woodT); });
  R(200, 45, 134, 3, P.out); R(200, 46, 134, 1, P.woodT);
  // sill
  O(190, 82, 154, 5, P.woodT); R(191, 83, 152, 1, P.woodL);
  // curtain rod
  R(180, 5, 172, 3, P.out); R(181, 6, 170, 1, P.mus); O(177, 3, 6, 6, P.musD); O(349, 3, 6, 6, P.musD);
  // curtains with folds, gathered by tie-backs
  const curtain = (x, flip) => {
    for (let y = 7; y < 94; y++){
      const pinch = y > 50 && y < 62 ? 3 : y >= 62 ? Math.max(0, 3 - (y - 62) / 6) : 0, w = 18 - pinch * 1.3;
      const x0 = flip ? x + (18 - w) : x;
      R(x0, y, w, 1, P.out); R(x0 + 1, y, w - 2, 1, P.cur);
      for (let k = 0; k < 4; k++){ const fx = x0 + 2 + Math.round(k * (w - 4) / 3.2); R(fx, y, 1, 1, k % 2 ? P.curD : P.curL); }
    }
    R(x, 93, 18, 1, P.out);
    O(x + (flip ? 0 : 1), 53, 17, 5, P.mus); R(x + 3, 54, 12, 1, P.musL);
    for (let i = 8; i < 92; i += 9) R(x + (flip ? 2 : 14), i, 2, 1, P.curL);
  };
  curtain(184, false); curtain(332, true);
  // ruffled valance
  for (let x = 186; x < 348; x += 8){ RR(x, 7, 9, 7, 3, P.curL); R(x + 2, 9, 5, 1, P.white); }
  g.restore();
}

/* ---- props: things people can walk behind ---- */
function makeProp(id, x, y, w, h, base, paint, live){
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.translate(-x, -y); paint(g);
  return { id, x, y, w, h, base, cv, live };
}
function buildProps(){
  const list = [];
  // tall bookshelf (left wall)
  list.push(makeProp('shelf', 0, 4, 54, 120, 122, g => {
    const { R, O, B } = kit(g);
    B(3, 16, 46, 5, 101, P.woodT, P.wood);
    R(4, 17, 44, 2, P.woodL);
    [24, 48, 72].forEach((y, i) => { R(6, y, 40, 22, P.woodS); R(6, y + 22, 40, 2, P.woodT); R(6, y + 24, 40, 1, P.woodD); booksArt(g, 7, y + 2, 38, 20, 40 + i); });
    O(6, 98, 40, 18, P.woodD); R(7, 99, 38, 1, P.woodT); R(24, 105, 4, 2, P.mus);
    R(3, 118, 4, 4, P.out); R(45, 118, 4, 4, P.out);
    plantArt(g, 14, 16, 9, 3, 9);
    O(30, 9, 12, 8, P.cream); R(31, 10, 10, 2, P.white); R(33, 12, 6, 3, P.creamD); // little box
  }));
  // music cabinet: long low shelf, speakers, record player
  list.push(makeProp('cab', 54, 34, 134, 88, 120, g => {
    const { R, O, B, E, RR } = kit(g);
    B(56, 70, 130, 8, 42, P.woodT, P.wood); R(57, 71, 128, 2, P.woodL);
    [60, 103, 146].forEach((x, i) => { R(x, 82, 38, 30, P.woodS); R(x, 96, 38, 2, P.woodT); booksArt(g, x + 1, 83, 36, 13, 70 + i); if (i === 1){ R(x + 2, 99, 34, 13, P.woodS); for (let k = 0; k < 9; k++) R(x + 3 + k * 4, 100, 3, 12, ['#1d1a24', '#2e2a36', P.red, '#1d1a24', P.mus][k % 5]); } else booksArt(g, x + 1, 99, 36, 13, 80 + i); });
    R(56, 116, 4, 5, P.out); R(182, 116, 4, 5, P.out);
    // speakers
    [60, 162].forEach(x => { O(x, 40, 22, 32, P.dark); R(x + 1, 41, 20, 2, P.darkL); E(x + 11, 52, 6, 6, P.darkD); E(x + 11, 52, 3, 3, P.metalD, false); E(x + 11, 64, 4, 4, P.darkD); R(x + 10, 51, 2, 1, P.metal); });
    // record player
    B(92, 58, 52, 6, 10, P.woodL, P.woodD); R(93, 59, 50, 1, P.lampL);
    E(110, 60, 13, 4, P.darkD); E(110, 60, 10, 3, P.dark, false); E(110, 60, 3, 1, P.red, false);
    R(132, 56, 2, 6, P.metal); R(126, 60, 8, 1, P.metalL); O(136, 60, 5, 3, P.metalL);
    R(97, 69, 3, 2, P.mus); R(103, 69, 3, 2, P.teal);
    // small potted plant + vinyl sleeves leaning on the cabinet top
    plantArt(g, 150, 70, 7, 11, 7);
    O(84, 56, 7, 15, P.purple); O(86, 58, 6, 13, P.mus);
  }, (g, t) => {
    const on = Radio.isPlaying(), R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    if (on){ const k = Math.floor(t / 120) % 4; R(103 + k * 4, 58, 3, 1, 'rgba(255,255,255,.55)'); R(117 - k * 4, 61, 3, 1, 'rgba(255,255,255,.35)'); }
    R(141, 66, 2, 2, on ? '#7dff9a' : '#6b3a2a');
    if (on){
      const k = (t / 1000) % 2;
      [[0, P.musL], [1, P.curL]].forEach(([o, c]) => {
        const p = (k + o) % 2, nx = 100 + o * 18 + Math.sin(p * 3) * 4, ny = 50 - p * 16;
        g.globalAlpha = 1 - p / 2; R(nx, ny, 3, 3, c); R(nx + 3, ny - 6, 1, 8, c); R(nx + 3, ny - 6, 3, 1, c); g.globalAlpha = 1;
      });
    }
  }));
  // sofa in front of the window
  list.push(makeProp('sofa', 186, 60, 162, 70, 127, g => {
    const { R, O, RR } = kit(g);
    RR(196, 62, 142, 36, 7, P.sofa); R(200, 64, 134, 3, P.sofaL); R(198, 92, 138, 1, P.sofaD);
    for (let x = 220; x < 330; x += 36) R(x, 68, 1, 22, P.sofaD);
    // seat
    RR(200, 92, 134, 28, 4, P.sofaD); R(201, 93, 132, 14, P.sofaL); R(201, 93, 132, 1, P.sofaH);
    R(266, 93, 1, 14, P.sofaD); R(201, 107, 132, 1, P.out); R(201, 108, 132, 10, P.sofa);
    R(204, 119, 4, 6, P.out); R(326, 119, 4, 6, P.out);
    // arms
    [188, 326].forEach((x, i) => { RR(x, 78, 20, 44, 6, P.sofa); R(x + 2, 80, 16, 4, P.sofaH); R(x + 2, 84, 16, 2, P.sofaL); R(x + (i ? 2 : 15), 86, 2, 34, P.sofaD); });
    // pillows
    RR(212, 76, 26, 22, 5, P.cream); R(215, 79, 20, 3, P.white); R(212, 74, 6, 6, P.out); R(213, 75, 4, 4, P.cream); R(232, 74, 6, 6, P.out); R(233, 75, 4, 4, P.cream);
    R(219, 84, 2, 2, P.out); R(229, 84, 2, 2, P.out); R(223, 88, 4, 1, P.out); R(216, 87, 2, 1, P.pink); R(232, 87, 2, 1, P.pink);
    RR(248, 78, 24, 20, 5, P.orange); R(251, 80, 18, 3, P.orangeL); R(259, 86, 2, 2, P.orangeD);
    RR(300, 76, 26, 22, 5, P.creamD); for (let y = 79; y < 96; y += 4) R(302, y, 22, 2, 'rgba(160,110,70,.45)'); for (let x = 303; x < 324; x += 4) R(x, 78, 2, 18, 'rgba(160,110,70,.35)');
    // knitted blanket over the left arm
    for (let y = 80; y < 120; y++){ const w = 14 - Math.max(0, (y - 104) / 3); R(190, y, w, 1, (y >> 1) % 2 ? P.creamD : P.cream); }
    R(190, 80, 14, 1, P.out); for (let y = 118; y < 124; y += 2) R(191 + (y % 4), y, 2, 2, P.creamS);
  }));
  // side table with cat figurine
  list.push(makeProp('side', 348, 66, 36, 58, 121, g => {
    const { R, O, B, E } = kit(g);
    B(350, 96, 32, 5, 4, P.woodT, P.wood); R(353, 105, 3, 15, P.out); R(377, 105, 3, 15, P.out); R(354, 105, 1, 14, P.woodD); R(378, 105, 1, 14, P.woodD);
    R(354, 114, 26, 3, P.woodD);
    // cat figurine
    E(360, 92, 6, 5, P.white); R(355, 84, 3, 4, P.out); R(363, 84, 3, 4, P.out); R(356, 85, 1, 3, P.white); R(364, 85, 1, 3, P.white); E(360, 88, 5, 4, P.white);
    R(357, 88, 1, 1, P.out); R(362, 88, 1, 1, P.out); R(359, 90, 2, 1, P.pink);
    mugArt(g, 368, 90, P.teal);
    plantArt(g, 376, 96, 6, 5, 6);
  }));
  // standing fan
  list.push(makeProp('fan', 382, 46, 30, 78, 122, g => {
    const { R, O, E } = kit(g);
    E(397, 119, 10, 3, P.metalD); E(397, 118, 8, 2, P.metal, false);
    R(396, 76, 3, 42, P.out); R(397, 76, 1, 42, P.metalL);
    E(397, 64, 13, 13, P.metalD); E(397, 64, 11, 11, '#d9dde4', false);
    for (let k = -10; k <= 10; k += 4) R(397 + k, 54, 1, 21, 'rgba(90,96,112,.6)');
    E(397, 64, 3, 3, P.metalD);
  }, (g, t) => {
    const a = t / 90, R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    for (let k = 0; k < 3; k++){ const an = a + k * 2.094; for (let r = 3; r < 10; r++) R(397 + Math.cos(an) * r, 64 + Math.sin(an) * r, 2, 2, 'rgba(120,140,170,.55)'); }
  }));
  // easel (shows the shared drawing board)
  list.push(makeProp('easel', 410, 40, 96, 92, 130, g => {
    const { R, O } = kit(g);
    // legs
    for (let i = 0; i < 80; i++){ R(442 - i * .14, 48 + i, 3, 1, P.out); R(443 - i * .14, 48 + i, 1, 1, P.woodL); R(476 + i * .14, 48 + i, 3, 1, P.out); R(477 + i * .14, 48 + i, 1, 1, P.woodL); }
    R(459, 44, 3, 84, P.out); R(460, 44, 1, 84, P.wood);
    // canvas
    O(430, 48, 60, 46, P.woodD); R(432, 50, 56, 42, P.white);
    O(426, 93, 68, 5, P.woodT); R(428, 94, 6, 2, P.red); R(436, 94, 6, 2, P.cur); R(444, 94, 4, 2, P.mus);
    // paint jars + stool
    O(488, 112, 8, 10, P.cream); R(489, 113, 6, 3, P.red); O(497, 114, 7, 8, P.cream); R(498, 115, 5, 3, P.teal);
    O(418, 104, 14, 4, P.woodT); R(420, 108, 2, 16, P.out); R(428, 108, 2, 16, P.out); O(419, 99, 6, 6, P.dark); R(420, 100, 4, 1, P.pink);
  }, g => drawWallBoard(g)));
  // big corner plant
  list.push(makeProp('plantR', 496, 24, 32, 100, 122, g => plantArt(g, 512, 121, 22, 9, 16)));
  // TV corner
  list.push(makeProp('tv', 0, 98, 80, 94, 190, g => {
    const { R, O, B, E } = kit(g);
    B(4, 148, 72, 8, 32, P.woodT, P.wood); R(5, 149, 70, 2, P.woodL);
    O(8, 160, 30, 24, P.woodD); O(42, 160, 30, 24, P.woodD); R(9, 161, 28, 1, P.woodT); R(43, 161, 28, 1, P.woodT); R(34, 170, 2, 4, P.mus); R(44, 170, 2, 4, P.mus);
    R(5, 186, 4, 4, P.out); R(71, 186, 4, 4, P.out);
    // TV
    O(12, 102, 56, 42, P.darkD); R(13, 103, 54, 2, P.darkL); R(16, 106, 48, 32, '#0f1a26');
    R(36, 144, 8, 4, P.out); O(28, 147, 24, 3, P.dark);
    R(60, 140, 3, 2, '#7dff9a');
    // console + controller
    O(56, 141, 16, 7, '#e9e6f0'); R(57, 142, 14, 1, P.white); R(68, 144, 2, 2, P.teal);
    O(10, 143, 14, 5, P.dark); R(11, 144, 3, 3, P.darkL); R(19, 144, 2, 2, P.red);
  }, (g, t) => drawTvScreen(g, t)));
  // bean bag
  list.push(makeProp('bean', 74, 180, 56, 50, 228, g => {
    const { R, E, RR } = kit(g);
    E(102, 214, 26, 14, P.beanS); E(102, 213, 24, 12, P.beanD, false);
    E(100, 202, 22, 18, P.bean); E(98, 196, 16, 10, P.beanL, false); E(95, 192, 8, 4, P.beanH, false);
    E(104, 212, 16, 7, P.beanD, false); E(104, 211, 13, 5, P.bean, false);
    R(84, 204, 1, 4, P.beanD); R(118, 200, 1, 6, P.beanD);
    // cat-face pillow
    RR(112, 196, 16, 14, 4, P.cream); R(112, 194, 4, 4, P.out); R(113, 195, 2, 3, P.cream); R(124, 194, 4, 4, P.out); R(125, 195, 2, 3, P.cream);
    R(116, 201, 1, 2, P.out); R(122, 201, 1, 2, P.out); R(118, 204, 3, 1, P.out);
  }));
  // snack table
  list.push(makeProp('snack', 64, 222, 54, 44, 264, g => {
    const { R, O, E } = kit(g);
    R(89, 246, 4, 14, P.out); R(90, 246, 2, 14, P.woodD); E(91, 261, 10, 3, P.woodD);
    E(91, 244, 23, 9, P.woodD); E(91, 242, 22, 8, P.woodT, false); E(91, 241, 19, 6, P.woodL, false);
    E(80, 240, 6, 2, P.white); for (let i = 0; i < 4; i++) E(77 + i * 2, 238 + (i % 2), 2, 1, P.mus, false);
    mugArt(g, 92, 233, P.red); O(101, 230, 7, 10, '#f4e8c8'); R(102, 231, 5, 2, P.orange); R(102, 234, 5, 5, P.musL);
  }));
  // cat bed with a sleeping cat
  list.push(makeProp('catbed', 2, 228, 60, 46, 272, g => {
    const { R, E } = kit(g);
    E(32, 258, 27, 13, P.orangeD); E(32, 256, 25, 11, P.orange, false); E(32, 258, 19, 8, '#f2d5a8', false);
    // cat curled up
    E(32, 254, 13, 7, P.orange); E(30, 252, 9, 4, P.orangeL, false); E(22, 252, 6, 5, P.orange);
    R(17, 246, 3, 3, P.out); R(25, 246, 3, 3, P.out); R(18, 247, 1, 2, P.orange); R(26, 247, 1, 2, P.orange);
    R(19, 252, 2, 1, P.out); R(24, 252, 2, 1, P.out); R(22, 254, 1, 1, P.pink);
    for (let x = 30; x < 44; x += 4) R(x, 250, 2, 1, P.orangeD);
    R(40, 258, 6, 2, P.orange); R(44, 256, 3, 3, P.orange); R(46, 255, 1, 4, P.out);
  }, (g, t) => {
    const p = (t / 2400) % 1; g.globalAlpha = p < .8 ? 1 - p / .8 : 0; g.fillStyle = P.white;
    const x = 14 - p * 6, y = 242 - p * 14; g.fillRect(x, y, 4, 1); g.fillRect(x + 2, y + 1, 1, 1); g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x, y + 3, 4, 1); g.globalAlpha = 1;
  }));
  // the jigsaw table
  list.push(makeProp('table', 188, 154, 152, 82, 232, g => {
    const { R, O, B } = kit(g);
    B(192, 166, 144, 48, 10, P.woodT, P.wood); R(193, 167, 142, 2, P.woodL);
    for (let y = 172; y < 212; y += 9) R(196, y, 136, 1, 'rgba(110,60,30,.25)');
    R(198, 224, 6, 10, P.out); R(324, 224, 6, 10, P.out); R(199, 224, 4, 9, P.woodD); R(325, 224, 4, 9, P.woodD);
    // board + scattered pieces
    O(216, 171, 96, 38, P.woodD); R(218, 173, 92, 34, P.cream);
    const rnd = rng(5);
    for (let i = 0; i < 16; i++){ const x = 198 + Math.floor(rnd() * 130), y = 170 + Math.floor(rnd() * 40); if (x > 212 && x < 314 && y > 166 && y < 212) continue; R(x, y, 4, 4, P.out); R(x, y, 3, 3, [P.sofaL, P.curL, P.orangeL, P.musL, P.rugL][i % 5]); R(x + 1, y - 1, 1, 1, P.out); }
    mugArt(g, 200, 170, P.cream); mugArt(g, 318, 198, P.blue);
    O(314, 174, 18, 14, P.curD); R(315, 175, 16, 4, P.leafL); R(315, 179, 16, 8, P.curL); R(317, 181, 6, 3, P.orangeL); // puzzle box lid
    plantArt(g, 206, 212, 6, 33, 7);
  }, (g, t) => drawTable(g, t)));
  // cabinet with cat lamp (right)
  list.push(makeProp('cabR', 482, 136, 46, 98, 232, g => {
    const { R, O, B, E, RR } = kit(g);
    B(484, 166, 42, 7, 58, P.woodT, P.wood); R(485, 167, 40, 2, P.woodL);
    O(488, 176, 34, 22, P.woodD); O(488, 200, 34, 22, P.woodD); R(489, 177, 32, 1, P.woodT); R(489, 201, 32, 1, P.woodT); R(503, 186, 4, 2, P.mus); R(503, 210, 4, 2, P.mus);
    R(486, 228, 4, 5, P.out); R(520, 228, 4, 5, P.out);
    booksArt(g, 486, 156, 14, 11, 91);
    // cat lamp
    RR(502, 146, 20, 21, 7, P.lamp); R(502, 144, 5, 6, P.out); R(503, 145, 3, 4, P.lamp); R(517, 144, 5, 6, P.out); R(518, 145, 3, 4, P.lamp);
    R(507, 153, 2, 2, P.ink); R(515, 153, 2, 2, P.ink); R(510, 157, 4, 1, P.ink); R(505, 150, 12, 2, P.lampL);
  }));
  // umbrella stand
  list.push(makeProp('umb', 496, 236, 32, 52, 286, g => {
    const { R, O } = kit(g);
    R(503, 240, 2, 22, P.out); R(504, 240, 1, 22, P.red); R(500, 238, 5, 2, P.out);
    R(512, 242, 2, 20, P.out); R(513, 242, 1, 20, P.cur); R(513, 240, 5, 2, P.out);
    O(500, 256, 20, 28, P.blueD); R(501, 257, 18, 2, P.blueL); R(502, 266, 16, 1, P.blueS); R(502, 274, 16, 1, P.blueS);
  }));
  // low front wall with plants, open at the entrance
  list.push(makeProp('front', 0, 262, LW, 50, 400, g => {
    const { R, O, B } = kit(g);
    const seg = (x, w) => { B(x, 290, w, 6, 16, P.woodT, P.wood); R(x + 1, 291, w - 2, 1, P.woodL); for (let px = x + 4; px < x + w - 4; px += 22) O(px, 299, 18, 10, P.woodD); };
    seg(-2, 242); seg(288, 242);
    plantArt(g, 26, 292, 12, 2, 12); plantArt(g, 150, 292, 9, 12, 10); plantArt(g, 366, 292, 10, 14, 10); plantArt(g, 470, 292, 13, 4, 12);
    O(84, 280, 22, 11, P.cream); booksArt(g, 60, 280, 20, 11, 99); O(196, 284, 14, 7, P.woodD); R(197, 285, 12, 2, P.musL);
    O(410, 282, 18, 9, P.purple); R(411, 283, 16, 2, P.pink);
  }));
  Room.props = list;
}

/* ---- live bits ---- */
function drawTable(g, t){
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (Room.tableImg){
    const img = Room.tableImg, k = Math.min(90 / img.width, 32 / img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
    g.imageSmoothingEnabled = true; g.drawImage(img, 264 - w / 2, 190 - h / 2, w, h); g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(264 - w / 2, 190 - h / 2, w, 1);
  } else {
    for (let y = 0; y < 32; y += 4) for (let x = (y / 4) % 2 * 4; x < 90; x += 8) R(219 + x, 174 + y, 4, 4, '#ead6aa');
  }
  if (Math.floor(t / 400) % 2 && [...Room.others.values(), Room.me].some(a => a && Math.abs(a.x - 264) < 96 && Math.abs(a.y - 200) < 60)){ R(310, 168, 3, 3, '#fff'); R(309, 169, 5, 1, '#fff'); }
}
function drawTvScreen(g, t){
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const live = typeof DG !== 'undefined' && DG.mineRoom;
  // a little landscape with a play button (like a paused video), or the game logo when you're in a room
  R(16, 106, 48, 20, '#7cc4ec'); R(16, 118, 48, 8, '#bfe6f6');
  R(20, 110, 8, 3, P.white); R(22, 109, 4, 1, P.white); R(44, 112, 6, 2, P.white);
  for (let x = 16; x < 64; x++){ const h = 6 + Math.round(Math.sin(x * .25) * 3 + Math.sin(x * .7)); R(x, 132 - h, 1, h, '#5aa04a'); }
  R(16, 130, 48, 8, '#3f7a3a');
  const k = Math.floor(t / 600) % 2;
  if (live){ R(30, 114, 20, 14, 'rgba(20,20,30,.6)'); R(33, 117, 4, 4, P.red); R(38, 117, 4, 4, P.mus); R(43, 117, 4, 4, P.cur); R(35, 122, 10, 2, P.white); }
  else { R(34, 114, 12, 12, 'rgba(20,20,30,.55)'); R(38, 117, 2, 6, P.white); R(40, 118, 2, 4, P.white); R(42, 119, 1, 2, P.white); }
  R(16, 136, Math.round(48 * ((t / 30000) % 1)), 2, P.red);
  if (k) R(16, 106, 48, 1, 'rgba(255,255,255,.25)');
}
function drawWallLive(g, t){
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  // clock hands (real local time)
  const d = new Date(), hr = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, mn = d.getMinutes() / 60 * Math.PI * 2;
  for (let r = 0; r < 4; r++) R(80 + Math.sin(hr) * r, 23 - Math.cos(hr) * r, 1, 1, P.ink);
  for (let r = 0; r < 6; r++) R(80 + Math.sin(mn) * r, 23 - Math.cos(mn) * r, 1, 1, P.ink);
  R(80, 23, 1, 1, P.red);
  // equalizer
  const on = Radio.isPlaying();
  for (let i = 0; i < 10; i++){
    const h = on ? 2 + Math.round((Math.sin(t / 160 + i * 1.7) * .5 + .5) * (Math.sin(t / 410 + i) * .5 + .5) * 7) : 1;
    for (let k = 0; k < h; k++) R(99 + i * 4, 47 - k, 3, 1, k > 5 ? '#c8f0ff' : k > 3 ? '#7fd4ff' : '#4aa8f0');
  }
}

/* ---- avatars: outlined chibi sprites, cached per look/pose ---- */
const spriteCache = new Map();
const SPR_W = 26, SPR_H = 42;
function charSprite(look, dir, frame, pose){
  const key = [look.color, look.hair, look.hc, look.acc, dir, frame, pose].join('|');
  let c = spriteCache.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = SPR_W; c.height = SPR_H;
  const g = c.getContext('2d'); drawChar(g, SPR_W / 2, SPR_H - 2, look, dir, frame, pose);
  const d = g.getImageData(0, 0, SPR_W, SPR_H), px = d.data, out = new Uint8ClampedArray(px);
  for (let y = 0; y < SPR_H; y++) for (let x = 0; x < SPR_W; x++){
    const i = (y * SPR_W + x) * 4; if (px[i + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < SPR_W && ny < SPR_H && px[(ny * SPR_W + nx) * 4 + 3] > 200; });
    if (near){ out[i] = 43; out[i + 1] = 26; out[i + 2] = 20; out[i + 3] = 255; }
  }
  d.data.set(out); g.putImageData(d, 0, 0);
  if (spriteCache.size > 400) spriteCache.clear();
  spriteCache.set(key, c); return c;
}
function drawAvatar(g, a, t){
  const x = Math.round(a.x), y = Math.round(a.y), pose = a.sit ? 'sit' : 'stand';
  if (!a.sit || a.sit.kind === 'floor'){ g.fillStyle = 'rgba(30,15,10,.28)'; g.fillRect(x - 7, y - 1, 14, 2); g.fillRect(x - 5, y + 1, 10, 1); }
  const frame = a.path.length ? Math.floor(a.walk * 9) % 4 : (pose === 'stand' && Math.floor((t + hashStr(a.k + '') % 1000) / 700) % 6 === 0 ? 4 : 0);
  g.drawImage(charSprite(a, a.dir, frame, pose), x - SPR_W / 2, y - SPR_H + 2);
}
