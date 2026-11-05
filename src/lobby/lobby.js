/* ---------- chat ---------- */
const Chat = { list: [] };
function addMsg(m, fresh){
  if (Chat.list.some(x => x.id && x.id === m.id && m.id)) return;
  Chat.list.push(m); if (Chat.list.length > 80) Chat.list.shift();
  const el = document.createElement('div'); el.className = 'msg';
  const b = document.createElement('b'); b.textContent = m.name || 'เพื่อน'; b.style.color = m.color || '#3b2b20';
  const t = document.createElement('time'); const d = new Date(m.at || Date.now()); t.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  el.append(b, ' ', document.createTextNode(m.body), t);
  const box = $('#chatlogIn'); const empty = box.querySelector('.empty'); if (empty) empty.remove();
  box.appendChild(el); while (box.children.length > 80) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (!fresh) return;
  const a = m.k === ME.id ? Room.me : Room.others.get(m.k);
  if (a) a.bubble = { text: m.body, until: Date.now() + 7000 };
  if (document.body.matches('.puzzle-open,.draw-open') || !a) ticker(m);
  if (m.k !== ME.id) tone(880, 0, .06, 'sine', .05);
}
function ticker(m){
  if (!$('#chatlog').hidden) return;
  const tk = document.createElement('div'); tk.className = 'tk';
  const b = document.createElement('b'); b.textContent = (m.name || 'เพื่อน') + ' '; b.style.color = m.color || '';
  tk.append(b, document.createTextNode(m.body));
  const box = $('#ticker'); box.appendChild(tk); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { tk.classList.add('out'); setTimeout(() => tk.remove(), 450); }, 6000);
}
$('#chatForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = $('#chatIn').value.trim(); if (!body || !Room.me) return;
  $('#chatIn').value = '';
  const m = { k: ME.id, name: ME.name, color: ME.color, body: body.slice(0, 200), at: Date.now() };
  addMsg(m, true);
  if (S.chan) S.chan.send({ type: 'broadcast', event: 'chat', payload: m }).catch(() => {});
  try { const { error } = await sb.rpc('send_message', { p_author: ME.id, p_name: ME.name, p_color: ME.color, p_body: m.body }); if (error) throw error; } catch(err){ toast('บันทึกข้อความไม่สำเร็จ แต่เพื่อนที่อยู่ในห้องยังเห็นอยู่'); }
});
$('#logBtn').onclick = () => {
  const open = $('#chatlog').hidden; $('#chatlog').hidden = !open; $('#logBtn').setAttribute('aria-pressed', open);
  if (open){ $('#ticker').innerHTML = ''; const box = $('#chatlogIn'); if (!box.children.length) box.innerHTML = '<div class="empty">ยังไม่มีข้อความ ทักเพื่อนได้เลย</div>'; box.scrollTop = box.scrollHeight; }
};
async function loadHistory(){
  try {
    const { data } = await sb.from('messages').select('id,author,name,color,body,created_at').eq('lobby', 'main').order('id', { ascending: false }).limit(40);
    (data || []).reverse().forEach(r => addMsg({ id: r.id, k: r.author, name: r.name, color: r.color, body: r.body, at: Date.parse(r.created_at) }, false));
  } catch(e){}
}

/* ---------- radio ---------- */
const Radio = {
  st: {}, player: null, ready: false, apiLoading: false, muted: true, small: LS.get('jt-mini-small', false), folded: LS.get('jt-mini-fold', false), vol: LS.get('jt-vol', 80), lastLoaded: null,
  isPlaying(){ return !!(this.st.vid && this.st.playing); },
  canControl(){ return L.mode === 'all' || L.isOwner; },
  expected(){ const s = this.st; if (!s.vid) return 0; return s.playing ? (s.pos || 0) + Math.max(0, serverNow() - (s.at || 0)) / 1000 : (s.pos || 0); },
  loadApi(){
    if (this.apiLoading) return; this.apiLoading = true;
    window.onYouTubeIframeAPIReady = () => this.create();
    const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc);
  },
  create(){
    this.player = new YT.Player('ytHost', { width: 200, height: 113, playerVars: { controls: 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, fs: 0, origin: location.origin },
      events: { onReady: () => { this.ready = true; this.player.setVolume(this.vol); this.player.mute(); this.sync(true); },
                onStateChange: e => this.onState(e.data), onError: e => this.onError(e.data) } });
  },
  onError(code){
    const msg = (code === 101 || code === 150) ? 'คลิปนี้ไม่อนุญาตให้เปิดในเว็บอื่น ลองคลิปอื่นแทน' : 'เปิดคลิปนี้ไม่ได้';
    toast(msg); $('#rdErr').textContent = msg;
  },
  onState(s){
    if (s === 0 && this.st.vid && this.st.playing){ // ended: the first player in the list moves the queue along
      const leader = [...S.players.map(p => p.key)].sort()[0] || ME.id;
      if (leader === ME.id) this.next(this.st.vid);
    }
    this.render();
  },
  apply(st){
    const prevVid = this.st.vid;
    this.st = st && typeof st === 'object' ? st : {};
    if (this.st.vid && !this.player) this.loadApi();
    if (this.st.vid && this.st.vid !== prevVid) $('#rdErr').textContent = '';
    this.sync(false); this.render();
  },
  sync(force){
    const s = this.st;
    $('#mini').hidden = !s.vid;
    if (!this.ready || !s.vid) { if (this.ready && !s.vid) try { this.player.stopVideo(); } catch(e){} return; }
    const p = this.player, want = this.expected();
    let cur = null; try { cur = p.getVideoData && p.getVideoData().video_id; } catch(e){}
    if (cur !== s.vid || this.lastLoaded !== s.vid){
      this.lastLoaded = s.vid;
      if (s.playing) p.loadVideoById({ videoId: s.vid, startSeconds: want }); else p.cueVideoById({ videoId: s.vid, startSeconds: want });
      return;
    }
    const state = p.getPlayerState(), t = p.getCurrentTime();
    if (s.playing){
      if (force || Math.abs(t - want) > 3) p.seekTo(want, true);
      if (state !== 1 && state !== 3) p.playVideo();
    } else {
      if (state === 1 || state === 3) p.pauseVideo();
      if (force || Math.abs(t - want) > 2) p.seekTo(want, true);
    }
  },
  userGesture(){ // called from taps so iOS lets sound play
    if (!this.ready) return;
    try { if (this.muted){ this.player.unMute(); this.player.setVolume(this.vol); this.muted = false; } if (this.st.playing) this.player.playVideo(); } catch(e){}
    this.render();
  },
  title(){ return this.st.title || (this.player && this.ready && this.player.getVideoData && this.player.getVideoData().title) || 'กำลังโหลดรายการ…'; },
  render(){
    const s = this.st;
    $('#unmuteBtn').hidden = !(s.vid && this.muted);
    $('#miniTitle').textContent = s.vid ? this.title() : '';
    $('#miniPlay').innerHTML = s.playing ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    $('#mini').classList.toggle('small', this.small);
    $('#mini').classList.toggle('folded', this.folded); $('#mini').classList.toggle('on', !!s.playing);
    $('#rdNow').textContent = s.vid ? (s.playing ? 'กำลังเล่น: ' : 'หยุดไว้: ') + this.title() : 'ยังไม่มีรายการ วางลิงก์ YouTube ด้านล่างได้เลย';
    $('#rdControls').hidden = !s.vid; $('#rdSeek').hidden = !s.vid;
    $('#rdPlay').textContent = s.playing ? 'หยุด' : 'เล่น';
    $('#rdNext').disabled = !(s.queue && s.queue.length);
    const q = $('#rdQueue'); q.innerHTML = '';
    (s.queue || []).forEach((it, i) => {
      const li = document.createElement('li'), sp = document.createElement('span'); sp.textContent = it.title || it.vid;
      li.appendChild(sp);
      if (this.canControl()){ const x = document.createElement('button'); x.textContent = 'ลบ'; x.onclick = () => { const nq = (s.queue || []).filter((_, j) => j !== i); this.set({ ...s, queue: nq }); }; li.appendChild(x); }
      q.appendChild(li);
    });
    const ctl = this.canControl();
    ['#rdPlay', '#rdNext', '#rdPlayNow', '#rdQueueAdd', '#rdSeek', '#rdUrl', '#miniPlay'].forEach(sel => { $(sel).disabled = !ctl || (sel === '#rdNext' && !(s.queue && s.queue.length)); });
    $('#rdMode').textContent = L.mode === 'owner' ? (L.isOwner ? 'ตอนนี้ตั้งไว้ให้เฉพาะเจ้าของบ้านเปลี่ยนวิทยุได้ (คุณคือเจ้าของบ้าน)' : 'ตอนนี้เจ้าของบ้านตั้งไว้ให้เฉพาะเจ้าของบ้านเปลี่ยนวิทยุได้') : 'ทุกคนในห้องเปลี่ยนวิทยุได้';
  },
  tick(){
    if (!this.st.vid) return;
    const dur = (this.ready && this.player.getDuration && this.player.getDuration()) || 0, t = this.expected();
    $('#rdTime').textContent = `${fmtClock(t)} / ${dur ? fmtClock(dur) : '–'}`;
    if (!Radio.seeking && dur) $('#rdSeek').value = Math.round(Math.min(1, t / dur) * 1000);
    if (!this.st.title && this.ready){ try { const tt = this.player.getVideoData().title; if (tt){ $('#miniTitle').textContent = tt; } } catch(e){} }
  },
  async set(st){
    if (!this.canControl()){ toast('ตอนนี้เฉพาะเจ้าของบ้านที่เปลี่ยนวิทยุได้'); return false; }
    st = { ...st, by: ME.name };
    const prev = this.st; this.apply(st);
    try {
      const { data, error } = await sb.rpc('set_radio', { p_radio: st, p_pin: L.pin });
      if (error || data !== true) throw error || new Error('denied');
      if (S.chan) S.chan.send({ type: 'broadcast', event: 'radio', payload: st }).catch(() => {});
      return true;
    } catch(e){ this.apply(prev); toast('เปลี่ยนวิทยุไม่สำเร็จ'); refreshLobby(); return false; }
  },
  play(vid, title){ this.set({ vid, title: title || '', playing: true, pos: 0, at: serverNow(), queue: this.st.queue || [] }); this.userGesture(); },
  toggle(){ const s = this.st; if (!s.vid) return; this.set({ ...s, playing: !s.playing, pos: this.expected(), at: serverNow() }); this.userGesture(); },
  seek(sec){ const s = this.st; if (!s.vid) return; this.set({ ...s, pos: Math.max(0, sec), at: serverNow() }); },
  next(fromVid){
    const s = this.st; if (fromVid && s.vid !== fromVid) return;
    const q = [...(s.queue || [])], it = q.shift();
    if (!it){ this.set({ ...s, playing: false, pos: 0, at: serverNow() }); return; }
    this.set({ vid: it.vid, title: it.title || '', playing: true, pos: 0, at: serverNow(), queue: q });
  },
  openPanel(){ this.render(); $('#radio').hidden = false; this.userGesture(); }
};
function parseYouTube(u){
  u = (u || '').trim();
  if (/^[\w-]{11}$/.test(u)) return u;
  const m = u.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|live|shorts|v)\/)([\w-]{11})/);
  return m ? m[1] : null;
}
async function fetchTitle(vid){
  try { const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + vid)); const j = await r.json(); return (j && j.title) || ''; } catch(e){ return ''; }
}
$('#rdPlayNow').onclick = async () => {
  const vid = parseYouTube($('#rdUrl').value); $('#rdErr').textContent = '';
  if (!vid){ $('#rdErr').textContent = 'ลิงก์นี้ไม่ใช่ลิงก์ YouTube ลองคัดลอกลิงก์จากปุ่มแชร์ของ YouTube'; return; }
  $('#rdUrl').value = ''; Radio.play(vid, ''); const t = await fetchTitle(vid); if (t && Radio.st.vid === vid && !Radio.st.title) Radio.set({ ...Radio.st, title: t, pos: Radio.expected(), at: serverNow() });
};
$('#rdQueueAdd').onclick = async () => {
  const vid = parseYouTube($('#rdUrl').value); $('#rdErr').textContent = '';
  if (!vid){ $('#rdErr').textContent = 'ลิงก์นี้ไม่ใช่ลิงก์ YouTube ลองคัดลอกลิงก์จากปุ่มแชร์ของ YouTube'; return; }
  $('#rdUrl').value = '';
  const title = await fetchTitle(vid);
  if (!Radio.st.vid){ Radio.play(vid, title); return; }
  Radio.set({ ...Radio.st, pos: Radio.expected(), at: serverNow(), queue: [...(Radio.st.queue || []), { vid, title }].slice(0, 30) });
  toast('เพิ่มเข้าคิวแล้ว');
};
$('#rdPlay').onclick = () => Radio.toggle();
$('#miniPlay').onclick = () => Radio.toggle();
$('#rdNext').onclick = () => Radio.next();
$('#miniOpen').onclick = () => Radio.openPanel();
$('#miniFold').onclick = $('#miniFab').onclick = () => { Radio.folded = !Radio.folded; LS.set('jt-mini-fold', Radio.folded); Radio.render(); };
$('#miniSize').onclick = () => { Radio.small = !Radio.small; LS.set('jt-mini-small', Radio.small); Radio.render(); };
$('#unmuteBtn').onclick = () => Radio.userGesture();
$('#rdClose').onclick = () => { $('#radio').hidden = true; };
$('#radio').addEventListener('click', e => { if (e.target.id === 'radio') $('#radio').hidden = true; });
$('#rdSeek').addEventListener('input', () => { Radio.seeking = true; });
$('#rdSeek').addEventListener('change', () => { Radio.seeking = false; const dur = Radio.ready ? Radio.player.getDuration() : 0; if (dur) Radio.seek($('#rdSeek').value / 1000 * dur); });
$('#rdVol').value = Radio.vol;
$('#rdVol').addEventListener('input', e => { Radio.vol = +e.target.value; LS.set('jt-vol', Radio.vol); if (Radio.ready){ Radio.player.setVolume(Radio.vol); if (Radio.muted) Radio.userGesture(); } });
setInterval(() => { Radio.tick(); if (Radio.st.vid) Radio.sync(false); }, 1000);
document.addEventListener('pointerdown', () => { if (Radio.muted && Radio.ready && Radio.st.vid) Radio.userGesture(); }, true);

/* ---------- lobby state ---------- */
async function refreshLobby(){
  try {
    const t0 = Date.now(); const { data, error } = await sb.rpc('get_lobby'); const t1 = Date.now();
    if (error || !data) return;
    L.offset = data.now - (t0 + t1) / 2;
    L.mode = data.radio_mode; L.hasOwner = data.has_owner;
    if (JSON.stringify(data.radio || {}) !== JSON.stringify(Radio.st)) Radio.apply(data.radio || {});
    if (data.puzzle !== L.puzzle) setPuzzle(data.puzzle, false);
    L.puzzleInfo = data.puzzle_info;
    if (data.weather && data.weather !== L.weather) applyWeather(data.weather);
    Radio.render(); renderSettings();
  } catch(e){}
}
setInterval(() => { if (Room.me && !document.hidden) refreshLobby(); }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Room.me){ refreshLobby(); if (!$('#game').hidden) refetch(); } });

/* ---------- puzzle on the table ---------- */
async function setPuzzle(code, announce, by){
  L.puzzle = code;
  if (!code){ Room.tableImg = null; return; }
  try {
    const { data } = await sb.rpc('open_room', { p_code: code, p_pass: null });
    if (!data || data.status !== 'ok' || L.puzzle !== code) return;
    const cv = await loadCanvas(data.room.image);
    Room.tableImg = cv;
    startGame(data.room, cv, data.pieces);
    if (announce) toast(`${by || 'เพื่อน'} วางรูปใหม่บนโต๊ะแล้ว`);
  } catch(e){ toast('โหลดจิ๊กซอว์บนโต๊ะไม่สำเร็จ'); }
}
const loadCanvas = url => new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); res(c); }; img.onerror = rej; img.src = url; });
function tableTapped(){
  if (!L.puzzle || !S.game || S.code !== L.puzzle){ if (!L.puzzle) openSetup(); else toast('กำลังโหลดจิ๊กซอว์…'); return; }
  openPuzzle();
}
function openPuzzle(){
  $('#game').hidden = false; document.body.classList.add('puzzle-open');
  relayout(); refetch();
}
function closePuzzle(){ if (drag) cancelDrag(false); pend = null; $('#game').hidden = true; document.body.classList.remove('puzzle-open'); }
$('#backBtn').onclick = closePuzzle;
$('#againBtn').onclick = () => openSetup();
$('#viewBtn').onclick = () => { $('#done').hidden = true; };
$('#newPuzzleBtn').onclick = () => openSetup();

/* new puzzle sheet */
const pick = { src: null, count: 48, cols: 0, rows: 0, E: null };
const prev = $('#prev');
function refreshPick(){
  const ar = pick.src.width / pick.src.height;
  [pick.cols, pick.rows] = gridFor(pick.count, ar);
  pick.E = makeEdges(pick.cols, pick.rows);
  renderChips(); drawPreview();
  const n = pick.cols * pick.rows;
  $('#gridHint').textContent = `รูปนี้จะได้ ${pick.cols} × ${pick.rows} = ${n} ชิ้น` + (n !== pick.count ? ` (ปรับจาก ${pick.count} ให้ชิ้นออกมาเป็นสี่เหลี่ยมพอดีรูป)` : '');
  $('#startBtn').textContent = `วางบนโต๊ะ · ${n} ชิ้น`;
}
function renderChips(){
  const ar = pick.src.width / pick.src.height, box = $('#counts'); box.innerHTML = '';
  COUNTS.forEach(n => {
    const [c, r] = gridFor(n, ar), b = document.createElement('button');
    b.className = 'chip'; b.setAttribute('aria-pressed', n === pick.count);
    b.innerHTML = `<b>${c * r}</b><small>${c} × ${r}</small>`;
    b.onclick = () => { pick.count = n; $('#customN').value = ''; refreshPick(); };
    box.appendChild(b);
  });
}
$('#customN').addEventListener('input', e => {
  const n = parseInt(e.target.value, 10);
  if (!n || n < 4){ $('#gridHint').textContent = 'ใส่อย่างน้อย 4 ชิ้น'; return; }
  pick.count = Math.min(MAXN, n); if (n > MAXN) e.target.value = MAXN;
  refreshPick();
});
function drawPreview(){
  if (!pick.src || $('#setup').hidden) return;
  const wrap = $('#prevWrap'), maxW = Math.max(200, wrap.clientWidth - 16), maxH = Math.min(380, window.innerHeight * .4);
  const ar = pick.src.width / pick.src.height;
  let w = maxW, h = w / ar; if (h > maxH){ h = maxH; w = h * ar; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  prev.width = Math.round(w * dpr); prev.height = Math.round(h * dpr); prev.style.width = w + 'px'; prev.style.height = h + 'px';
  const g = prev.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(pick.src, 0, 0, w, h);
  const cw = w / pick.cols, ch = h / pick.rows, E = pick.E;
  const strokeAll = () => {
    for (let r = 1; r < pick.rows; r++) for (let c = 0; c < pick.cols; c++){ const p = edgePts(E, 'h', r, c, cw, ch); g.beginPath(); g.moveTo(p[0][0], p[0][1]); trace(g, p, false); g.stroke(); }
    for (let r = 0; r < pick.rows; r++) for (let c = 1; c < pick.cols; c++){ const p = edgePts(E, 'v', r, c, cw, ch); g.beginPath(); g.moveTo(p[0][0], p[0][1]); trace(g, p, false); g.stroke(); }
  };
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,20,10,.35)'; g.lineWidth = 3; strokeAll();
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 1.3; strokeAll();
}
$('#file').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { pick.src = toSrc(img); URL.revokeObjectURL(url); refreshPick(); };
  img.onerror = () => { URL.revokeObjectURL(url); $('#setupErr').textContent = 'เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น'; };
  img.src = url;
});
$('#sampleBtn').onclick = () => { pick.src = paintSample(); refreshPick(); };
function openSetup(){
  const unfinished = S.game && S.code === L.puzzle && !allPlaced();
  const placed = S.pieces.filter(p => p.srv.state === 'placed').length;
  $('#setupWarn').hidden = !unfinished;
  if (unfinished) $('#setupWarn').textContent = `รูปบนโต๊ะตอนนี้ยังต่อไม่เสร็จ (${placed} / ${S.pieces.length} ชิ้น) ถ้าวางรูปใหม่ รูปเดิมจะถูกเก็บไป`;
  $('#setupErr').textContent = ''; $('#setup').hidden = false;
  if (!pick.src){ pick.src = paintSample(); refreshPick(); } else drawPreview();
}
$('#setupCancel').onclick = () => { $('#setup').hidden = true; };
function compress(src){
  const m = Math.min(1, 1400 / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * m); c.height = Math.round(src.height * m);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/jpeg', .82);
  if (url.length > 3500000) url = c.toDataURL('image/jpeg', .6);
  return { canvas: c, url };
}
function thumbOf(canvas, size, q){ const t = document.createElement('canvas'), k = size / Math.max(canvas.width, canvas.height); t.width = Math.round(canvas.width * k); t.height = Math.round(canvas.height * k); t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', q); }
$('#startBtn').onclick = async () => {
  audioInit(); $('#setupErr').textContent = '';
  busy('กำลังวางรูปบนโต๊ะ…');
  const up = compress(pick.src);
  try {
    const { data: code, error } = await sb.rpc('create_room', { p_image: up.url, p_thumb: thumbOf(up.canvas, 240, .7), p_cols: pick.cols, p_rows: pick.rows, p_edges: pick.E,
      p_rotate: $('#rotOpt').checked, p_name: 'ห้องนั่งเล่น', p_host: ME.name, p_pass: null });
    if (error || !code) throw error || new Error('no code');
    const { data: ok, error: e2 } = await sb.rpc('set_puzzle', { p_code: code });
    if (e2 || ok !== true) throw e2 || new Error('set failed');
    if (S.chan) S.chan.send({ type: 'broadcast', event: 'puzzle', payload: { code, by: ME.name } }).catch(() => {});
    await setPuzzle(code, false);
    busy(); $('#setup').hidden = true; openPuzzle();
  } catch(e){ busy(); $('#setupErr').textContent = 'วางรูปไม่สำเร็จ ลองเช็กอินเทอร์เน็ตแล้วกดใหม่'; }
};

/* ---------- settings ---------- */
function renderSettings(){
  const ul = $('#plist'); ul.innerHTML = '';
  S.players.forEach(pl => { const li = document.createElement('li'), i = document.createElement('i'); i.style.background = pl.color; li.append(i, (pl.name || 'เพื่อน') + (pl.me ? ' (คุณ)' : '')); ul.appendChild(li); });
  $('#ownerInfo').textContent = L.isOwner ? 'คุณคือเจ้าของบ้าน ตั้งได้ว่าใครเปลี่ยนวิทยุได้' : L.hasOwner ? 'ถ้าคุณเป็นเจ้าของบ้าน ใส่ PIN เพื่อยืนยัน' : 'ยังไม่มีเจ้าของบ้าน ตั้ง PIN เพื่อเป็นเจ้าของบ้าน (เก็บ PIN ไว้ ใช้ยืนยันบนเครื่องอื่น)';
  $('#ownerRow').hidden = L.isOwner;
  $('#ownerBtn').textContent = L.hasOwner ? 'ยืนยัน' : 'ตั้งเป็นเจ้าของบ้าน';
  $('#modeRow').hidden = !L.isOwner;
  $('#modeAll').setAttribute('aria-pressed', L.mode === 'all'); $('#modeOwner').setAttribute('aria-pressed', L.mode === 'owner');
}
$('#settingsBtn').onclick = () => { $('#stErr').textContent = ''; renderSettings(); $('#settings').hidden = false; };
$('#stClose').onclick = () => { $('#settings').hidden = true; };
$('#settings').addEventListener('click', e => { if (e.target.id === 'settings') $('#settings').hidden = true; });
$('#stProfile').onclick = () => { $('#settings').hidden = true; buildEnter(); $('#enterBtn').textContent = 'บันทึก'; $('#enter').hidden = false; };
$('#ownerBtn').onclick = async () => {
  const pin = $('#ownerPin').value.trim(); $('#stErr').textContent = '';
  if (pin.length < 4){ $('#stErr').textContent = 'PIN ต้องมีอย่างน้อย 4 ตัว'; return; }
  try {
    if (!L.hasOwner){ const { data } = await sb.rpc('claim_owner', { p_pin: pin }); if (data !== true){ $('#stErr').textContent = 'มีคนตั้งเจ้าของบ้านไปก่อนแล้ว ลองใส่ PIN ยืนยันแทน'; L.hasOwner = true; renderSettings(); return; } }
    const { data: ok } = await sb.rpc('check_owner', { p_pin: pin });
    if (ok !== true){ $('#stErr').textContent = 'PIN ไม่ถูกต้อง'; return; }
    L.pin = pin; L.isOwner = true; L.hasOwner = true; LS.set('jt-owner-pin', pin); $('#ownerPin').value = '';
    renderSettings(); Radio.render(); toast('ยืนยันเจ้าของบ้านแล้ว');
  } catch(e){ $('#stErr').textContent = 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'; }
};
async function setMode(m){
  try { const { data } = await sb.rpc('set_radio_mode', { p_mode: m, p_pin: L.pin }); if (data !== true) throw 0;
    L.mode = m; renderSettings(); Radio.render(); if (S.chan) S.chan.send({ type: 'broadcast', event: 'mode', payload: { mode: m } }).catch(() => {}); }
  catch(e){ $('#stErr').textContent = 'เปลี่ยนไม่สำเร็จ ลองใหม่อีกครั้ง'; }
}
$('#modeAll').onclick = () => setMode('all');
$('#modeOwner').onclick = () => setMode('owner');

/* ---------- players ---------- */
function syncPresence(){
  if (!S.chan) return;
  const st = S.chan.presenceState(), players = [];
  for (const [key, metas] of Object.entries(st)){
    const m = metas[metas.length - 1] || {};
    players.push({ key, name: m.name, color: m.color || colorOf(key), me: key === ME.id });
  }
  if (!players.some(p => p.me)) players.unshift({ key: ME.id, name: ME.name, color: ME.color, me: true });
  S.players = players.sort((a, b) => (b.me - a.me)); renderPlayers(); renderSettings();
  const here = new Set(players.map(p => p.key));
  Room.others.forEach((a, k) => { if (!here.has(k) && Date.now() - a.seen > 5000) Room.others.delete(k); });
  S.pieces.forEach(p => { if (p.holder && !here.has(p.holder.key)){ p.holder = null; p.rpos = null; show(p); } });
}
function renderPlayers(){
  const box = $('#players'); box.innerHTML = '';
  const list = S.players, max = 4;
  list.slice(0, max).forEach(pl => { const d = document.createElement('div'); d.className = 'av'; d.style.background = pl.color; d.textContent = [...(pl.name || '?')][0]; d.title = (pl.name || 'เพื่อน') + (pl.me ? ' (คุณ)' : ''); box.appendChild(d); });
  if (list.length > max){ const d = document.createElement('div'); d.className = 'av more'; d.textContent = '+' + (list.length - max); box.appendChild(d); }
}

/* ---------- realtime channel (one for the whole living room) ---------- */
let joinTimer = 0, retry = 0;
function connect(){
  disconnect();
  const ch = sb.channel('lobby:main', { config: { presence: { key: ME.id }, broadcast: { self: false } } });
  S.chan = ch;
  const mine = fn => p => { if (S.chan === ch) fn(p.payload); };
  ch.on('broadcast', { event: 'pos' }, mine(onPos))
    .on('broadcast', { event: 'chat' }, mine(m => addMsg(m, true)))
    .on('broadcast', { event: 'radio' }, mine(st => Radio.apply(st)))
    .on('broadcast', { event: 'mode' }, mine(m => { L.mode = m.mode; Radio.render(); renderSettings(); }))
    .on('broadcast', { event: 'puzzle' }, mine(m => { if (m.code !== L.puzzle){ const open = !$('#game').hidden; setPuzzle(m.code, true, m.by).then(() => { if (open) openPuzzle(); }); } }))
    .on('broadcast', { event: 'weather' }, mine(m => applyWeather(m.w, m.by)))
    .on('broadcast', { event: 'emo' }, mine(onEmoji))
    .on('broadcast', { event: 'bd' }, mine(onBoard))
    .on('broadcast', { event: 'drag' }, mine(onDrag))
    .on('broadcast', { event: 'release' }, mine(onRelease))
    .on('presence', { event: 'sync' }, () => { if (S.chan === ch) syncPresence(); })
    .subscribe((status, err) => {
      if (err) console.warn('realtime', status, err);
      if (S.chan !== ch) return;
      if (status === 'SUBSCRIBED'){
        S.connected = true; retry = 0; clearTimeout(joinTimer); $('#conn').hidden = true;
        ch.track({ name: ME.name, color: ME.color }).catch(() => {});
        sendPos(true); refreshLobby(); if (!$('#game').hidden) refetch(); if (Board.open) loadBoard();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){
        S.connected = false; $('#conn').hidden = false; scheduleReconnect();
      }
    });
  clearTimeout(joinTimer); joinTimer = setTimeout(() => { if (S.chan === ch && !S.connected){ $('#conn').hidden = false; scheduleReconnect(); } }, 12000);
}
function scheduleReconnect(){
  clearTimeout(joinTimer);
  const wait = Math.min(30000, 3000 * 2 ** retry++);
  joinTimer = setTimeout(() => { if (!S.connected) connect(); }, wait);
}
function disconnect(){ if (S.chan){ const c = S.chan; S.chan = null; S.connected = false; try { sb.removeChannel(c); } catch(e){} } }

/* ---------- start ---------- */
async function enterLobby(){
  const [sx, sy] = SPAWN;
  Room.me = makeAvatar(ME.id, ME.name, ME.color, ME.hair, sx * T + 6 + (Math.random() * 3 - 1 | 0) * T, sy * T + 11);
  Room.me.dir = 1;
  S.players = [{ key: ME.id, name: ME.name, color: ME.color, me: true }]; renderPlayers();
  if (L.pin){ try { const { data } = await sb.rpc('check_owner', { p_pin: L.pin }); L.isOwner = data === true; if (!L.isOwner){ L.pin = null; LS.set('jt-owner-pin', null); } } catch(e){} }
  followWeather(); connect(); refreshLobby(); loadHistory(); loadBoard();
  setTimeout(() => $('#hint').classList.add('fade'), 9000);
}
window.addEventListener('resize', () => { clearTimeout(window.__rt); window.__rt = setTimeout(() => { if (!$('#game').hidden){ layout(); S.pieces.forEach(p => { if (p.where !== 'drag') sizeFor(p); posTag(p); }); } drawPreview(); }, 120); });
paintRoom(); buildEnter(); requestAnimationFrame(frame);
if (ME.name) $('#enterBtn').focus();
