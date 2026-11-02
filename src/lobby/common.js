const BASE = [[0,0],[.14,0],[.28,0],[.42,0],[.43,.04],[.38,.06],[.38,.13],[.38,.20],[.44,.25],[.50,.25],[.56,.25],[.62,.20],[.62,.13],[.62,.06],[.57,.04],[.58,0],[.72,0],[.86,0],[1,0]];
function makeEdges(cols, rows){
  const e = () => ({ s: Math.random() < .5 ? 1 : -1 });
  const h = [], v = [];
  for (let r = 0; r <= rows; r++){ h[r] = []; for (let c = 0; c < cols; c++) h[r][c] = (r > 0 && r < rows) ? e() : null; }
  for (let r = 0; r < rows; r++){ v[r] = []; for (let c = 0; c <= cols; c++) v[r][c] = (c > 0 && c < cols) ? e() : null; }
  return { h, v };
}
function edgePts(E, type, r, c, cw, ch){
  const k = Math.min(cw, ch);
  if (type === 'h'){
    const e = E.h[r][c];
    if (!e) return [[c * cw, r * ch], [(c + 1) * cw, r * ch]];
    const L = cw, o = (L - k) / 2;
    return BASE.map(([x, y]) => [c * cw + (x === 0 || x === 1 ? x * L : o + x * k), r * ch + e.s * y * k]);
  }
  const e = E.v[r][c];
  if (!e) return [[c * cw, r * ch], [c * cw, (r + 1) * ch]];
  const L = ch, o = (L - k) / 2;
  return BASE.map(([x, y]) => [c * cw + e.s * y * k, r * ch + (x === 0 || x === 1 ? x * L : o + x * k)]);
}
function trace(g, pts, rev){
  const a = rev ? pts.slice().reverse() : pts;
  if (a.length === 2){ g.lineTo(a[1][0], a[1][1]); return; }
  for (let i = 1; i < a.length; i += 3) g.bezierCurveTo(a[i][0], a[i][1], a[i+1][0], a[i+1][1], a[i+2][0], a[i+2][1]);
}
function piecePath(g, E, r, c, cw, ch){
  g.beginPath(); g.moveTo(c * cw, r * ch);
  trace(g, edgePts(E, 'h', r, c, cw, ch), false);
  trace(g, edgePts(E, 'v', r, c + 1, cw, ch), false);
  trace(g, edgePts(E, 'h', r + 1, c, cw, ch), true);
  trace(g, edgePts(E, 'v', r, c, cw, ch), true);
  g.closePath();
}

/* ---------- sample picture (drawn in code) ---------- */
function paintSample(){
  const W = 1200, H = 900, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), R = rng(11);
  const circ = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  let gr = g.createLinearGradient(0, 0, 0, 530);
  gr.addColorStop(0, '#565aa8'); gr.addColorStop(.42, '#ad8ad3'); gr.addColorStop(.78, '#ffad99'); gr.addColorStop(1, '#ffdca2');
  g.fillStyle = gr; g.fillRect(0, 0, W, 530);
  for (let i = 0; i < 60; i++){ g.fillStyle = `rgba(255,255,255,${.25 + R() * .55})`; circ(R() * W, R() * 190, .6 + R() * 1.8); }
  const sg = g.createRadialGradient(840, 455, 10, 840, 455, 300);
  sg.addColorStop(0, 'rgba(255,244,200,.95)'); sg.addColorStop(.35, 'rgba(255,214,165,.45)'); sg.addColorStop(1, 'rgba(255,200,170,0)');
  g.fillStyle = sg; g.fillRect(0, 0, W, 530);
  g.fillStyle = '#fff2c2'; circ(840, 462, 76);
  const cloud = (x, y, s, col) => { g.fillStyle = col; [[0,0,46],[50,-22,56],[105,-4,48],[150,8,34],[-40,10,32]].forEach(([dx,dy,r]) => circ(x + dx*s, y + dy*s, r*s)); g.fillRect(x - 40*s, y + 4*s, 190*s, 38*s); };
  cloud(150, 150, 1.1, 'rgba(255,226,242,.9)'); cloud(560, 95, .75, 'rgba(255,235,248,.85)');
  cloud(990, 205, 1, 'rgba(255,214,226,.85)'); cloud(420, 300, .55, 'rgba(255,196,196,.7)');
  const ridge = (base, amp, step, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 540); for (let x = 0; x <= W + step; x += step) g.lineTo(x, base - R() * amp); g.lineTo(W, 540); g.closePath(); g.fill(); };
  ridge(430, 150, 70, '#9a83c6'); ridge(475, 95, 55, '#7d69ad'); ridge(505, 45, 40, '#61589a');
  g.fillStyle = '#4c8676'; g.beginPath(); g.moveTo(560, 540); g.quadraticCurveTo(820, 360, 1200, 395); g.lineTo(1200, 540); g.closePath(); g.fill();
  const pine = (x, y, s, col) => { g.fillStyle = col; for (let i = 0; i < 3; i++){ const top = y - (70 - i * 18) * s, base = y - i * 16 * s; g.beginPath(); g.moveTo(x, top); g.lineTo(x - (26 - i * 4) * s, base); g.lineTo(x + (26 - i * 4) * s, base); g.closePath(); g.fill(); } g.fillRect(x - 3*s, y - 2*s, 6*s, 12*s); };
  [[640,520,.8],[700,500,1],[760,480,.9],[1150,430,1.1],[1090,445,.9],[880,445,.8]].forEach(([x,y,s]) => pine(x, y, s, '#2f6458'));
  g.fillStyle = '#f2d4ab'; g.fillRect(950, 380, 120, 78);
  g.fillStyle = '#c75d4b'; g.beginPath(); g.moveTo(935, 384); g.lineTo(1010, 330); g.lineTo(1085, 384); g.closePath(); g.fill();
  g.fillStyle = '#7a4a33'; g.fillRect(1030, 300, 14, 40); g.fillRect(1000, 412, 22, 46);
  const wg = g.createRadialGradient(972, 410, 2, 972, 410, 40); wg.addColorStop(0, 'rgba(255,214,110,.8)'); wg.addColorStop(1, 'rgba(255,214,110,0)');
  g.fillStyle = wg; circ(972, 410, 40); g.fillStyle = '#ffd36e'; g.fillRect(960, 398, 24, 22); g.fillRect(1040, 398, 20, 22);
  gr = g.createLinearGradient(0, 530, 0, H);
  gr.addColorStop(0, '#e6a9a3'); gr.addColorStop(.22, '#7d86c6'); gr.addColorStop(.6, '#43609f'); gr.addColorStop(1, '#2a417f');
  g.fillStyle = gr; g.fillRect(0, 530, W, H - 530);
  g.save(); g.globalAlpha = .28; g.translate(0, 1080); g.scale(1, -1);
  g.fillStyle = '#2d5c55'; g.beginPath(); g.moveTo(560, 540); g.quadraticCurveTo(820, 360, 1200, 395); g.lineTo(1200, 540); g.closePath(); g.fill(); g.restore();
  for (let i = 0; i < 20; i++){ const y = 540 + i * 17, w = 210 - i * 7 + R() * 50; g.fillStyle = `rgba(255,232,175,${Math.max(.08, .75 - i * .035)})`; g.fillRect(840 - w / 2 + (R() - .5) * 40, y, w, 5); }
  for (let i = 0; i < 70; i++){ g.fillStyle = `rgba(255,255,255,${.12 + R() * .25})`; g.fillRect(R() * W, 560 + R() * 330, 14 + R() * 40, 2); }
  gr = g.createLinearGradient(0, 700, 0, H); gr.addColorStop(0, '#6cb684'); gr.addColorStop(1, '#3b8462');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 690); g.quadraticCurveTo(260, 700, 470, 800); g.quadraticCurveTo(560, 860, 600, H); g.lineTo(0, H); g.closePath(); g.fill();
  const fl = ['#ffd1e0', '#ffe48a', '#ffffff', '#f79ab4', '#c7b2ff'];
  for (let i = 0; i < 140; i++){ const x = R() * 520, y = 720 + R() * 180; if (y < 690 + x * .35) continue; g.fillStyle = fl[i % fl.length]; circ(x, y, 3 + R() * 4); }
  g.fillStyle = '#6e4428'; for (let x = 330; x <= 830; x += 70){ g.fillRect(x, 655, 12, 95); g.globalAlpha = .3; g.fillRect(x, 750, 12, 60); g.globalAlpha = 1; }
  g.fillStyle = '#a86a3e'; g.fillRect(300, 640, 560, 30);
  g.fillStyle = '#c98b55'; g.fillRect(300, 640, 560, 7);
  g.strokeStyle = 'rgba(80,45,20,.45)'; g.lineWidth = 2; for (let x = 340; x < 860; x += 34){ g.beginPath(); g.moveTo(x, 641); g.lineTo(x, 669); g.stroke(); }
  g.fillStyle = '#5c3820'; g.fillRect(844, 590, 10, 52);
  const lg = g.createRadialGradient(849, 590, 2, 849, 590, 46); lg.addColorStop(0, 'rgba(255,220,130,.95)'); lg.addColorStop(1, 'rgba(255,220,130,0)');
  g.fillStyle = lg; circ(849, 590, 46); g.fillStyle = '#ffe9a8'; circ(849, 588, 8);
  g.strokeStyle = '#2f6a55'; g.lineWidth = 4; g.lineCap = 'round';
  for (let i = 0; i < 26; i++){ const x = 1020 + R() * 180, h = 60 + R() * 90; g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + 8, H - h / 2, x + (R() - .5) * 30, H - h); g.stroke(); }
  g.fillStyle = '#7b4b2c'; for (let i = 0; i < 6; i++){ const x = 1040 + R() * 150; g.beginPath(); g.ellipse(x, H - 120 - R() * 40, 5, 14, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(60,40,90,.7)'; g.lineWidth = 3;
  [[300,250],[340,232],[372,262],[640,210]].forEach(([x,y]) => { g.beginPath(); g.moveTo(x - 12, y - 5); g.quadraticCurveTo(x - 5, y - 9, x, y); g.quadraticCurveTo(x + 5, y - 9, x + 12, y - 5); g.stroke(); });
  return cv;
}

function toSrc(img){
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  let sx = 0, sy = 0, sw = w, sh = h; const ar = w / h;
  if (ar > 2){ sw = h * 2; sx = (w - sw) / 2; } else if (ar < .5){ sh = w * 2; sy = (h - sh) / 2; }
  const m = Math.min(1, 1800 / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.round(sw * m); c.height = Math.round(sh * m);
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/* ---------- sound ---------- */
let ac = null, soundOn = true;
function audioInit(){ if (!ac){ try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } if (ac && ac.state === 'suspended') ac.resume(); }
function tone(f, t0, dur, type, vol, f2){
  if (!ac || !soundOn) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
}
const sfxSnap = () => { tone(620, 0, .09, 'triangle', .22, 300); tone(1240, 0, .05, 'sine', .06); };
const sfxPick = () => tone(420, 0, .05, 'sine', .07, 520);
const sfxSet = () => tone(300, 0, .07, 'triangle', .1, 240);
const sfxTurn = () => tone(760, 0, .05, 'sine', .07, 900);
const sfxDone = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .11, .4, 'triangle', .16));

