/* ---------- weather (shared), ambient sound mixer (per device), quick emoji ---------- */
const WEATHERS = [
  { id: 'sun', icon: '☀️', name: 'แดดออก' },
  { id: 'sunset', icon: '🌇', name: 'ยามเย็น' },
  { id: 'night', icon: '🌙', name: 'กลางคืน' },
  { id: 'drizzle', icon: '🌦️', name: 'ฝนตกเบา' },
  { id: 'rain', icon: '🌧️', name: 'ฝนตกหนัก' },
  { id: 'storm', icon: '⛈️', name: 'พายุฟ้าคะนอง' }
];
const SOUNDS = [
  { id: 'rainL', icon: '🌦️', name: 'ฝนตกเบา' },
  { id: 'rainH', icon: '🌧️', name: 'ฝนตกหนัก' },
  { id: 'thunder', icon: '⚡', name: 'ฟ้าร้อง' },
  { id: 'wind', icon: '🍃', name: 'ลม' },
  { id: 'birds', icon: '🐦', name: 'นกร้อง' },
  { id: 'crickets', icon: '🦗', name: 'จิ้งหรีด' },
  { id: 'waves', icon: '🌊', name: 'คลื่นกระทบฝั่ง' },
  { id: 'stream', icon: '💧', name: 'ลำธาร' },
  { id: 'fire', icon: '🔥', name: 'ไฟในเตาผิง' }
];
/* sounds the weather controls when "follow weather" is on; waves, stream and fire are always the player's own choice */
const WEATHER_SOUNDS = ['rainL', 'rainH', 'thunder', 'wind', 'birds', 'crickets'];
const PRESETS = {
  sun: { birds: 45, wind: 12 },
  sunset: { birds: 18, crickets: 22, wind: 14 },
  night: { crickets: 45, wind: 8 },
  drizzle: { rainL: 60, wind: 8 },
  rain: { rainH: 62, rainL: 30, wind: 12 },
  storm: { rainH: 72, thunder: 65, wind: 30 }
};
L.weather = 'sun';

/* ----- ambient engine: everything is synthesized with Web Audio, no sound files ----- */
const Amb = Object.assign({ master: 60, follow: true, vol: {} }, LS.get('jt-amb', {}));
SOUNDS.forEach(s => { if (typeof Amb.vol[s.id] !== 'number') Amb.vol[s.id] = 0; });
Amb.live = {}; Amb.out = null; Amb.noise = null;
function ambSave(){ LS.set('jt-amb', { master: Amb.master, follow: Amb.follow, vol: Amb.vol }); }
function noiseBufs(){
  if (Amb.noise) return Amb.noise;
  const n = ac.sampleRate * 4, mk = () => ac.createBuffer(1, n, ac.sampleRate);
  const w = mk(), p = mk(), b = mk(), wd = w.getChannelData(0), pd = p.getChannelData(0), bd = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++){
    const x = Math.random() * 2 - 1; wd[i] = x;
    b0 = .99886 * b0 + x * .0555179; b1 = .99332 * b1 + x * .0750759; b2 = .969 * b2 + x * .153852;
    b3 = .8665 * b3 + x * .3104856; b4 = .55 * b4 + x * .5329522; b5 = -.7616 * b5 - x * .016898;
    pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * .5362) * .11; b6 = x * .115926;
    last = (last + .02 * x) / 1.02; bd[i] = last * 3.5;
  }
  return Amb.noise = { white: w, pink: p, brown: b };
}
function ambOut(){
  if (!Amb.out){ Amb.out = ac.createGain(); Amb.out.connect(ac.destination); }
  Amb.out.gain.setTargetAtTime(Amb.master / 100, ac.currentTime, .1);
  return Amb.out;
}
function loopNoise(kind, dest){ const s = ac.createBufferSource(); s.buffer = noiseBufs()[kind]; s.loop = true; s.loopStart = Math.random(); s.connect(dest); s.start(0, Math.random() * 3); return s; }
function filt(type, freq, q){ const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f; }
function lfo(rate, depth, param){ const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(param); o.start(); return o; }
function burst(dest, kind, dur, peak, f, ftype, attack){
  const t = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain(), fl = filt(ftype || 'bandpass', f, 1);
  s.buffer = noiseBufs()[kind]; s.connect(fl).connect(g).connect(dest);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + (attack || .005)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.start(t, Math.random() * 3); s.stop(t + dur + .05);
}
function chirp(dest, f0, f1, dur, peak, delay){
  const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + dur * .2); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + .02);
}
/* each builder wires a graph into `g` (the channel gain) and returns { stop(), tick() } */
const BUILD = {
  rainL(g){
    const hp = filt('highpass', 500), lp = filt('lowpass', 5200); hp.connect(lp).connect(g);
    const src = loopNoise('pink', hp); const mod = lfo(.13, 900, lp.frequency);
    return { stop(){ src.stop(); mod.stop(); }, tick(){ if (Math.random() < .5) burst(g, 'white', .03, .25, 2500 + Math.random() * 3500, 'bandpass'); } };
  },
  rainH(g){
    const lp = filt('lowpass', 2600), lp2 = filt('lowpass', 9000), mix = ac.createGain(); mix.gain.value = .35;
    lp.connect(g); lp2.connect(mix).connect(g);
    const a = loopNoise('brown', lp), b = loopNoise('white', lp2), mod = lfo(.07, 500, lp.frequency);
    return { stop(){ a.stop(); b.stop(); mod.stop(); }, tick(){} };
  },
  wind(g){
    const bp = filt('bandpass', 420, .9), amp = ac.createGain(); amp.gain.value = .9; bp.connect(amp).connect(g);
    const src = loopNoise('pink', bp), m1 = lfo(.05, 260, bp.frequency), m2 = lfo(.11, .45, amp.gain);
    return { stop(){ src.stop(); m1.stop(); m2.stop(); }, tick(){} };
  },
  waves(g){
    const lp = filt('lowpass', 700), amp = ac.createGain(); amp.gain.value = .5; lp.connect(amp).connect(g);
    const a = loopNoise('brown', lp), b = loopNoise('pink', lp);
    let next = 0;
    return { stop(){ a.stop(); b.stop(); }, tick(){
      const t = ac.currentTime; if (t < next) return;
      const len = 6 + Math.random() * 4; next = t + len;
      amp.gain.cancelScheduledValues(t); amp.gain.setValueAtTime(amp.gain.value, t);
      amp.gain.linearRampToValueAtTime(1.15, t + len * .38); amp.gain.linearRampToValueAtTime(.22, t + len);
      lp.frequency.cancelScheduledValues(t); lp.frequency.setValueAtTime(lp.frequency.value, t);
      lp.frequency.linearRampToValueAtTime(2200, t + len * .4); lp.frequency.linearRampToValueAtTime(420, t + len);
    } };
  },
  stream(g){
    const bp = filt('bandpass', 1800, .6), hp = filt('highpass', 300); bp.connect(hp).connect(g);
    const src = loopNoise('white', bp), m = lfo(3.1, 700, bp.frequency), m2 = lfo(.23, 400, bp.frequency);
    return { stop(){ src.stop(); m.stop(); m2.stop(); }, tick(){ if (Math.random() < .35) chirp(g, 600 + Math.random() * 900, 1400 + Math.random() * 900, .05, .05); } };
  },
  fire(g){
    const lp = filt('lowpass', 380), amp = ac.createGain(); amp.gain.value = .9; lp.connect(amp).connect(g);
    const src = loopNoise('brown', lp), m = lfo(.4, .25, amp.gain);
    return { stop(){ src.stop(); m.stop(); }, tick(){
      if (Math.random() < .55) burst(g, 'white', .012 + Math.random() * .03, .3 + Math.random() * .5, 1500 + Math.random() * 3000, 'highpass');
      if (Math.random() < .05) burst(g, 'brown', .25, .5, 220, 'lowpass', .02);
    } };
  },
  birds(g){
    let next = 0;
    return { stop(){}, tick(){
      const t = ac.currentTime; if (t < next) return; next = t + .6 + Math.random() * 2.4;
      const kind = Math.random(), base = 2400 + Math.random() * 1800, peak = .07 + Math.random() * .07;
      if (kind < .4){ for (let i = 0; i < 2 + (Math.random() * 4 | 0); i++) chirp(g, base, base * 1.35, .07, peak, i * .11); }
      else if (kind < .75){ chirp(g, base * 1.3, base * .8, .22, peak); chirp(g, base * .9, base * 1.25, .14, peak * .8, .26); }
      else { for (let i = 0; i < 6; i++) chirp(g, base * (1 + (i % 2) * .18), base * (1.1 + (i % 2) * .1), .045, peak * .8, i * .06); }
    } };
  },
  crickets(g){
    let next = 0;
    return { stop(){}, tick(){
      const t = ac.currentTime; if (t < next) return; next = t + .45 + Math.random() * .5;
      const f = 4300 + Math.random() * 500, pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      let dest = g; if (pan){ pan.pan.value = Math.random() * 1.6 - .8; pan.connect(g); dest = pan; }
      for (let i = 0; i < 3; i++){
        const s = t + i * .055, o = ac.createOscillator(), a = ac.createGain();
        o.frequency.value = f; a.gain.setValueAtTime(.0001, s); a.gain.linearRampToValueAtTime(.045, s + .008); a.gain.exponentialRampToValueAtTime(.0001, s + .04);
        o.connect(a).connect(dest); o.start(s); o.stop(s + .05);
      }
    } };
  },
  thunder(g){ return { stop(){}, tick(){} }; }   // driven by the shared lightning clock below
};
function rumble(){
  const ch = Amb.live.thunder; if (!ch) return;
  const t = ac.currentTime, len = 3 + Math.random() * 4;
  const s = ac.createBufferSource(), lp = filt('lowpass', 160 + Math.random() * 160), a = ac.createGain();
  s.buffer = noiseBufs().brown; s.connect(lp).connect(a).connect(ch.g);
  a.gain.setValueAtTime(.0001, t); a.gain.linearRampToValueAtTime(1.6, t + .15 + Math.random() * .3);
  for (let k = 1; k < 5; k++) a.gain.linearRampToValueAtTime(.4 + Math.random() * 1.1, t + len * k / 6);
  a.gain.exponentialRampToValueAtTime(.0001, t + len);
  lp.frequency.linearRampToValueAtTime(90, t + len);
  s.start(t, Math.random() * 2); s.stop(t + len + .1);
  if (Math.random() < .5) burst(ch.g, 'white', .35, .5, 900, 'lowpass', .01);
}
function ambApply(){
  if (!ac) return;
  const out = ambOut();
  SOUNDS.forEach(({ id }) => {
    const v = Amb.vol[id] / 100, live = Amb.live[id];
    if (v > 0 && !live){
      const g = ac.createGain(); g.gain.value = 0; g.connect(out);
      Amb.live[id] = { g, node: BUILD[id](g) };
      g.gain.setTargetAtTime(v, ac.currentTime, .4);
    } else if (v > 0){ live.g.gain.setTargetAtTime(v, ac.currentTime, .15); }
    else if (live){
      delete Amb.live[id]; live.g.gain.setTargetAtTime(0, ac.currentTime, .25);
      setTimeout(() => { try { live.node.stop(); live.g.disconnect(); } catch(e){} }, 1500);
    }
  });
}
setInterval(() => { if (!ac || ac.state !== 'running') return; Object.values(Amb.live).forEach(c => { try { c.node.tick(); } catch(e){} }); }, 120);
document.addEventListener('pointerdown', () => { const fresh = !ac; audioInit(); if (fresh || Object.keys(Amb.live).length === 0) ambApply(); }, true);
function followWeather(){
  if (!Amb.follow) return;
  const p = PRESETS[L.weather] || {};
  WEATHER_SOUNDS.forEach(id => Amb.vol[id] = p[id] || 0);
  ambSave(); ambApply(); renderMixer();
}

/* ----- lightning clock: flashes when the weather is stormy, thunder when the thunder sound is up ----- */
const Wx = { flash: 0, nextBolt: performance.now() + 4000, drops: [] };
setInterval(() => {
  const now = performance.now(), storm = L.weather === 'storm', thunder = Amb.vol.thunder > 0;
  if (!storm && !thunder){ Wx.nextBolt = now + 4000; return; }
  if (now < Wx.nextBolt) return;
  Wx.nextBolt = now + 9000 + Math.random() * 22000;
  if (storm) Wx.flash = now;
  if (thunder && ac) setTimeout(rumble, storm ? 400 + Math.random() * 1600 : 0);
}, 250);

/* ----- drawing (called from the room frame) ----- */
const isNightWx = () => L.weather === 'night' || L.weather === 'rain' || L.weather === 'storm';
const WINDOW_GLASS = [668, 14, 438, 220];
/* rain on the window when the daytime picture is showing (the night picture already has rain painted in) */
function drawWeatherFx(g, t){
  const w = L.weather; if (w !== 'drizzle' && !(w === 'rain' && Room.nightK < .5)) return;
  const [x, y, ww, hh] = WINDOW_GLASS, n = w === 'drizzle' ? 26 : 60, sp = w === 'drizzle' ? .25 : .5;
  g.save(); g.beginPath(); g.rect(x, y, ww, hh); g.clip();
  g.fillStyle = 'rgba(120,140,170,.18)'; g.fillRect(x, y, ww, hh);
  g.fillStyle = 'rgba(230,240,255,.55)';
  for (let i = 0; i < n; i++){ const sx = x + (i * 37.3) % ww, sy = y + (t * sp + i * 53) % (hh + 20) - 20; g.fillRect(Math.round(sx - (sy - y) * .12), Math.round(sy), 2, w === 'drizzle' ? 8 : 14); }
  g.restore();
}
const TINT = { sunset: ['#f6c79c', .9], drizzle: ['#cfd3dc', .7], storm: ['#9a92b0', .35] };
function drawRoomLight(g, t){
  const w = L.weather, tn = TINT[w];
  if (tn){ g.globalCompositeOperation = 'multiply'; g.globalAlpha = tn[1]; g.fillStyle = tn[0]; g.fillRect(0, 0, RW, RH); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  if (w === 'sunset'){ // low warm sun through the window
    g.globalCompositeOperation = 'screen'; const gr = g.createRadialGradient(890, 140, 20, 890, 300, 700);
    gr.addColorStop(0, 'rgba(255,170,90,.45)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, RW, RH); g.globalCompositeOperation = 'source-over';
  }
  if (w === 'storm'){ const f = performance.now() - Wx.flash; if (f < 260){ g.fillStyle = `rgba(230,240,255,${.4 * (1 - f / 260)})`; g.fillRect(0, 0, RW, RH); } }
}

/* ----- weather sync ----- */
function weatherName(id){ const w = WEATHERS.find(x => x.id === id); return w ? w.name : id; }
function applyWeather(w, by){
  if (!PRESETS[w] || w === L.weather) return;
  L.weather = w; renderWeather(); followWeather();
  if (by) toast(`${by} เปลี่ยนอากาศเป็น${weatherName(w)}`);
}
async function setWeather(w){
  if (w === L.weather) return;
  const prev = L.weather; applyWeather(w);
  if (S.chan) S.chan.send({ type: 'broadcast', event: 'weather', payload: { w, by: ME.name } }).catch(() => {});
  try { const { data, error } = await sb.rpc('set_weather', { p_w: w }); if (error || data !== true) throw 0; }
  catch(e){ toast('บันทึกสภาพอากาศไม่สำเร็จ เพื่อนที่อยู่ในห้องยังเห็นอยู่'); if (!S.chan) applyWeather(prev); }
}

/* ----- window sheet UI ----- */
function openWindowSheet(){ audioInit(); renderWeather(); renderMixer(); $('#weather').hidden = false; }
function renderWeather(){
  const box = $('#wxList'); if (!box.children.length){
    WEATHERS.forEach(w => { const b = document.createElement('button'); b.className = 'chip wx'; b.dataset.w = w.id; b.innerHTML = `<span class="wx-ic">${w.icon}</span><small>${w.name}</small>`; b.onclick = () => setWeather(w.id); box.appendChild(b); });
  }
  box.querySelectorAll('.wx').forEach(b => b.setAttribute('aria-pressed', b.dataset.w === L.weather));
}
function renderMixer(){
  const box = $('#mixList');
  if (!box.children.length){
    SOUNDS.forEach(s => {
      const row = document.createElement('label'); row.className = 'mix';
      row.innerHTML = `<span class="mix-ic">${s.icon}</span><span class="mix-name">${s.name}</span><input type="range" min="0" max="100" step="1" data-s="${s.id}" aria-label="ความดัง ${s.name}">`;
      const inp = row.querySelector('input');
      inp.addEventListener('input', () => {
        audioInit(); Amb.vol[s.id] = +inp.value;
        if (Amb.follow && WEATHER_SOUNDS.includes(s.id)){ Amb.follow = false; $('#mixFollow').checked = false; }
        row.classList.toggle('on', Amb.vol[s.id] > 0); ambSave(); ambApply();
      });
      box.appendChild(row);
    });
  }
  box.querySelectorAll('input').forEach(inp => { inp.value = Amb.vol[inp.dataset.s]; inp.closest('.mix').classList.toggle('on', Amb.vol[inp.dataset.s] > 0); });
  $('#mixMaster').value = Amb.master; $('#mixFollow').checked = Amb.follow;
}
$('#mixMaster').addEventListener('input', e => { audioInit(); Amb.master = +e.target.value; ambSave(); ambApply(); });
$('#mixFollow').addEventListener('change', e => { Amb.follow = e.target.checked; ambSave(); followWeather(); renderMixer(); });
$('#mixOff').onclick = () => { SOUNDS.forEach(s => Amb.vol[s.id] = 0); Amb.follow = false; ambSave(); ambApply(); renderMixer(); };
$('#wxClose').onclick = () => { $('#weather').hidden = true; };
$('#weather').addEventListener('click', e => { if (e.target.id === 'weather') $('#weather').hidden = true; });
$('#wxBtn').onclick = openWindowSheet;

/* ----- quick emoji ----- */
const EMOJI = ['❤️', '😂', '👏', '😮', '😭', '🎉', '👍', '🤔', '😴', '🧩'];
Room.emos = [];
function showEmoji(k, e){
  const now = Date.now();
  Room.emos.push({ k, e, t0: now, dx: Math.random() * 16 - 8 }); if (Room.emos.length > 30) Room.emos.shift();
  if (document.body.matches('.puzzle-open,.draw-open')){
    const el = document.createElement('div'); el.className = 'emo-float'; el.textContent = e;
    const a = k === ME.id ? Room.me : Room.others.get(k), who = document.createElement('small');
    who.textContent = k === ME.id ? ME.name : (a && a.name) || 'เพื่อน'; el.appendChild(who);
    el.style.left = (12 + Math.random() * 40) + 'px';
    $('#emoLayer').appendChild(el); setTimeout(() => el.remove(), 2600);
  }
}
function drawEmojis(g){
  const now = Date.now(); Room.emos = Room.emos.filter(m => now - m.t0 < 2400);
  if (!Room.emos.length) return;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '26px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  const counts = new Map();
  Room.emos.forEach(m => {
    const a = m.k === ME.id ? Room.me : Room.others.get(m.k); if (!a) return;
    const p = (now - m.t0) / 2400, n = counts.get(m.k) || 0; counts.set(m.k, n + 1);
    const sx = Room.ox + a.x * Room.s + m.dx + Math.sin(p * 9) * 4, sy = Room.oy + (a.y - (a.sit ? 30 : 35) * SC) * Room.s - 40 - p * 70;
    g.globalAlpha = p < .15 ? p / .15 : Math.min(1, (1 - p) / .35);
    const sc = p < .12 ? .6 + p / .12 * .5 : 1.1 - Math.min(.1, (p - .12));
    g.save(); g.translate(sx, sy); g.scale(sc, sc); g.fillText(m.e, 0, 0); g.restore();
  });
  g.globalAlpha = 1;
}
let emoLast = 0;
function sendEmoji(e){
  const now = Date.now(); if (now - emoLast < 250 || !Room.me) return; emoLast = now;
  showEmoji(ME.id, e);
  if (S.chan) S.chan.send({ type: 'broadcast', event: 'emo', payload: { k: ME.id, e } }).catch(() => {});
}
function onEmoji(m){ if (!m || m.k === ME.id || !EMOJI.includes(m.e)) return; showEmoji(m.k, m.e); tone(1320, 0, .05, 'sine', .03); }
(() => {
  const bar = $('#emoBar');
  EMOJI.forEach(e => { const b = document.createElement('button'); b.type = 'button'; b.className = 'emo-b'; b.textContent = e; b.setAttribute('aria-label', 'ส่ง ' + e); b.onclick = () => sendEmoji(e); bar.appendChild(b); });
  $('#emoBtn').onclick = () => { const open = bar.hidden; bar.hidden = !open; $('#emoBtn').setAttribute('aria-pressed', open); };
  document.addEventListener('pointerdown', e => { if (!bar.hidden && !bar.contains(e.target) && !$('#emoBtn').contains(e.target)){ bar.hidden = true; $('#emoBtn').setAttribute('aria-pressed', false); } });
})();
