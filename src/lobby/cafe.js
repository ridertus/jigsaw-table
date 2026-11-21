/* ---------- ร้านเครื่องดื่ม (Cafe) ----------
   ร้านเดียวที่ทุกคนช่วยกันทำ: เปิดร้าน → ลูกค้ามาที่หน้าต่าง → ทำเครื่องดื่ม (ส่วนผสม/ปั่น/ท็อปปิ้ง) → เสิร์ฟได้แต้ม
   ปิดร้านแล้วเอาแต้มไปซื้อส่วนผสม เครื่องปั่น และอัปเกรด, ไม่มีใครเปิดหน้าร้านเกิน 90 วิ ร้านปิดเอง
   RPC cafe_* (supabase/cafe.sql), broadcast event `cafe` บน lobby:main (ต่อใน lobby.js), ใช้ตัวช่วย dg* จาก draw-guess.js */
const CF_INFO = {
  thai: ['ชาไทย', '#e8853c'], green: ['ชาเขียว', '#8fc25e'], milk: ['นมสด', '#f6f1e4'], coffee: ['กาแฟ', '#8a5532'],
  cocoa: ['โกโก้', '#6e3b27'], lemon: ['น้ำมะนาว', '#f2df62'], pink: ['นมชมพู', '#f4a3bd'], peach: ['ชาพีช', '#f6b27c'],
  sugar: ['น้ำเชื่อม', '#f4ecc8'], condensed: ['นมข้น', '#f3e1ad'], honey: ['น้ำผึ้ง', '#f0b43c'], caramel: ['คาราเมล', '#c77a35'], vanilla: ['วานิลลา', '#f5e7b8'],
  pearl: ['ไข่มุก', '#3a2418'], whip: ['วิปครีม', '#ffffff'], jelly: ['บุก', '#b9e3a3'], sprinkle: ['สปริงเคิล', '#f27aa8'], choc: ['ช็อกชิพ', '#4a2a1a'], cheese: ['ชีสโฟม', '#ffe9a8'],
  ice: ['น้ำแข็ง', '#d8f0ff'], blender: ['เครื่องปั่น', '#8fb8d8'],
  sign: ['ป้ายร้าน', '#e8954a', 'ลูกค้ามาถี่ขึ้น'], bench: ['ม้านั่งรอ', '#8b5a34', 'ลูกค้ารอนานขึ้น 15 วิ'], jar: ['โหลทิป', '#9fd0c8', 'ทิปเพิ่ม 10%']
};
const CF_NAMES = ['น้องมิว', 'ป้าแดง', 'ลุงชัย', 'ต้นกล้า', 'ใบเตย', 'พี่หมี', 'แพรว', 'ข้าวหอม', 'ก้อง', 'ฟ้าใส', 'โบ๊ท', 'มะปราง', 'ส้มโอ', 'บัว', 'ปอนด์', 'ตาล', 'ชมพู่', 'น้ำหวาน', 'ภูมิ', 'เมฆ', 'ขนุน', 'ไข่ตุ๋น', 'จูน', 'เต้ย'];
const CF_SKIN = ['#f6d3b3', '#eebf98', '#d9a477', '#b97f55', '#8d5a3b'];
const CF_HAIR = ['#2b1a14', '#4a2c1a', '#7a4a28', '#c98a4a', '#e8d27a', '#5b6fb4', '#d06a8a', '#ece6dc'];
const CF_SHIRT = ['#e86a5a', '#5b7fc4', '#6f8a4e', '#e8954a', '#9b6cc4', '#3fa89a', '#f2c94c', '#d65d8c', '#7a8a9a'];
const CF = {
  st: null, open: false, skew: 0, lastSync: 0, busy: false, claims: {}, view: 'front', sel: null, step: 'build',
  drink: null, blendQ: 0, blendHold: null, result: null, fx: [], timers: {}, seenServed: new Set(), lastStatus: null,
  $: id => document.getElementById(id)
};
const cfNow = () => Date.now() + CF.skew;
const cfName = id => (CF_INFO[id] || [id])[0];
const cfItem = id => CF.st && (CF.st.items || []).find(x => x.id === id);
const cfHas = id => { const it = cfItem(id); return !!it && (it.cost === 0 && it.cat !== 'upgrade' && it.cat !== 'machine' || (CF.st.unlocked || []).includes(id)); };
const cfLvl = id => Math.min(3, Math.max(0, +((CF.st && CF.st.upgrades || {})[id] || 0)));
const cfLookName = look => CF_NAMES[look % CF_NAMES.length];
function cfDrinkName(o){
  const tops = Object.keys(o.items || {}).filter(k => (cfItem(k) || {}).cat === 'top').map(cfName);
  return cfName(o.base) + (o.blend ? 'ปั่น' : o.ice ? 'เย็น' : 'ร้อน') + (tops.length ? ' + ' + tops.join(' ') : '');
}
const cfEmpty = () => ({ base: null, ice: 0, blend: 0, items: {} });

/* ============================ ภาพพิกเซล ============================ */
function cfKit(g){ return kit(g); }
/* แก้วเครื่องดื่ม วาดในกรอบ 40×52 ที่ (x,y) */
function cfDrawCup(g, d, x, y){
  const { R, E } = cfKit(g), base = d.base ? CF_INFO[d.base][1] : null, it = d.items || {};
  const whip = it.whip > 0, cheese = it.cheese > 0;
  // ฝาโดม + หลอด
  R(x + 23, y, 3, 14, '#f27aa8'); R(x + 24, y, 1, 14, '#f8b0c8');
  if (whip){ E(x + 20, y + 13, 14, 8, '#eaf6fb'); R(x + 6, y + 13, 29, 1, P.out); }
  // ตัวแก้ว (สอบลง)
  const top = y + 14, h = 34;
  for (let i = 0; i < h; i++){ const ins = Math.round(i * 4 / h); R(x + 4 + ins, top + i, 32 - ins * 2, 1, P.out); R(x + 5 + ins, top + i, 30 - ins * 2, 1, '#eef7fb'); }
  R(x + 3, top - 1, 34, 2, P.out); R(x + 8, top + h, 24, 2, P.out);
  if (base){
    const fill = Object.keys(it).length + (d.ice ? 1 : 0) > 3 ? 4 : 6, ly = top + fill;
    for (let i = fill; i < h; i++){ const ins = Math.round(i * 4 / h); R(x + 5 + ins, top + i, 30 - ins * 2, 1, base); }
    // ไซรัป/นม เป็นริ้ว
    let sw = 0;
    ['condensed', 'caramel', 'honey', 'vanilla', 'sugar'].forEach(k => { for (let n = 0; n < (it[k] || 0); n++){ const yy = ly + 6 + sw * 5; if (yy < top + h - 3) R(x + 8 + (sw % 2) * 3, yy, 18, 1, CF_INFO[k][1]); sw++; } });
    if (d.blend){ for (let i = 0; i < 40; i++){ const px = (i * 37 + 11) % 26, py = (i * 53 + 7) % (h - fill - 2); R(x + 7 + px, ly + 1 + py, 1, 1, 'rgba(255,255,255,.55)'); } }
    if (d.ice && !d.blend) [[8, 3], [19, 6], [13, 12], [24, 15]].forEach(([ix, iy]) => { if (ly + iy < top + h - 6){ R(x + ix, ly + iy, 6, 6, 'rgba(255,255,255,.7)'); R(x + ix + 1, ly + iy + 1, 2, 2, '#fff'); } });
    if (it.pearl) for (let i = 0; i < it.pearl * 6; i++) E(x + 10 + (i * 7) % 20, top + h - 3 - Math.floor(i / 3) * 3, 1, 1, CF_INFO.pearl[1], false);
    if (it.jelly) for (let i = 0; i < it.jelly * 4; i++) R(x + 9 + (i * 9) % 20, top + h - 8 - Math.floor(i / 2) * 3, 3, 3, CF_INFO.jelly[1]);
    if (cheese) R(x + 5, top + fill, 30, 3 + it.cheese, CF_INFO.cheese[1]);
    R(x + 7, top + 3, 2, h - 8, 'rgba(255,255,255,.35)');
  }
  if (whip) for (let i = 0; i < 7 + it.whip * 3; i++) E(x + 9 + (i * 5) % 22, y + 10 + (i * 3) % 6, 3, 2, '#fff', false);
  if (it.sprinkle) for (let i = 0; i < it.sprinkle * 7; i++) R(x + 8 + (i * 7) % 24, y + (whip ? 7 : top - y) + (i * 5) % 5, 2, 1, ['#f27aa8', '#5bc0eb', '#f2c94c', '#8fc25e'][i % 4]);
  if (it.choc) for (let i = 0; i < it.choc * 5; i++) R(x + 10 + (i * 9) % 20, y + (whip ? 9 : top - y + 1) + (i * 3) % 4, 2, 2, CF_INFO.choc[1]);
}
/* ไอคอนของ 24×24 */
function cfPaintIcon(cv, id){
  cv.width = 24; cv.height = 24;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 24, 24);
  const { R, E, RR } = cfKit(g), it = cfItem(id), cat = it ? it.cat : '', c = (CF_INFO[id] || [0, '#ccc'])[1];
  if (id === 'ice'){ [[3, 9], [12, 6], [8, 14]].forEach(([x, y]) => { RR(x, y, 9, 9, 2, '#d8f0ff'); R(x + 2, y + 2, 3, 2, '#fff'); }); return; }
  if (cat === 'base'){ R(5, 6, 14, 16, P.out); R(6, 7, 12, 14, c); R(6, 12, 12, 5, '#fff8'); R(8, 2, 8, 5, P.out); R(9, 3, 6, 3, c); return; }
  if (cat === 'mix'){ R(9, 1, 6, 5, P.out); R(10, 2, 4, 3, '#fff'); RR(5, 5, 14, 18, 4, c); R(8, 11, 8, 6, '#fff9'); return; }
  if (cat === 'top'){ E(12, 15, 10, 7, '#e9dccb'); R(3, 13, 18, 2, P.out); for (let i = 0; i < 6; i++) id === 'sprinkle' ? R(6 + i * 2, 11 + (i % 2) * 2, 2, 1, ['#f27aa8', '#5bc0eb', '#f2c94c'][i % 3]) : E(7 + (i % 3) * 5, 10 + Math.floor(i / 3) * 3, 2, 2, c, id === 'whip' || id === 'cheese'); return; }
  if (id === 'blender'){ R(7, 1, 10, 3, P.out); R(6, 4, 12, 13, P.out); R(7, 4, 10, 12, '#cfe8f5'); R(8, 9, 8, 6, '#f4a3bd'); RR(4, 17, 16, 6, 2, '#5b7fc4'); return; }
  if (id === 'sign'){ R(2, 4, 20, 12, P.out); R(3, 5, 18, 10, c); R(6, 9, 12, 2, '#fff'); R(11, 16, 2, 7, P.out); return; }
  if (id === 'bench'){ R(2, 9, 20, 4, P.out); R(3, 10, 18, 2, '#c48a52'); R(4, 13, 2, 9, P.out); R(18, 13, 2, 9, P.out); R(2, 4, 20, 3, P.out); return; }
  if (id === 'jar'){ R(8, 2, 8, 3, P.out); RR(4, 5, 16, 18, 4, '#dff3f0'); E(10, 17, 3, 2, '#f2c94c'); E(15, 14, 3, 2, '#f2c94c'); E(12, 19, 3, 2, '#e0b030'); return; }
}
/* ลูกค้าครึ่งตัว (ไม่เห็นขาเพราะเคาน์เตอร์บัง) กว้าง 22 */
function cfDrawCustomer(g, look, x, y, mood, t){
  const { R, E } = cfKit(g);
  const skin = CF_SKIN[look % 5], hair = CF_HAIR[(look >> 3) % 8], shirt = CF_SHIRT[(look >> 6) % 9], style = (look >> 10) % 4;
  const bob = Math.round(Math.sin(t / 380 + look) * 0.6);
  y += bob;
  R(x + 2, y + 18, 18, 16, P.out); R(x + 3, y + 19, 16, 15, shirt); R(x + 9, y + 19, 4, 3, skin);
  E(x + 11, y + 10, 8, 9, skin);
  if (style === 0){ E(x + 11, y + 4, 9, 5, hair, false); R(x + 3, y + 4, 2, 8, hair); R(x + 17, y + 4, 2, 8, hair); }
  else if (style === 1){ E(x + 11, y + 4, 9, 5, hair, false); R(x + 2, y + 5, 3, 14, hair); R(x + 17, y + 5, 3, 14, hair); }
  else if (style === 2){ E(x + 11, y + 4, 8, 4, hair, false); E(x + 11, y - 2, 4, 3, hair, false); }
  else { E(x + 11, y + 3, 9, 4, hair, false); R(x + 3, y + 2, 16, 2, shirt); R(x + 3, y + 1, 10, 2, shirt); }
  const ey = y + 11;
  if (mood === 'happy'){ R(x + 7, ey, 2, 1, P.out); R(x + 13, ey, 2, 1, P.out); R(x + 9, ey + 3, 4, 1, P.out); R(x + 10, ey + 4, 2, 1, '#e86a5a'); }
  else if (mood === 'sad'){ R(x + 7, ey, 2, 2, P.out); R(x + 13, ey, 2, 2, P.out); R(x + 9, ey + 4, 4, 1, P.out); R(x + 8, ey + 3, 1, 1, P.out); R(x + 13, ey + 3, 1, 1, P.out); }
  else { R(x + 7, ey, 2, 2, P.out); R(x + 13, ey, 2, 2, P.out); R(x + 10, ey + 4, 2, 1, P.out); }
  R(x + 5, ey + 2, 2, 1, '#f4a3a3'); R(x + 15, ey + 2, 2, 1, '#f4a3a3');
}

/* ============================ โครงหน้าจอ ============================ */
function cfBuildUI(){
  document.body.insertAdjacentHTML('beforeend', `
  <section id="cfScreen" class="cf-screen" hidden>
    <header class="cf-head">
      <button class="dg-close" id="cfBack" aria-label="กลับไปห้องนั่งเล่น" title="กลับไปห้องนั่งเล่น">⌂</button>
      <div class="cf-title"><strong>☕ ร้านน้ำของเรา</strong><span id="cfSub">ปิดอยู่</span></div>
      <span class="cf-coins" id="cfCoins">🪙 0</span>
      <button class="btn soft cf-hbtn" id="cfStoreBtn">🛒 ร้านค้า</button>
      <button class="btn primary cf-hbtn" id="cfOpenBtn">เปิดร้าน</button>
    </header>
    <div class="cf-body">
      <div class="cf-front"><canvas id="cfFront" width="320" height="168" aria-label="หน้าร้าน แตะลูกค้าเพื่อทำเครื่องดื่ม"></canvas>
        <div class="cf-workers" id="cfWorkers"></div></div>
      <div class="cf-panel">
        <div id="cfQueueWrap"><div class="dg-label">ลูกค้าที่รออยู่</div><div class="cf-queue" id="cfQueue"></div><div class="cf-today" id="cfToday"></div></div>
        <div class="cf-closed" id="cfClosed" hidden></div>
      </div>
    </div>
    <div class="cf-toasts" id="cfToasts" aria-live="polite"></div>
  </section>

  <section id="cfMake" class="cf-modal" hidden>
    <div class="cf-mcard">
      <header class="cf-mhead"><span class="cf-mlogo">🥤</span><h2>ทำเครื่องดื่ม</h2><span class="cf-coins" id="cfMCoins">🪙 0</span><button class="dg-close" id="cfMClose" aria-label="ปิด">×</button></header>
      <div class="cf-mbody">
        <div class="cf-preview"><canvas id="cfCup" width="56" height="64"></canvas><div class="cf-stamp" id="cfStamp" hidden></div></div>
        <div class="cf-mright">
          <div class="cf-order">
            <div class="cf-order-tabs" id="cfTabs"></div>
            <div class="cf-order-name" id="cfOrderName"></div>
            <div class="cf-recipe" id="cfRecipe"></div>
            <div class="cf-pbar"><i id="cfPBar"></i></div>
          </div>
          <div class="cf-steps" id="cfSteps"></div>
          <div class="cf-stepbody" id="cfStepBody"></div>
          <div class="cf-mfoot"><button class="btn soft" id="cfRestart">เริ่มแก้วใหม่</button><span class="cf-hint" id="cfHint"></span></div>
        </div>
      </div>
    </div>
  </section>

  <section id="cfStore" class="cf-modal" hidden>
    <div class="cf-mcard cf-store">
      <header class="cf-mhead"><span class="cf-mlogo">🛒</span><h2>ร้านค้า</h2><span class="cf-coins" id="cfSCoins">🪙 0</span><button class="dg-close" id="cfSClose" aria-label="ปิด">×</button></header>
      <p class="dg-note" id="cfStoreNote"></p>
      <div class="cf-store-list" id="cfStoreList"></div>
    </div>
  </section>`);

  CF.$('cfBack').onclick = cfClose;
  CF.$('cfOpenBtn').onclick = cfToggleOpen;
  CF.$('cfStoreBtn').onclick = cfOpenStore;
  CF.$('cfSClose').onclick = () => { CF.$('cfStore').hidden = true; };
  CF.$('cfMClose').onclick = cfCloseMaker;
  CF.$('cfRestart').onclick = () => { CF.drink = cfEmpty(); CF.blendQ = 0; CF.result = null; CF.step = 'build'; cfRenderMaker(); };
  CF.$('cfFront').addEventListener('pointerdown', cfFrontTap);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || CF.$('cfScreen').hidden) return;
    if (!CF.$('cfStore').hidden) CF.$('cfStore').hidden = true; else if (!CF.$('cfMake').hidden) cfCloseMaker(); else cfClose();
  });
  CF.fctx = CF.$('cfFront').getContext('2d'); CF.fctx.imageSmoothingEnabled = false;
  CF.cctx = CF.$('cfCup').getContext('2d'); CF.cctx.imageSmoothingEnabled = false;
}

/* ============================ เปิด / ปิดหน้าร้าน ============================ */
function cfOpen(){
  if (!sb){ toast('ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์'); return; }
  audioInit();
  CF.open = true; CF.$('cfScreen').hidden = false;
  cfSync(); clearInterval(CF.timers.sync); CF.timers.sync = setInterval(() => { if (!document.hidden) cfSync(); }, 3000);
  cancelAnimationFrame(CF.raf); const loop = () => { if (!CF.open) return; cfFrame(); CF.raf = requestAnimationFrame(loop); }; CF.raf = requestAnimationFrame(loop);
}
function cfClose(){
  CF.open = false; CF.$('cfScreen').hidden = true; CF.$('cfMake').hidden = true; CF.$('cfStore').hidden = true;
  clearInterval(CF.timers.sync); cancelAnimationFrame(CF.raf); cfUnclaim();
}
async function cfSync(){
  if (CF.syncing) return; CF.syncing = true;
  try { cfApply(await dgRpc('cafe_get_state', { p_player_id: ME.id, p_name: dgMeName(), p_here: CF.open })); }
  catch (e){ if (!CF.st) toast('โหลดร้านไม่สำเร็จ: ' + dgError(e)); }
  finally { CF.syncing = false; }
}
function cfApply(st){
  if (!st) return;
  if (st.server_now) CF.skew = Date.parse(st.server_now) - Date.now();
  const was = CF.st;
  CF.st = st; CF.lastSync = Date.now();
  // เพื่อนเสิร์ฟ -> เด้งข้อความ
  (st.customers || []).forEach(c => {
    const key = st.day + ':' + c.idx;
    if (c.served_at && !CF.seenServed.has(key)){ CF.seenServed.add(key); if (was && c.served_by !== ME.id) cfToast('✨ ' + c.served_name + ' เสิร์ฟ ' + cfLookName(c.look) + ' ได้ ' + c.coins + ' แต้ม'); }
  });
  if (was && was.open !== st.open){
    if (st.open) cfToast('ร้านเปิดแล้ว! ลูกค้ากำลังมา'); else { cfToast('ร้านปิดแล้ว'); if (!CF.$('cfMake').hidden && !CF.result) cfCloseMaker(); }
  }
  // ลูกค้าที่กำลังทำให้ กลับไปแล้ว/มีคนเสิร์ฟแล้ว
  if (CF.sel && !CF.result){ const c = cfCust(CF.sel); if (!c || c.served_at){ if (!CF.$('cfMake').hidden && c && c.served_by !== ME.id) cfHintMsg(c.served_name + ' เสิร์ฟคนนี้ไปแล้ว เลือกลูกค้าคนอื่นได้'); } }
  cfRender();
}
const cfCust = idx => CF.st && (CF.st.customers || []).find(c => c.idx === idx);
function cfWaiting(){
  const now = cfNow();
  return (CF.st && CF.st.open ? CF.st.customers : []).filter(c => !c.served_at && Date.parse(c.arrive_at) <= now && Date.parse(c.leave_at) > now);
}

/* ============================ วาดหน้าร้าน ============================ */
function cfSlots(){
  // ลูกค้าที่ยืนอยู่หน้าต่าง: รออยู่ + เพิ่งได้ของ/เพิ่งเดินหนี (โชว์ต่ออีก 2.5 วิ)
  const now = cfNow(), list = [];
  (CF.st && CF.st.open ? CF.st.customers : []).forEach(c => {
    const a = Date.parse(c.arrive_at), l = Date.parse(c.leave_at), s = c.served_at ? Date.parse(c.served_at) : 0;
    if (a > now) return;
    if (s){ if (now - s < 2500) list.push({ c, mood: 'happy', fade: (now - s) / 2500 }); return; }
    if (l > now) list.push({ c, mood: (l - now) / (l - a) < .25 ? 'sad' : 'wait', walk: Math.min(1, (now - a) / 1200) });
    else if (now - l < 2500) list.push({ c, mood: 'sad', fade: (now - l) / 2500, gone: true });
  });
  return list.slice(0, 5);
}
function cfFrame(){
  const g = CF.fctx; if (!g || !CF.st) return;
  const { R, E, RR } = cfKit(g), t = performance.now(), open = CF.st.open;
  g.clearRect(0, 0, 320, 168);
  // ผนังด้านใน
  R(0, 0, 320, 168, P.wall); R(0, 0, 320, 4, P.wallD);
  for (let x = 0; x < 320; x += 16) R(x, 4, 1, 16, P.wallS);
  // หน้าต่างบริการ
  R(14, 20, 292, 96, P.frame); R(18, 24, 284, 88, '#9fd3ec');
  const sky = g.createLinearGradient(0, 24, 0, 90); sky.addColorStop(0, '#9fd3ec'); sky.addColorStop(1, '#d9f0f7'); g.fillStyle = sky; g.fillRect(18, 24, 284, 66);
  [[40, 34], [150, 30], [250, 40]].forEach(([cx, cy], i) => { const ox = ((t / 90 + i * 70) % 340) - 20; E(cx + ox - 40, cy, 12, 4, '#fff', false); E(cx + ox - 32, cy - 3, 7, 4, '#fff', false); });
  R(18, 78, 284, 10, '#b7c9a4'); for (let x = 22; x < 300; x += 26) { E(x, 78, 9, 6, '#8fb07a', false); }
  R(18, 88, 284, 24, '#c9b9a0'); for (let x = 18; x < 302; x += 20) R(x, 88, 1, 24, '#b7a68c'); R(18, 99, 284, 1, '#b7a68c');
  // กันสาดลายทาง
  for (let x = 14; x < 306; x += 12){ R(x, 20, 12, 8, (x / 12) % 2 ? '#f6efe3' : '#e86a5a'); E(x + 6, 28, 6, 2, (x / 12) % 2 ? '#f6efe3' : '#e86a5a', false); }
  R(14, 20, 292, 1, P.out);
  // ลูกค้า
  const slots = cfSlots(); CF.hit = [];
  slots.forEach((s, i) => {
    const x0 = 76 + i * 46, x = Math.round(x0 + (1 - (s.walk ?? 1)) * 120 + (s.fade ? (s.gone ? -1 : 1) * s.fade * 60 : 0)), y = 76;
    g.globalAlpha = s.fade ? 1 - s.fade : 1;
    cfDrawCustomer(g, s.c.look, x, y, s.mood, t);
    if (!s.fade){
      // บับเบิลเมนู + เวลาที่เหลือ
      const bx = x - 4, by = y - 26; RR(bx, by, 30, 22, 4, '#fff'); R(bx + 12, by + 21, 4, 3, '#fff'); R(bx + 12, by + 24, 2, 1, P.out);
      g.save(); g.translate(bx + 7, by + 2); g.scale(.36, .36); cfDrawCup(g, s.c.ord, 0, 0); g.restore();
      const left = Math.max(0, (Date.parse(s.c.leave_at) - cfNow()) / (Date.parse(s.c.leave_at) - Date.parse(s.c.arrive_at)));
      R(bx + 3, by + 18, 24, 2, '#e9dccb'); R(bx + 3, by + 18, Math.round(24 * left), 2, left < .25 ? '#e0643c' : left < .5 ? '#f2c94c' : '#3fa89a');
      const cl = CF.claims[s.c.idx]; if (cl && cl.until > Date.now()){ R(bx + 22, by - 3, 9, 9, P.out); R(bx + 23, by - 2, 7, 7, dgColor(cl.by)); }
      if (CF.sel === s.c.idx && !CF.$('cfMake').hidden) RR(x - 3, y + 36, 28, 4, 2, '#f2c94c', false);
      CF.hit.push({ x0: x - 6, x1: x + 28, idx: s.c.idx });
    } else if (s.mood === 'happy'){ g.fillStyle = '#e86a8a'; R(x + 8, y - 8 - s.fade * 10, 3, 3, '#e86a8a'); R(x + 12, y - 8 - s.fade * 10, 3, 3, '#e86a8a'); R(x + 9, y - 6 - s.fade * 10, 5, 3, '#e86a8a'); R(x + 10, y - 3 - s.fade * 10, 3, 2, '#e86a8a'); }
    g.globalAlpha = 1;
  });
  // ชัตเตอร์ตอนปิด
  if (!open){
    for (let y = 24; y < 108; y += 4){ R(18, y, 284, 4, '#b8bcc4'); R(18, y + 3, 284, 1, '#8e939c'); }
    RR(118, 52, 84, 26, 4, '#6b4226'); RR(121, 55, 78, 20, 3, '#f3e2bd', false);
    g.fillStyle = P.out; g.font = 'bold 12px Mitr, sans-serif'; g.textAlign = 'center'; g.fillText('ปิดอยู่จ้า', 160, 70);
  }
  // เคาน์เตอร์
  R(0, 112, 320, 56, P.wood); R(0, 112, 320, 7, P.woodL); R(0, 119, 320, 2, P.woodD);
  for (let x = 0; x < 320; x += 40) R(x, 121, 1, 47, P.woodD);
  // ของบนเคาน์เตอร์
  O2(g, 10, 98, 26, 16, '#5a5f6a'); R(14, 101, 18, 6, '#a7f0c4'); R(13, 110, 20, 3, '#3d424c');
  for (let i = 0; i < 4; i++){ R(48 + i * 3, 100 - i * 3, 12, 14, P.out); R(49 + i * 3, 101 - i * 3, 10, 12, '#f6f6f2'); }
  if (cfHas('blender')){ R(262, 92, 16, 3, P.out); R(260, 95, 20, 16, P.out); R(261, 95, 18, 15, '#cfe8f5'); R(263, 101, 14, 8, '#f4a3bd'); R(258, 110, 24, 4, '#5b7fc4'); }
  const jar = cfLvl('jar'); R(292, 98, 18, 16, P.out); R(293, 99, 16, 14, '#dff3f0'); for (let i = 0; i < jar * 3 + 1; i++) E(297 + (i * 5) % 10, 110 - Math.floor(i / 2) * 2, 2, 1, '#f2c94c', false);
  if (cfLvl('sign')){ R(140, 6, 40, 12, P.out); R(141, 7, 38, 10, '#e8954a'); for (let i = 0; i < cfLvl('sign'); i++) R(150 + i * 8, 10, 4, 4, '#fff3dc'); }
  if (open){ RR(128, 128, 64, 20, 4, '#3fa89a'); g.fillStyle = '#fff'; g.font = 'bold 11px Mitr, sans-serif'; g.textAlign = 'center'; g.fillText('เปิดแล้ว', 160, 142); }
  // อัปเดตแถบเวลาในรายการคิวทุกเฟรม (ถูกกว่าวาดใหม่ทั้งหมด)
  document.querySelectorAll('#cfQueue [data-idx]').forEach(el => {
    const c = cfCust(+el.dataset.idx); if (!c) return;
    const left = Math.max(0, (Date.parse(c.leave_at) - cfNow()) / (Date.parse(c.leave_at) - Date.parse(c.arrive_at)));
    const bar = el.querySelector('i'); if (bar){ bar.style.width = left * 100 + '%'; bar.className = left < .25 ? 'low' : left < .5 ? 'mid' : ''; }
  });
  if (!CF.$('cfMake').hidden && CF.sel){ const c = cfCust(CF.sel), bar = CF.$('cfPBar'); if (c && !c.served_at){ const left = Math.max(0, (Date.parse(c.leave_at) - cfNow()) / (Date.parse(c.leave_at) - Date.parse(c.arrive_at))); bar.style.width = left * 100 + '%'; bar.className = left < .25 ? 'low' : left < .5 ? 'mid' : ''; } else bar.style.width = '0%'; }
  // คิวเปลี่ยน (มีคนมา/กลับ) -> วาดรายการใหม่
  const sig = cfWaiting().map(c => c.idx).join(',');
  if (sig !== CF.qsig){ CF.qsig = sig; cfRenderQueue(); }
}
function O2(g, x, y, w, h, c){ const { R } = cfKit(g); R(x, y, w, h, P.out); R(x + 1, y + 1, w - 2, h - 2, c); }
function cfFrontTap(e){
  if (!CF.st || !CF.st.open) return;
  const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 320, y = (e.clientY - r.top) / r.height * 168;
  if (y > 118) return;
  const h = (CF.hit || []).find(h => x >= h.x0 && x <= h.x1); if (h) cfOpenMaker(h.idx);
}

/* ============================ แผงข้าง: คิว / สรุปวัน ============================ */
function cfRender(){
  const st = CF.st; if (!st) return;
  CF.$('cfCoins').textContent = CF.$('cfMCoins').textContent = CF.$('cfSCoins').textContent = '🪙 ' + st.coins;
  CF.$('cfSub').textContent = st.open ? 'วันที่ ' + st.day + ' · เปิดอยู่' : 'ปิดอยู่ · ขายไปแล้ว ' + st.total_served + ' แก้ว';
  CF.$('cfOpenBtn').textContent = st.open ? 'ปิดร้าน' : 'เปิดร้าน';
  CF.$('cfOpenBtn').className = 'btn cf-hbtn ' + (st.open ? 'soft' : 'primary');
  CF.$('cfStoreBtn').disabled = false;
  const w = CF.$('cfWorkers'); w.replaceChildren();
  (st.workers || []).forEach(p => { const ch = dgEl('span', 'cf-worker', p.name + (p.player_id === ME.id ? ' (คุณ)' : '')); ch.style.borderColor = dgColor(p.player_id); w.appendChild(ch); });
  CF.$('cfQueueWrap').hidden = !st.open; CF.$('cfClosed').hidden = st.open;
  if (st.open){
    const td = st.today || {};
    CF.$('cfToday').textContent = 'วันนี้: เสิร์ฟ ' + (td.served || 0) + ' แก้ว · เพอร์เฟกต์ ' + (td.perfect || 0) + ' · ลูกค้าหนี ' + (td.missed || 0) + ' · ได้ ' + (td.earned || 0) + ' แต้ม';
    CF.qsig = null;
  } else cfRenderClosed();
  if (!CF.$('cfMake').hidden) cfRenderMaker();
  if (!CF.$('cfStore').hidden) cfRenderStore();
}
function cfRenderQueue(){
  const box = CF.$('cfQueue'); box.replaceChildren();
  const list = cfWaiting();
  if (!list.length){ box.appendChild(dgEl('div', 'dg-empty', 'ยังไม่มีลูกค้า รอแป๊บหนึ่งนะ…')); return; }
  list.forEach(c => {
    const row = dgEl('button', 'cf-qrow'); row.type = 'button'; row.dataset.idx = c.idx;
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 52; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; cfDrawCup(g, c.ord, 0, 0);
    const info = dgEl('span', 'cf-qinfo'); info.append(dgEl('b', '', '#' + c.idx + ' ' + cfLookName(c.look)), dgEl('span', '', cfDrinkName(c.ord) + ' · ' + c.price + ' แต้ม'));
    const cl = CF.claims[c.idx]; if (cl && cl.until > Date.now() && cl.by !== ME.id) info.appendChild(dgEl('small', '', '✍️ ' + cl.name + ' กำลังทำ'));
    const bar = dgEl('span', 'cf-qbar'); bar.appendChild(document.createElement('i'));
    info.appendChild(bar); row.append(cv, info); row.onclick = () => cfOpenMaker(c.idx); box.appendChild(row);
  });
}
function cfRenderClosed(){
  const st = CF.st, box = CF.$('cfClosed'); box.replaceChildren();
  const d = st.last_day;
  if (d && d.day){
    box.appendChild(dgEl('h3', '', 'สรุปวันที่ ' + d.day));
    [['เสิร์ฟ', d.served + ' แก้ว'], ['เพอร์เฟกต์', d.perfect + ' แก้ว'], ['ลูกค้าหนี', d.missed + ' คน'], ['ได้แต้ม', d.earned + ' 🪙'], ['สถิติวันที่ดีที่สุด', st.best_day + ' 🪙']]
      .forEach(([a, b]) => { const r = dgEl('div', 'dg-score-row'); r.append(dgEl('span', 'dg-score-name', a), dgEl('strong', 'dg-score-points', b)); box.appendChild(r); });
  } else box.appendChild(dgEl('h3', '', 'ร้านใหม่ของเรา!'));
  box.appendChild(dgEl('p', 'dg-note', 'กด "เปิดร้าน" แล้วลูกค้าจะเริ่มมาที่หน้าต่าง แตะลูกค้าเพื่อทำเครื่องดื่ม ทุกคนในห้องช่วยกันได้ แต้มรวมเป็นของร้าน · ซื้อของในร้านค้าได้ตอนปิดร้าน · ถ้าทุกคนออกจากร้าน ร้านจะปิดเองใน 90 วินาที'));
}
function cfToast(text){
  const box = CF.$('cfToasts'), el = dgEl('div', 'cf-toast', text); box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
  while (box.children.length > 3) box.firstChild.remove();
}

/* ============================ เปิด/ปิดร้าน, ร้านค้า ============================ */
async function cfToggleOpen(){
  if (CF.busy || !CF.st) return;
  if (CF.st.open && !confirm('ปิดร้านตอนนี้ใช่ไหม? ลูกค้าที่รออยู่จะกลับบ้าน')) return;
  CF.busy = true;
  try { cfApply(await dgRpc(CF.st.open ? 'cafe_close' : 'cafe_open', CF.st.open ? { p_player_id: ME.id } : { p_player_id: ME.id, p_name: dgMeName() })); cfBroadcast('state', { open: CF.st.open }); if (CF.st.open) sfxTurn(); }
  catch (e){ toast(dgError(e)); }
  finally { CF.busy = false; }
}
function cfOpenStore(){ CF.$('cfStore').hidden = false; cfRenderStore(); }
function cfRenderStore(){
  const st = CF.st, box = CF.$('cfStoreList'); if (!st) return;
  CF.$('cfStoreNote').textContent = st.open ? 'ซื้อของได้ตอนปิดร้านเท่านั้น (เมนูจะได้ไม่เปลี่ยนกลางวัน)' : 'ของที่ซื้อแล้วใช้ได้ตลอด ส่วนผสมใหม่ = ลูกค้าสั่งเมนูใหม่ได้ (แพงขึ้น)';
  box.replaceChildren();
  const groups = [['base', 'ฐานเครื่องดื่ม'], ['mix', 'ไซรัป / นม'], ['top', 'ท็อปปิ้ง'], ['machine', 'เครื่อง'], ['upgrade', 'อัปเกรดร้าน']];
  groups.forEach(([cat, title]) => {
    box.appendChild(dgEl('div', 'dg-label cf-sgroup', title));
    const grid = dgEl('div', 'cf-sgrid');
    (st.items || []).filter(it => it.cat === cat).forEach(it => {
      const card = dgEl('div', 'cf-sitem'), cv = document.createElement('canvas'); cfPaintIcon(cv, it.id);
      const info = dgEl('div', 'cf-sinfo'); info.appendChild(dgEl('b', '', cfName(it.id)));
      let btn;
      if (cat === 'upgrade'){
        const lv = cfLvl(it.id); info.appendChild(dgEl('small', '', (CF_INFO[it.id][2] || '') + ' · เลเวล ' + lv + '/3'));
        btn = dgEl('button', 'btn ' + (lv >= 3 ? 'soft' : 'primary'), lv >= 3 ? 'เต็มแล้ว' : '🪙 ' + it.costs[lv]); btn.disabled = lv >= 3 || st.open || st.coins < it.costs[lv];
      } else {
        const own = cfHas(it.id); info.appendChild(dgEl('small', '', cat === 'machine' ? 'ลูกค้าสั่งเมนูปั่นได้ +' + it.price + ' แต้ม' : 'ขายได้ ' + it.price + ' แต้ม/ที่'));
        btn = dgEl('button', 'btn ' + (own ? 'soft' : 'primary'), own ? 'มีแล้ว ✓' : '🪙 ' + it.cost); btn.disabled = own || st.open || st.coins < it.cost;
      }
      btn.onclick = () => cfBuy(it.id);
      card.append(cv, info, btn); grid.appendChild(card);
    });
    box.appendChild(grid);
  });
}
async function cfBuy(id){
  if (CF.busy) return; CF.busy = true;
  try { cfApply(await dgRpc('cafe_buy', { p_player_id: ME.id, p_item: id })); sfxDone(); cfToast('ได้ ' + cfName(id) + ' แล้ว!'); cfBroadcast('state'); }
  catch (e){ toast(dgError(e)); }
  finally { CF.busy = false; }
}

/* ============================ แผงทำเครื่องดื่ม ============================ */
function cfOpenMaker(idx){
  const c = cfCust(idx); if (!c || c.served_at) return;
  if (CF.sel !== idx || CF.result){ CF.drink = cfEmpty(); CF.blendQ = 0; CF.step = 'build'; CF.result = null; }
  CF.sel = idx; CF.$('cfMake').hidden = false; cfHintMsg('');
  cfBroadcast('claim', { idx, name: dgMeName() }); CF.claims[idx] = { by: ME.id, name: dgMeName(), until: Date.now() + 45000 };
  cfRenderMaker();
}
function cfCloseMaker(){ CF.$('cfMake').hidden = true; cfUnclaim(); if (CF.result){ CF.result = null; CF.sel = null; } }
function cfUnclaim(){ if (CF.sel){ cfBroadcast('unclaim', { idx: CF.sel }); delete CF.claims[CF.sel]; } }
function cfHintMsg(t){ CF.hintText = t; const h = CF.$('cfHint'); if (h) h.textContent = t; }
function cfSteps(){ const s = [['build', 'ใส่ส่วนผสม'], ['top', 'ท็อปปิ้ง'], ['serve', 'เสิร์ฟ']]; if (cfHas('blender')) s.splice(1, 0, ['blend', 'ปั่น']); return s; }
/* ส่วนผสมแต่ละอย่างตรงกับที่สั่งไหม */
function cfMatch(o, d){
  const r = [{ id: o.base, n: 1, ok: d.base === o.base, base: true }];
  r.push({ id: 'ice', n: o.ice ? 1 : 0, ok: !!d.ice === !!o.ice, flag: true });
  Object.keys(o.items || {}).forEach(k => r.push({ id: k, n: o.items[k], ok: (d.items[k] || 0) === o.items[k] }));
  if (o.blend) r.push({ id: 'blender', n: 1, ok: !!d.blend, flag: true });
  return r;
}
function cfRenderMaker(){
  const c = cfCust(CF.sel), d = CF.drink || cfEmpty();
  // แท็บลูกค้า
  const tabs = CF.$('cfTabs'); tabs.replaceChildren();
  cfWaiting().forEach(w => { const b = dgEl('button', 'cf-tab' + (w.idx === CF.sel ? ' on' : ''), '#' + w.idx); b.onclick = () => cfOpenMaker(w.idx); tabs.appendChild(b); });
  if (!c){ CF.$('cfOrderName').textContent = 'ลูกค้าคนนี้ไม่อยู่แล้ว'; CF.$('cfRecipe').replaceChildren(); CF.$('cfStepBody').replaceChildren(); return; }
  CF.$('cfOrderName').textContent = '#' + c.idx + ' · ' + cfLookName(c.look) + ' · ' + cfDrinkName(c.ord) + ' · ' + c.price + ' แต้ม';
  // สูตรที่สั่ง + เครื่องหมายถูก
  const rec = CF.$('cfRecipe'); rec.replaceChildren();
  cfMatch(c.ord, d).forEach(m => {
    if (m.flag && !m.n && m.id === 'ice'){ const ch = dgEl('span', 'cf-rchip' + (m.ok ? ' ok' : ''), 'ไม่ใส่น้ำแข็ง'); rec.appendChild(ch); return; }
    const ch = dgEl('span', 'cf-rchip' + (m.ok ? ' ok' : '')), cv = document.createElement('canvas'); cfPaintIcon(cv, m.id);
    ch.append(cv, dgEl('span', '', (m.id === 'blender' ? 'ปั่น' : cfName(m.id)) + (m.n > 1 ? ' ×' + m.n : '')));
    rec.appendChild(ch);
  });
  // ขั้นตอน
  const steps = CF.$('cfSteps'); steps.replaceChildren();
  cfSteps().forEach(([id, label]) => { const b = dgEl('button', 'cf-step' + (CF.step === id ? ' on' : ''), label); b.onclick = () => { if (!CF.result){ CF.step = id; cfRenderMaker(); } }; steps.appendChild(b); });
  const body = CF.$('cfStepBody'); body.replaceChildren();
  const g = CF.cctx; g.clearRect(0, 0, 56, 64); cfDrawCup(g, d, 8, 6);
  const stamp = CF.$('cfStamp'); stamp.hidden = !CF.result;
  CF.$('cfRestart').hidden = !!CF.result;
  if (CF.result){ cfRenderResult(body); return; }
  const grid = cat => { const gr = dgEl('div', 'cf-igrid'); body.appendChild(gr); return gr; };
  const itemBtn = (gr, id, count, onTap, max) => {
    const b = dgEl('button', 'cf-ibtn' + (count ? ' on' : '')), cv = document.createElement('canvas'); cfPaintIcon(cv, id);
    b.append(cv, dgEl('span', '', cfName(id))); if (count > 1 || (max > 1 && count)) b.appendChild(dgEl('em', '', '×' + count));
    b.onclick = () => { onTap(); tone(520 + Math.random() * 120, 0, .05, 'sine', .05); cfRenderMaker(); };
    gr.appendChild(b);
  };
  if (CF.step === 'build'){
    body.appendChild(dgEl('div', 'dg-label', 'ฐานเครื่องดื่ม (เลือก 1)'));
    let gr = grid(); (CF.st.items || []).filter(it => it.cat === 'base' && cfHas(it.id)).forEach(it => itemBtn(gr, it.id, d.base === it.id ? 1 : 0, () => { d.base = d.base === it.id ? null : it.id; }, 1));
    body.appendChild(dgEl('div', 'dg-label', 'น้ำแข็ง / ไซรัป / นม (แตะซ้ำเพิ่มได้ถึง 3)'));
    gr = grid(); itemBtn(gr, 'ice', d.ice, () => { d.ice = d.ice ? 0 : 1; }, 1);
    (CF.st.items || []).filter(it => it.cat === 'mix' && cfHas(it.id)).forEach(it => itemBtn(gr, it.id, d.items[it.id] || 0, () => { d.items[it.id] = ((d.items[it.id] || 0) + 1) % 4; if (!d.items[it.id]) delete d.items[it.id]; }, 3));
  } else if (CF.step === 'top'){
    body.appendChild(dgEl('div', 'dg-label', 'ท็อปปิ้ง (แตะซ้ำเพิ่ม แตะครั้งที่ 4 เอาออก)'));
    const gr = grid(); (CF.st.items || []).filter(it => it.cat === 'top' && cfHas(it.id)).forEach(it => itemBtn(gr, it.id, d.items[it.id] || 0, () => { d.items[it.id] = ((d.items[it.id] || 0) + 1) % 4; if (!d.items[it.id]) delete d.items[it.id]; }, 3));
  } else if (CF.step === 'blend'){
    cfRenderBlend(body, d);
  } else {
    const ready = !!d.base;
    body.appendChild(dgEl('p', 'dg-note', ready ? 'ตรวจแก้วให้ตรงกับที่ลูกค้าสั่ง (ช่องสีเขียว = ตรงแล้ว) แล้วกดเสิร์ฟ' : 'ยังไม่ได้ใส่ฐานเครื่องดื่ม กลับไปขั้น "ใส่ส่วนผสม" ก่อน'));
    const b = dgEl('button', 'btn primary cf-serve', '✨ เสิร์ฟให้ ' + cfLookName(c.look)); b.disabled = !ready || CF.busy; b.onclick = cfServe; body.appendChild(b);
  }
  CF.$('cfHint').textContent = CF.hintText || '';
}
/* ปั่น: กดค้างให้เข็มขึ้น ปล่อยในช่องเขียว (70–90%) = เนียนสุด */
function cfRenderBlend(body, d){
  body.appendChild(dgEl('p', 'dg-note', d.blend ? 'ปั่นแล้ว ความเนียน ' + CF.blendQ + '% · ปั่นใหม่ได้ หรือแตะ "ไม่ปั่น"' : 'กดค้างที่ปุ่ม แล้วปล่อยตอนเข็มอยู่ในช่องสีเขียว (เมนูที่ไม่ได้สั่งปั่น อย่าปั่นนะ)'));
  const meter = dgEl('div', 'cf-meter'), zone = dgEl('span', 'cf-zone'), needle = dgEl('i', 'cf-needle');
  meter.append(zone, needle); body.appendChild(meter);
  needle.style.left = (d.blend ? CF.blendQ ? CF.blendPos || 0 : 0 : 0) + '%';
  const row = dgEl('div', 'dg-actions'), hold = dgEl('button', 'btn primary cf-hold', '🌀 กดค้างเพื่อปั่น'), off = dgEl('button', 'btn soft', 'ไม่ปั่น');
  off.onclick = () => { d.blend = 0; CF.blendQ = 0; cfRenderMaker(); };
  const start = e => { e.preventDefault(); if (CF.blendHold) return; hold.setPointerCapture && e.pointerId != null && hold.setPointerCapture(e.pointerId);
    const t0 = performance.now(); CF.blendHold = setInterval(() => { const p = Math.min(100, (performance.now() - t0) / 22); CF.blendPos = p; needle.style.left = p + '%'; if (Math.floor(p) % 8 === 0) tone(140 + p * 3, 0, .04, 'sawtooth', .025); }, 30); };
  const stop = () => { if (!CF.blendHold) return; clearInterval(CF.blendHold); CF.blendHold = null;
    const p = CF.blendPos || 0; CF.blendQ = p >= 70 && p <= 90 ? 100 : Math.max(0, Math.round(100 - Math.min(Math.abs(p - 70), Math.abs(p - 90)) * 2.5));
    d.blend = 1; d.ice = 1; if (CF.blendQ === 100) sfxSnap(); cfRenderMaker(); };
  hold.addEventListener('pointerdown', start); hold.addEventListener('pointerup', stop); hold.addEventListener('pointercancel', stop); hold.addEventListener('lostpointercapture', stop);
  row.append(hold, off); body.appendChild(row);
}
async function cfServe(){
  const c = cfCust(CF.sel); if (!c || CF.busy) return;
  CF.busy = true; cfRenderMaker();
  try {
    const r = await dgRpc('cafe_serve', { p_player_id: ME.id, p_name: dgMeName(), p_day: CF.st.day, p_idx: c.idx, p_drink: CF.drink, p_blend_q: CF.blendQ });
    if (r.ok){
      CF.result = r; CF.seenServed.add(CF.st.day + ':' + c.idx);
      r.score === 100 ? sfxDone() : r.score >= 50 ? sfxSnap() : sfxSet();
      cfBroadcast('unclaim', { idx: c.idx }); cfBroadcast('state'); delete CF.claims[c.idx];
    } else cfHintMsg(r.message || 'เสิร์ฟไม่สำเร็จ');
    if (r.state) cfApply(r.state);
  } catch (e){ cfHintMsg(dgError(e)); }
  finally { CF.busy = false; cfRenderMaker(); }
}
function cfRenderResult(body){
  const r = CF.result, stars = Math.round(r.score / 20);
  const stamp = CF.$('cfStamp'); stamp.textContent = r.score === 100 ? 'เพอร์เฟกต์!' : r.score >= 80 ? 'อร่อยมาก!' : r.score >= 50 ? 'พอได้' : 'ผิดสูตร…';
  stamp.className = 'cf-stamp' + (r.score >= 80 ? ' good' : r.score < 50 ? ' bad' : '');
  const card = dgEl('div', 'cf-result');
  card.appendChild(dgEl('div', 'cf-stars', '★'.repeat(stars) + '☆'.repeat(5 - stars)));
  [['ส่วนผสม', r.build], ['ท็อปปิ้ง', r.top], ['ปั่น', r.blend]].forEach(([a, v]) => {
    const row = dgEl('div', 'cf-rrow'), bar = dgEl('span', 'cf-rbar'), i = document.createElement('i'); i.style.width = v + '%'; bar.appendChild(i);
    row.append(dgEl('span', '', a), bar, dgEl('b', '', v + '%')); card.appendChild(row);
  });
  card.appendChild(dgEl('div', 'cf-earn', r.coins + r.tip > 0 ? '+' + r.coins + ' แต้ม' + (r.tip ? ' · ทิป +' + r.tip : '') : 'ลูกค้าไม่จ่าย (ผิดเกินครึ่ง)'));
  body.appendChild(card);
  const row = dgEl('div', 'dg-actions'), next = dgEl('button', 'btn primary', 'ลูกค้าคนต่อไป →'), close = dgEl('button', 'btn soft', 'กลับหน้าร้าน');
  const n = cfWaiting().find(w => w.idx !== CF.sel && !(CF.claims[w.idx] && CF.claims[w.idx].until > Date.now() && CF.claims[w.idx].by !== ME.id));
  next.disabled = !n; next.onclick = () => { CF.result = null; cfOpenMaker(n.idx); };
  close.onclick = cfCloseMaker; row.append(close, next); body.appendChild(row);
}

/* ============================ เรียลไทม์ ============================ */
function cfBroadcast(t, extra){
  if (!S.chan) return;
  S.chan.send({ type: 'broadcast', event: 'cafe', payload: Object.assign({ t, from: ME.id }, extra || {}) }).catch(() => {});
}
CF.onBroadcast = function(p){
  if (!p || typeof p !== 'object' || p.from === ME.id) return;
  if (p.t === 'state'){ if (CF.open) cfSync(); else if (p.open) toast('☕ ร้านน้ำเปิดแล้ว'); return; }
  if (p.t === 'claim' && Number.isInteger(p.idx)){ CF.claims[p.idx] = { by: p.from, name: String(p.name || 'เพื่อน').slice(0, 32), until: Date.now() + 45000 }; CF.qsig = null; return; }
  if (p.t === 'unclaim' && Number.isInteger(p.idx)){ if (CF.claims[p.idx] && CF.claims[p.idx].by === p.from) delete CF.claims[p.idx]; CF.qsig = null; }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cfBuildUI, { once: true }); else cfBuildUI();
