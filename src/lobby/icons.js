/* ----- pixel icons for the HUD: drawn once into 20x20 canvases with the same art kit ----- */
const ICONS = {
  house(R, E, RR, g){
    for (let i = 0; i < 9; i++) R(10 - i - 1, 2 + i, i * 2 + 2, 1, P.out);
    for (let i = 1; i < 8; i++) R(10 - i, 3 + i, i * 2, 1, P.redL);
    R(4, 10, 12, 8, P.out); R(5, 10, 10, 7, P.cream); R(5, 10, 10, 1, P.creamD);
    R(8, 12, 4, 5, P.out); R(9, 13, 2, 4, P.wood); R(13, 3, 3, 4, P.out); R(14, 4, 1, 3, P.redD);
  },
  people(R, E, RR){
    E(13, 6, 3, 3, P.out, false); E(13, 6, 2, 2, P.creamD, false); RR(8, 10, 10, 8, 4, P.creamD);
    E(7, 7, 4, 4, P.out, false); E(7, 7, 3, 3, P.white, false); RR(1, 11, 12, 8, 4, P.white);
  },
  gear(R, E, RR, g){
    [[8, 1, 4, 4], [8, 15, 4, 4], [1, 8, 4, 4], [15, 8, 4, 4], [3, 3, 4, 4], [13, 3, 4, 4], [3, 13, 4, 4], [13, 13, 4, 4]].forEach(([x, y, w, h]) => { R(x, y, w, h, P.out); R(x + 1, y + 1, w - 2, h - 2, P.metalL); });
    E(10, 10, 7, 7, P.out, false); E(10, 10, 6, 6, P.metalL, false); E(10, 10, 3, 3, P.out, false); g.clearRect(9, 9, 2, 2);
  },
  exit(R, E, RR){
    R(2, 2, 10, 16, P.out); R(3, 3, 8, 14, P.wood); R(3, 3, 8, 1, P.woodL); R(9, 10, 1, 1, P.mus);
    R(9, 9, 7, 3, P.out); R(13, 6, 2, 9, P.out); R(15, 7, 2, 7, P.out); R(17, 9, 1, 3, P.out);
    R(10, 10, 6, 1, P.white); R(14, 7, 1, 7, P.white); R(15, 8, 1, 5, P.white); R(16, 9, 1, 3, P.white);
  },
  chat(R, E, RR){
    RR(2, 3, 16, 12, 4, P.white); R(5, 14, 4, 4, P.out); R(6, 14, 2, 2, P.white); R(6, 7, 8, 1, P.metalD); R(6, 10, 6, 1, P.metalD);
  },
  smile(R, E){
    E(10, 10, 8, 8, P.mus); R(6, 7, 2, 3, P.out); R(12, 7, 2, 3, P.out); R(5, 12, 1, 1, P.out); R(6, 13, 1, 1, P.out); R(7, 14, 6, 1, P.out); R(13, 13, 1, 1, P.out); R(14, 12, 1, 1, P.out); R(4, 11, 2, 1, P.pink); R(14, 11, 2, 1, P.pink); R(6, 4, 4, 1, P.musL);
  },
  send(R){
    for (let y = 3; y <= 16; y++){ const w = Math.round(15 - Math.abs(y - 9.5) * 2); if (w > 0) R(3, y, w, 1, P.out); }
    for (let y = 4; y <= 15; y++){ const w = Math.round(13 - Math.abs(y - 9.5) * 2); if (w > 0) R(4, y, w, 1, P.white); }
    R(4, 9, 6, 2, P.curL);
  },
  puzzle(R, E, RR){
    RR(2, 6, 14, 12, 2, P.out, false); E(9, 5, 3, 3, P.out, false); E(16, 12, 3, 3, P.out, false);
    RR(3, 7, 12, 10, 1, '#4aa8f0', false); E(9, 5, 2, 2, '#4aa8f0', false); E(16, 12, 2, 2, '#4aa8f0', false);
    R(4, 8, 4, 1, '#a8dcff'); R(4, 9, 1, 3, '#a8dcff'); R(8, 4, 2, 1, '#a8dcff'); R(4, 16, 11, 1, '#2f7fc4'); R(15, 13, 2, 1, '#2f7fc4');
  },
  palette(R, E, RR, g){
    E(10, 10, 8, 7, P.out, false); E(10, 10, 7, 6, P.cream, false); R(4, 6, 6, 2, P.white);
    E(13, 13, 2, 2, P.out, false); g.clearRect(12, 12, 2, 2);
    R(5, 8, 3, 3, P.red); R(9, 5, 3, 3, '#4aa8f0'); R(13, 6, 3, 3, P.leaf); R(5, 12, 3, 3, P.mus); R(9, 14, 2, 2, P.purple);
    for (let i = 0; i < 6; i++){ R(13 + i, 18 - i, 2, 1, P.out); } R(18, 12, 2, 2, P.woodD);
  },
  pad(R, E, RR){
    RR(1, 6, 18, 10, 4, P.purple); R(3, 7, 14, 1, '#b29cf0');
    E(5, 15, 3, 3, P.out, false); E(15, 15, 3, 3, P.out, false); E(5, 15, 2, 2, P.purple, false); E(15, 15, 2, 2, P.purple, false);
    R(4, 10, 5, 1, P.white); R(6, 8, 1, 5, P.white); R(12, 9, 2, 2, P.red); R(15, 9, 2, 2, P.mus); R(13, 12, 2, 2, P.leafL); R(16, 12, 2, 2, '#4aa8f0');
  },
  cup(R, E, RR){
    R(12, 0, 2, 6, '#f27aa8'); E(10, 6, 7, 3, '#eaf6fb'); R(3, 6, 15, 1, P.out);
    for (let i = 0; i < 12; i++){ const ins = Math.round(i * 3 / 12); R(3 + ins, 7 + i, 15 - ins * 2, 1, P.out); R(4 + ins, 7 + i, 13 - ins * 2, 1, i < 2 ? '#fff3dc' : '#e8853c'); }
    R(6, 19, 9, 1, P.out); E(7, 16, 1, 1, P.out, false); E(10, 17, 1, 1, P.out, false); E(13, 16, 1, 1, P.out, false); R(5, 9, 1, 7, '#f4b46e');
  },
  tiles(R, E, RR){
    RR(9, 1, 10, 10, 2, '#c8955a'); R(10, 2, 8, 7, '#ecc58e'); R(12, 4, 4, 1, P.out); R(15, 4, 1, 4, P.out); R(12, 5, 1, 3, P.out);
    RR(1, 7, 12, 12, 2, '#b9854a'); R(2, 8, 10, 9, '#f6dcaa'); R(2, 16, 10, 1, '#d9a866');
    R(4, 10, 5, 1, P.out); R(9, 10, 1, 1, P.out); R(9, 11, 1, 5, P.out); R(4, 11, 1, 1, P.out); R(5, 12, 1, 1, P.out); R(4, 12, 1, 4, P.out); R(5, 11, 1, 1, '#f6dcaa');
  },
  dice(R, E, RR){
    RR(1, 5, 11, 11, 3, P.white); R(4, 8, 2, 2, P.red); R(7, 11, 2, 2, P.red); R(2, 13, 9, 1, '#d8d0c4');
    RR(9, 2, 10, 10, 3, P.mus); R(11, 4, 2, 2, P.out); R(15, 4, 2, 2, P.out); R(11, 8, 2, 2, P.out); R(15, 8, 2, 2, P.out); R(10, 10, 8, 1, P.musD);
  },
  radio(R, E, RR){
    for (let i = 0; i < 6; i++) R(13 + i * .6, 6 - i, 1, 1, P.out);
    RR(1, 6, 18, 12, 3, P.red); R(3, 7, 14, 1, P.redL);
    R(3, 9, 7, 7, P.out); R(4, 10, 5, 5, P.dark); for (let y = 11; y < 15; y += 2) R(4, y, 5, 1, P.darkL);
    R(11, 9, 6, 3, P.out); R(12, 10, 4, 1, P.musL); E(12, 14, 1, 1, P.cream); E(16, 14, 1, 1, P.cream);
  },
  weather(R, E, RR){
    for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; R(8 + Math.round(Math.cos(a) * 7), 7 + Math.round(Math.sin(a) * 7), 2, 2, P.mus); }
    E(8, 7, 4, 4, P.musL);
    E(13, 14, 5, 3, P.out, false); E(9, 13, 3, 3, P.out, false); E(14, 11, 3, 3, P.out, false); R(5, 14, 14, 4, P.out);
    E(13, 14, 4, 2, P.white, false); E(9, 13, 2, 2, P.white, false); E(14, 11, 2, 2, P.white, false); R(6, 14, 12, 3, P.white); R(6, 16, 12, 1, '#c8d4e4');
  }
};
function paintIcon(cv, name){
  cv.width = 20; cv.height = 20;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 20, 20);
  const { R, E, RR } = kit(g); (ICONS[name] || (() => {}))(R, E, RR, g);
}
document.querySelectorAll('canvas.px[data-px]').forEach(cv => paintIcon(cv, cv.dataset.px));
