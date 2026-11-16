/* ---------- Draw & Guess v3 ----------
   ห้องหลายห้อง + ห้องรอ, แชท/ทายคำช่องเดียว, ชุดสีใหญ่, ยางลบ 2 โหมด (เฉพาะจุด / ทั้งเส้น), ย้อนกลับ
   แยกจากกระดานวาดร่วม (Board / board_items) ใช้ตาราง dg3_* ฝั่ง Supabase (supabase/draw_guess_v3.sql) */
const DG_CATS = [
  ['animals','สัตว์','🐾'],['food','อาหาร','🍜'],['objects','สิ่งของ','🎒'],['occupations','อาชีพ','🧑‍🍳'],
  ['places','สถานที่','🏡'],['nature','ธรรมชาติ','🌈'],['vehicles','ยานพาหนะ','🛺'],['thai_culture','วัฒนธรรมไทย','🇹🇭'],
  ['fantasy','แฟนตาซี','🐉'],['actions','กิจกรรม','🏃'],['sports','กีฬา','⚽'],['clothes','เสื้อผ้า','👗'],
  ['cozy','ชิลล์ ๆ','🧺'],['school','โรงเรียน','✏️'],['games','เกมและของเล่น','🎲']
];
const DG_DIFFS = [['easy','ง่าย'],['normal','ทั่วไป'],['hard','ยาก'],['mixed','ผสมทุกระดับ']];
const DG_TIMES = [[45,'45 วินาที'],[60,'60 วินาที'],[90,'90 วินาที'],[120,'2 นาที'],[180,'3 นาที'],[0,'ไม่จำกัดเวลา']];
const DG_ROUNDS = [3,5,8,10,15,20,30];
const DG_REF = 600;            // ความสูงอ้างอิงของผืนวาด: ขนาดเส้น (px) -> สัดส่วนของผืน
const DG_ASPECT = 4 / 3;

/* ---- ชุดสี: 12 โทน x 6 ระดับ + เทา + สีผิว/ผม ---- */
function dgHsl(h, s, l){
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const DG_HUES = [0, 24, 46, 62, 100, 148, 178, 204, 228, 264, 298, 334];
const DG_LIGHT = [[90, 90], [88, 74], [84, 60], [80, 46], [72, 34], [62, 22]];
const DG_GRID = DG_LIGHT.map(([s, l]) => DG_HUES.map(h => dgHsl(h, s, l))).flat();
const DG_GRAYS = ['#ffffff', '#ececec', '#d4d4d4', '#bbbbbb', '#a0a0a0', '#858585', '#6b6b6b', '#505050', '#383838', '#252525', '#141414', '#000000'];
const DG_SKINS = ['#ffe8d6', '#fcd9bd', '#f3c79f', '#e3ad7f', '#c98d5c', '#a96f43', '#8a5530', '#6a3f22', '#4a2a16', '#f6d365', '#c27a3a', '#7a4a2e'];
const DG_QUICK = ['#252525', '#e63946', '#f48c06', '#fcd116', '#3a9d5d', '#2d87d6', '#7b5cd6', '#ec6aa8', '#8a5530', '#ffffff'];

const DG = {
  roomId: null, room: null, rooms: [], mineRoom: null, visible: false, hubOpen: false, busy: false,
  chat: [], chatLast: 0, chatReset: true,
  strokes: new Map(), order: [], hidden: new Set(), live: new Map(), own: new Map(), mine: [],
  cur: null, cursor: null, pending: [], lastLiveAt: 0,
  tool: 'pen', eMode: 'pixel',
  prefs: Object.assign({ color: '#252525', recent: [], mine: [], pen: 8, eraser: 28, eMode: 'pixel' }, LS.get('jt-dg-prefs', {})),
  form: { mode: 'create' },
  skew: 0, seenResult: '', resultHidden: false, notice: '', noticeKind: '',
  timers: {}, restored: null, lastSyncAt: 0, lastAway: 0, lastPrev: null,
  $: id => document.getElementById(id)
};
DG.tool = 'pen'; DG.eMode = DG.prefs.eMode === 'stroke' ? 'stroke' : 'pixel';
const dgSavePrefs = () => LS.set('jt-dg-prefs', DG.prefs);
const dgNow = () => Date.now() + DG.skew;

function dgCats(id){ const c = DG_CATS.find(x => x[0] === id); return c ? c : id === 'custom' ? ['custom', 'คำของห้อง', '⭐'] : [id, id, '•']; }
function dgError(e){
  const msg = (e && e.message) || String(e || 'เกิดข้อผิดพลาด');
  return msg.replace(/^error:\s*/i, '').replace(/[\r\n]+/g, ' ').slice(0, 160);
}
async function dgRpc(fn, args){ const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; }
function dgEl(tag, cls, text){ const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
function dgMeName(){ return (ME.name || 'ผู้เล่น').slice(0, 32); }
function dgColor(id){
  const on = (S.players || []).find(p => String(p.key) === String(id));
  return on && on.color ? on.color : id === ME.id ? ME.color : colorOf(id);
}
function dgAvatar(id, name, cls){ const a = dgEl('i', cls || 'dg-avatar', [...(name || '?')][0] || '?'); a.style.background = dgColor(id); return a; }

/* ============================ โครงหน้าจอ ============================ */
function dgBuildUI(){
  const topbar = document.querySelector('.topbar');
  if (topbar && !DG.$('dgLauncher')){
    const b = dgEl('button', 'round'); b.type = 'button'; b.id = 'dgLauncher'; b.textContent = '🎨';
    b.setAttribute('aria-label', 'มินิเกมวาดภาพทายคำ'); b.title = 'วาดภาพทายคำ';
    b.addEventListener('click', dgOpen);
    topbar.insertBefore(b, DG.$('wxBtn') || topbar.firstChild);
  }
  document.body.insertAdjacentHTML('beforeend', `
  <section id="dgHub" class="dg-screen" hidden>
    <div class="dg-card">
      <div class="dg-head"><div><h2>🎨 วาดภาพทายคำ</h2><p class="dg-sub">สร้างห้องหรือเข้าห้องของเพื่อน เล่นได้ 2–12 คน</p></div><button class="dg-close" id="dgHubClose" aria-label="ปิด">×</button></div>
      <div class="dg-actions"><button class="btn primary" id="dgNewRoom">＋ สร้างห้องใหม่</button><button class="btn soft" id="dgHubRefresh">รีเฟรช</button></div>
      <div class="dg-room-list" id="dgRoomList"></div>
      <p class="dg-note">ห้องที่ไม่มีใครออนไลน์เกิน 3 นาทีจะปิดเองอัตโนมัติ</p>
    </div>
  </section>

  <section id="dgForm" class="dg-screen dg-over" hidden>
    <div class="dg-card">
      <div class="dg-head"><div><h2 id="dgFormTitle">สร้างห้อง</h2><p class="dg-sub">ตั้งค่าได้ใหม่ตอนอยู่ห้องรอ ก่อนเริ่มเกม</p></div><button class="dg-close" id="dgFormClose" aria-label="ปิด">×</button></div>
      <label class="dg-field">ชื่อห้อง<input id="dgFName" maxlength="40" placeholder="เช่น ห้องวาดเล่นกัน" autocomplete="off"></label>
      <div class="dg-section"><div class="dg-label">หมวดคำ <span class="dg-mini-actions"><button type="button" id="dgCatAll">เลือกทั้งหมด</button><button type="button" id="dgCatNone">ล้าง</button></span></div><div class="dg-category-grid" id="dgFCats"></div></div>
      <div class="dg-setting-grid">
        <label class="dg-field">ความยาก<select id="dgFDiff"></select></label>
        <label class="dg-field">เวลาต่อรอบ<select id="dgFTime"></select></label>
        <label class="dg-field">จำนวนรอบ<select id="dgFRounds"></select></label>
        <label class="dg-field">คนสูงสุด<select id="dgFMax"></select></label>
      </div>
      <label class="dg-field">คำของเราเอง (ไม่บังคับ) คั่นด้วย , หรือขึ้นบรรทัดใหม่
        <textarea id="dgFCustom" rows="3" maxlength="900" placeholder="เช่น แมวของเรา, โต๊ะจิ๊กซอว์, วิทยุผี"></textarea></label>
      <p class="dg-note">คำของเราจะถูกสุ่มปนกับคำของระบบ ถ้าไม่เลือกหมวดเลยจะใช้เฉพาะคำของเรา (เจ้าของห้องจะรู้คำเหล่านี้อยู่แล้ว คนอื่นมองไม่เห็น)</p>
      <div class="dg-actions"><button class="btn soft" id="dgFCancel">ยกเลิก</button><button class="btn primary" id="dgFSubmit">สร้างห้อง</button></div>
      <p class="err" id="dgFError" role="alert"></p>
    </div>
  </section>

  <section id="dgRoom" class="dg-screen dg-game-screen" hidden>
    <div class="dg-game-layout">
      <header class="dg-game-header">
        <button class="dg-close" id="dgHide" aria-label="ซ่อนเกม (ยังอยู่ในห้อง)" title="ซ่อนเกม (ยังอยู่ในห้อง)">⌂</button>
        <span class="dg-round-pill" id="dgRound">รอ</span>
        <div class="dg-game-heading"><strong id="dgTitle">ห้อง</strong><span id="dgSubTitle"></span></div>
        <span class="dg-time-pill" id="dgClock" hidden>1:30</span>
        <div class="dg-menu-wrap"><button class="dg-close" id="dgMenuBtn" aria-label="เมนู">⋯</button>
          <div class="dg-menu" id="dgMenu" hidden>
            <button id="dgMSkip">ข้ามรอบนี้</button><button id="dgMEnd">จบเกมเลย</button><button id="dgMSettings">ตั้งค่าห้อง</button><button id="dgMLeave" class="danger">ออกจากห้อง</button>
          </div></div>
      </header>
      <div class="dg-game-body">
        <div class="dg-main">
          <div class="dg-wait" id="dgWait" hidden>
            <h3 id="dgWaitName">ห้องรอ</h3>
            <div class="dg-chips" id="dgWaitChips"></div>
            <div class="dg-label" id="dgWaitCount">ผู้เล่น</div>
            <div class="dg-wait-players" id="dgWaitPlayers"></div>
            <p class="dg-note" id="dgWaitNote"></p>
            <div class="dg-actions"><button class="btn primary" id="dgStartBtn">เริ่มเกม</button><button class="btn soft" id="dgEditBtn">ตั้งค่าห้อง</button><button class="btn soft" id="dgInviteBtn">เรียกเพื่อน 🔔</button></div>
          </div>
          <div class="dg-canvas-column" id="dgStage">
            <div class="dg-canvas-frame" id="dgFrame"><canvas id="dgCanvas" width="960" height="720" aria-label="พื้นที่วาดภาพ"></canvas></div>
            <div class="dg-tools" id="dgTools" hidden>
              <div class="dg-tool-row">
                <button class="dg-tool" id="dgToolPen" aria-pressed="true"><span>✏️</span>ปากกา</button>
                <button class="dg-tool" id="dgToolFill" aria-pressed="false" title="แตะพื้นที่ปิดเพื่อเทสี"><span>🪣</span>ถังสี</button>
                <button class="dg-tool" id="dgToolEraser" aria-pressed="false"><span>🧽</span>ยางลบ</button>
                <div class="dg-seg" id="dgEMode" hidden role="group" aria-label="โหมดยางลบ">
                  <button type="button" data-m="pixel" title="ลบเฉพาะส่วนที่ลากผ่าน">เฉพาะจุด</button>
                  <button type="button" data-m="stroke" title="แตะเส้นไหนลบทั้งเส้นนั้น">ทั้งเส้น</button>
                </div>
                <label class="dg-size" title="ขนาด"><i id="dgSizeDot"></i><input type="range" id="dgSize" min="2" max="64" step="1" aria-label="ขนาดเส้น"></label>
                <button class="dg-tool" id="dgUndo" title="ย้อนเส้นล่าสุด"><span>↩️</span>ย้อน</button>
                <button class="dg-tool" id="dgClear" title="ล้างภาพทั้งหมด"><span>🗑️</span>ล้าง</button>
              </div>
              <div class="dg-color-row" id="dgColorRow">
                <button class="dg-color-cur" id="dgColorCur" aria-label="เปิดชุดสี" title="ชุดสีทั้งหมด"></button>
                <div class="dg-colors" id="dgColors" aria-label="สีล่าสุด"></div>
                <button class="dg-palette-open" id="dgPaletteOpen" aria-label="เปิดชุดสีทั้งหมด">🎨 สีทั้งหมด</button>
              </div>
            </div>
          </div>
        </div>
        <aside class="dg-side">
          <div class="dg-prompt" id="dgPrompt">
            <div class="dg-secret" id="dgSecret" hidden><small>คำที่ต้องวาด</small><strong id="dgSecretWord">—</strong></div>
            <div class="dg-clue" id="dgClue"></div>
          </div>
          <div class="dg-players" id="dgScoreList"></div>
          <div class="dg-chat">
            <div class="dg-chat-log" id="dgChatLog" aria-live="polite"></div>
            <div class="dg-notice" id="dgNotice" aria-live="polite"></div>
            <form class="dg-chat-form" id="dgChatForm" autocomplete="off">
              <input id="dgChatInput" maxlength="120" placeholder="พิมพ์ข้อความ…" enterkeyhint="send"><button type="submit" id="dgChatSend">ส่ง</button>
            </form>
          </div>
        </aside>
      </div>
      <div class="dg-palette" id="dgPalette" hidden>
        <div class="dg-palette-card">
          <div class="dg-head"><h3>เลือกสี</h3><button class="dg-close" id="dgPaletteClose" aria-label="ปิด">×</button></div>
          <div class="dg-pal-grid" id="dgPalGrid"></div>
          <div class="dg-label">สีของฉัน</div><div class="dg-pal-row" id="dgPalMine"></div>
          <div class="dg-custom">
            <label class="dg-color-pick"><input type="color" id="dgPickInput" value="#252525"><span>เลือกสีเอง</span></label>
            <input id="dgHexInput" maxlength="7" placeholder="#RRGGBB" aria-label="รหัสสี">
            <button class="dg-tool-btn" id="dgSaveColor">เก็บเข้าสีของฉัน</button>
          </div>
        </div>
      </div>
      <div class="dg-result" id="dgResult" hidden><div class="dg-result-card">
        <h3 id="dgResultTitle"></h3>
        <div class="dg-result-answer" id="dgResultAnswer"></div>
        <div class="dg-note" id="dgResultReason"></div>
        <div class="dg-result-scores" id="dgResultScores"></div>
        <div class="dg-actions"><button class="btn soft" id="dgResultView">ดูภาพ</button><button class="btn primary" id="dgNextBtn">รอบถัดไป</button><button class="btn primary" id="dgAgainBtn">เล่นอีกครั้ง</button><button class="btn soft" id="dgLeaveBtn">ออกจากห้อง</button></div>
      </div></div>
    </div>
  </section>`);

  DG.$('dgHubClose').onclick = dgCloseHub;
  DG.$('dgHubRefresh').onclick = () => dgLoadRooms(false);
  DG.$('dgNewRoom').onclick = () => dgOpenForm('create');
  DG.$('dgFormClose').onclick = DG.$('dgFCancel').onclick = dgCloseForm;
  DG.$('dgFSubmit').onclick = dgSubmitForm;
  DG.$('dgCatAll').onclick = () => dgFormCats(DG_CATS.map(c => c[0]));
  DG.$('dgCatNone').onclick = () => dgFormCats([]);
  DG.$('dgHide').onclick = dgHideRoom;
  DG.$('dgMenuBtn').onclick = e => { e.stopPropagation(); DG.$('dgMenu').hidden = !DG.$('dgMenu').hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('.dg-menu-wrap')) DG.$('dgMenu').hidden = true; });
  DG.$('dgMSkip').onclick = () => { DG.$('dgMenu').hidden = true; dgFinishRound('skipped'); };
  DG.$('dgMEnd').onclick = () => { DG.$('dgMenu').hidden = true; dgEndRoom(); };
  DG.$('dgMSettings').onclick = DG.$('dgEditBtn').onclick = () => { DG.$('dgMenu').hidden = true; dgOpenForm('edit'); };
  DG.$('dgMLeave').onclick = DG.$('dgLeaveBtn').onclick = () => { DG.$('dgMenu').hidden = true; dgLeaveRoom(); };
  DG.$('dgStartBtn').onclick = dgStartGame;
  DG.$('dgInviteBtn').onclick = dgInvite;
  DG.$('dgNextBtn').onclick = dgAdvance;
  DG.$('dgAgainBtn').onclick = dgReset;
  DG.$('dgResultView').onclick = () => { DG.resultHidden = true; DG.$('dgResult').hidden = true; };
  DG.$('dgChatForm').addEventListener('submit', e => { e.preventDefault(); dgSend(); });

  /* เครื่องมือวาด */
  DG.$('dgToolPen').onclick = () => dgSetTool('pen');
  DG.$('dgToolFill').onclick = () => dgSetTool('fill');
  DG.$('dgToolEraser').onclick = () => dgSetTool('eraser');
  DG.$('dgEMode').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b) dgSetEMode(b.dataset.m); });
  DG.$('dgSize').addEventListener('input', e => { DG.prefs[DG.tool === 'eraser' ? 'eraser' : 'pen'] = +e.target.value; dgSavePrefs(); dgRenderTools(); });
  DG.$('dgUndo').onclick = dgUndo;
  DG.$('dgClear').onclick = dgClearCanvas;
  DG.$('dgColorCur').onclick = DG.$('dgPaletteOpen').onclick = dgOpenPalette;
  DG.$('dgPaletteClose').onclick = () => { DG.$('dgPalette').hidden = true; };
  DG.$('dgPalette').addEventListener('click', e => { if (e.target === DG.$('dgPalette')) DG.$('dgPalette').hidden = true; });
  DG.$('dgPickInput').addEventListener('input', e => dgSetColor(e.target.value, true));
  DG.$('dgHexInput').addEventListener('change', e => { let v = e.target.value.trim(); if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) dgSetColor(v, true); else e.target.value = DG.prefs.color; });
  DG.$('dgSaveColor').onclick = () => { const c = DG.prefs.color; DG.prefs.mine = [c, ...DG.prefs.mine.filter(x => x !== c)].slice(0, 30); dgSavePrefs(); dgRenderPalette(); toast('เก็บสีไว้แล้ว'); };
  dgRenderPalette();

  const cv = DG.canvas = DG.$('dgCanvas');
  DG.ctx = cv.getContext('2d');
  DG.ink = document.createElement('canvas'); DG.tmp = document.createElement('canvas');
  cv.addEventListener('pointerdown', dgPointerDown);
  cv.addEventListener('pointermove', dgPointerMove);
  cv.addEventListener('pointerup', dgPointerUp);
  cv.addEventListener('pointercancel', dgPointerUp);
  cv.addEventListener('pointerleave', () => { DG.cursor = null; dgRequestRender(); });
  window.addEventListener('resize', () => { if (DG.visible) dgRequestRender(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (DG.visible) dgRequestRender(); }).observe(DG.$('dgFrame'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ if (!DG.$('dgPalette').hidden) DG.$('dgPalette').hidden = true; else if (!DG.$('dgForm').hidden) dgCloseForm(); else if (DG.visible) dgHideRoom(); else if (DG.hubOpen) dgCloseHub(); return; }
    if (!DG.visible || !dgCanDraw() || /input|textarea|select/i.test((e.target.tagName || ''))) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); dgUndo(); }
    else if (e.key === 'p') dgSetTool('pen'); else if (e.key === 'e') dgSetTool('eraser'); else if (e.key === 'g') dgSetTool('fill');
  });

  dgBuildFormOptions();
  dgRenderTools();
  DG.timers.tick = setInterval(dgTick, 250);
  DG.timers.poll = setInterval(dgPoll, 1500);
}

/* ============================ ล็อบบี้ / รายการห้อง ============================ */
function dgOpen(){
  if (!sb){ toast('ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์'); return; }
  if (DG.room && DG.room.found){ dgShowRoom(); return; }
  DG.hubOpen = true; DG.$('dgHub').hidden = false; dgLoadRooms(false);
  clearInterval(DG.timers.hub); DG.timers.hub = setInterval(() => { if (DG.hubOpen) dgLoadRooms(true); }, 4000);
}
function dgCloseHub(){ DG.hubOpen = false; DG.$('dgHub').hidden = true; clearInterval(DG.timers.hub); }
async function dgLoadRooms(silent){
  if (!sb || !ME || !ME.id) return;
  try {
    const d = await dgRpc('dg3_list_rooms', { p_player_id: ME.id });
    DG.rooms = d.rooms || []; DG.mineRoom = d.my_room_id || null;
    if (DG.mineRoom && !DG.roomId){ DG.roomId = DG.mineRoom; await dgSync(true); if (DG.hubOpen && DG.room && DG.room.found){ dgCloseHub(); dgShowRoom(); return; } }
    dgRenderHub();
  } catch (e){ if (!silent) toast('โหลดรายการห้องไม่สำเร็จ'); }
}
function dgRenderHub(){
  const box = DG.$('dgRoomList'); box.replaceChildren();
  if (!DG.rooms.length){ box.appendChild(dgEl('div', 'dg-empty', 'ยังไม่มีห้อง กด "สร้างห้องใหม่" แล้วชวนเพื่อนได้เลย')); return; }
  DG.rooms.forEach(r => {
    const card = dgEl('div', 'dg-room-card');
    const info = dgEl('div', 'dg-room-info');
    info.append(dgEl('strong', '', r.name));
    const playing = r.status !== 'waiting';
    info.append(dgEl('span', 'dg-room-meta', '👑 ' + (r.host_name || '—') + ' · ' + r.count + '/' + r.max_players + ' คน · ' + (playing ? 'กำลังเล่น รอบ ' + r.round_no + '/' + r.total_rounds : 'รอเริ่ม')));
    info.append(dgEl('span', 'dg-room-names', (r.names || []).join(', ')));
    const btn = dgEl('button', 'btn ' + (r.id === DG.mineRoom ? 'soft' : 'primary'), r.id === DG.mineRoom ? 'กลับเข้าห้อง' : r.count >= r.max_players ? 'เต็ม' : playing ? 'เข้าเล่นกลางเกม' : 'เข้าร่วม');
    btn.disabled = r.count >= r.max_players && r.id !== DG.mineRoom;
    btn.onclick = () => dgJoin(r.id);
    card.append(info, btn); box.appendChild(card);
  });
}
async function dgJoin(id){
  if (DG.busy) return; DG.busy = true;
  try {
    const st = await dgRpc('dg3_join_room', { p_player_id: ME.id, p_name: dgMeName(), p_room_id: id });
    dgEnterRoom(st); dgBroadcast('rooms'); dgBroadcast('room');
  } catch (e){ toast(dgError(e)); dgLoadRooms(true); }
  finally { DG.busy = false; }
}

/* ============================ สร้าง / แก้ตั้งค่าห้อง ============================ */
function dgBuildFormOptions(){
  const fill = (id, rows) => { const s = DG.$(id); rows.forEach(([v, l]) => { const o = dgEl('option', '', l); o.value = v; s.appendChild(o); }); };
  fill('dgFDiff', DG_DIFFS); fill('dgFTime', DG_TIMES); fill('dgFRounds', DG_ROUNDS.map(n => [n, n + ' รอบ']));
  fill('dgFMax', Array.from({ length: 11 }, (_, i) => [i + 2, (i + 2) + ' คน']));
  const box = DG.$('dgFCats');
  DG_CATS.forEach(([id, label, emoji]) => {
    const l = dgEl('label', 'dg-category'); const i = document.createElement('input'); i.type = 'checkbox'; i.value = id;
    l.append(i, dgEl('span', '', emoji + ' ' + label)); box.appendChild(l);
  });
}
function dgFormCats(ids){ DG.$('dgFCats').querySelectorAll('input').forEach(i => { i.checked = ids.includes(i.value); }); }
function dgDefaults(){ return Object.assign({ categories: ['animals', 'food', 'objects', 'cozy'], difficulty: 'normal', duration_seconds: 90, total_rounds: 5, max_players: 8, custom_words: [] }, LS.get('jt-dg-settings', {})); }
function dgOpenForm(mode){
  DG.form.mode = mode; dgCloseHubKeep();
  const edit = mode === 'edit' && DG.room && DG.room.found;
  const s = edit ? DG.room.settings : dgDefaults();
  DG.$('dgFormTitle').textContent = edit ? 'ตั้งค่าห้อง' : 'สร้างห้อง';
  DG.$('dgFSubmit').textContent = edit ? 'บันทึก' : 'สร้างห้อง';
  DG.$('dgFName').value = edit ? DG.room.name : (dgMeName() ? 'ห้องของ ' + dgMeName() : '');
  dgFormCats(s.categories || []);
  DG.$('dgFDiff').value = s.difficulty; DG.$('dgFTime').value = s.duration_seconds; DG.$('dgFRounds').value = s.total_rounds; DG.$('dgFMax').value = s.max_players;
  DG.$('dgFCustom').value = (s.custom_words || []).join(', ');
  DG.$('dgFError').textContent = ''; DG.$('dgForm').hidden = false;
}
function dgCloseHubKeep(){ DG.$('dgHub').hidden = true; }
function dgCloseForm(){ DG.$('dgForm').hidden = true; if (DG.hubOpen && !DG.room) DG.$('dgHub').hidden = false; }
function dgReadForm(){
  const cats = [...DG.$('dgFCats').querySelectorAll('input:checked')].map(i => i.value);
  const custom = DG.$('dgFCustom').value.split(/[,\n，、]+/).map(x => x.trim()).filter(Boolean).slice(0, 60);
  return { categories: cats, difficulty: DG.$('dgFDiff').value, duration_seconds: +DG.$('dgFTime').value, total_rounds: +DG.$('dgFRounds').value, max_players: +DG.$('dgFMax').value, custom_words: custom };
}
async function dgSubmitForm(){
  if (DG.busy) return;
  const s = dgReadForm(), name = DG.$('dgFName').value.trim();
  if (!s.categories.length && !s.custom_words.length){ DG.$('dgFError').textContent = 'เลือกอย่างน้อยหนึ่งหมวด หรือใส่คำของเราเอง'; return; }
  DG.busy = true; DG.$('dgFSubmit').disabled = true;
  try {
    let st;
    if (DG.form.mode === 'edit' && DG.room && DG.room.found) st = await dgRpc('dg3_update_settings', { p_room_id: DG.roomId, p_player_id: ME.id, p_name: name, p_settings: s });
    else { LS.set('jt-dg-settings', s); st = await dgRpc('dg3_create_room', { p_player_id: ME.id, p_name: dgMeName(), p_room_name: name, p_settings: s }); }
    DG.$('dgForm').hidden = true;
    if (DG.form.mode === 'edit'){ dgApplyState(st); dgBroadcast('room'); }
    else { dgEnterRoom(st); dgBroadcast('rooms'); }
    dgBroadcast('rooms');
  } catch (e){ DG.$('dgFError').textContent = dgError(e); }
  finally { DG.busy = false; DG.$('dgFSubmit').disabled = false; }
}

/* ============================ เข้า / ออกห้อง / ซิงก์ ============================ */
function dgEnterRoom(st){
  DG.roomId = st.room_id; DG.room = null; dgResetRound(true); DG.chat = []; DG.chatLast = 0;
  dgCloseHub(); DG.$('dgForm').hidden = true;
  dgApplyState(st, true); dgShowRoom();
  dgFetchChat(true); dgFetchStrokes();
}
function dgShowRoom(){
  if (!DG.room) return; DG.visible = true; DG.hubOpen = false; DG.$('dgHub').hidden = true; DG.$('dgRoom').hidden = false;
  dgRender(); requestAnimationFrame(() => { dgRequestRender(); dgScrollChat(true); });
}
function dgHideRoom(){ DG.visible = false; DG.$('dgRoom').hidden = true; DG.$('dgMenu').hidden = true; }
function dgLeaveLocal(msg){
  DG.roomId = null; DG.room = null; DG.chat = []; DG.chatLast = 0; dgResetRound(true);
  clearTimeout(DG.timers.next); DG.$('dgRoom').hidden = true; DG.visible = false; DG.$('dgResult').hidden = true;
  dgLauncherBadge(); if (msg) toast(msg);
}
async function dgLeaveRoom(){
  if (!DG.room) return;
  if (DG.room.status !== 'waiting' && DG.room.status !== 'ended' && !confirm('ออกจากห้องนี้ใช่ไหม?')) return;
  const id = DG.roomId; dgLeaveLocal();
  try { await dgRpc('dg3_leave_room', { p_room_id: id, p_player_id: ME.id }); dgBroadcast('room', {}, id); dgBroadcast('rooms'); } catch (e){}
  dgOpen();
}
function dgLauncherBadge(){ const b = DG.$('dgLauncher'); if (b) b.classList.toggle('in-room', !!(DG.room && DG.room.found)); }

async function dgSync(silent){
  if (!sb || !DG.roomId) return null;
  try {
    const st = await dgRpc('dg3_get_state', { p_room_id: DG.roomId, p_player_id: ME.id });
    DG.lastSyncAt = Date.now();
    if (!st || !st.found){ dgLeaveLocal(silent ? '' : 'ห้องนี้ถูกปิดแล้ว'); return null; }
    dgApplyState(st);
    return st;
  } catch (e){ if (!silent) toast('โหลดสถานะห้องไม่สำเร็จ'); return null; }
}
function dgPoll(){
  if (S.connected && S.chan && DG.restored !== S.chan){ DG.restored = S.chan; if (!DG.roomId) dgLoadRooms(true); else dgSync(true); }
  if (!S.connected) DG.restored = null;
  if (!DG.roomId || DG.busy) return;
  const gap = DG.room && DG.room.status === 'drawing' ? 4000 : 6000;
  if (Date.now() - DG.lastSyncAt > gap){ DG.lastSyncAt = Date.now(); dgSync(true).then(() => { dgFetchChat(false); if (DG.room && DG.room.status === 'drawing') dgFetchStrokes(); }); }
}

function dgResetRound(full){
  DG.strokes.clear(); DG.order = []; DG.hidden.clear(); DG.live.clear(); DG.own.clear(); DG.mine = []; DG.cur = null; DG.pending = [];
  DG.resultHidden = false; DG.inkDirty = true;
  if (full){ DG.lastPrev = null; DG.seenResult = ''; }
  dgRequestRender();
}
function dgApplyState(st, first){
  if (st.is_member === false && st.status !== 'ended' && !first){ dgLeaveLocal('คุณไม่ได้อยู่ในห้องนี้แล้ว'); return; }
  const prev = DG.lastPrev, me = (st.players || []).find(p => p.player_id === ME.id);
  DG.skew = st.server_now ? Date.parse(st.server_now) - Date.now() : DG.skew;
  DG.room = st; DG.roomId = st.room_id;
  const mySolved = !!(me && me.solved);
  const roundChanged = !prev || prev.round !== st.round_no;
  const statusChanged = !prev || prev.status !== st.status;
  if (roundChanged){ dgResetRound(false); DG.mine = []; }
  if (!prev || roundChanged || statusChanged || prev.solved !== mySolved){ DG.chatReset = true; dgFetchChat(true); }
  if (roundChanged || (statusChanged && st.status === 'drawing')) dgFetchStrokes();
  if (prev && prev.status === 'waiting' && st.status === 'drawing' && !DG.visible){ dgShowRoom(); toast('เกมเริ่มแล้ว!'); }
  if (prev && statusChanged && st.status !== 'waiting' && DG.room.drawer_id === ME.id && st.status === 'drawing') toast('ตาคุณวาดแล้ว!');
  DG.lastPrev = { round: st.round_no, status: st.status, solved: mySolved };
  if (statusChanged || roundChanged){ DG.resultHidden = false; dgScheduleNext(); }
  dgLauncherBadge();
  if (DG.visible) dgRender();
}

/* ============================ วาดหน้าจอ ============================ */
const dgIsDrawer = () => !!DG.room && DG.room.status === 'drawing' && DG.room.drawer_id === ME.id;
const dgCanDraw = () => dgIsDrawer() && !DG.busy;
function dgMe(){ return DG.room && (DG.room.players || []).find(p => p.player_id === ME.id); }
function dgSettingChips(s){
  const chips = [];
  (s.categories || []).slice(0, 5).forEach(c => chips.push(dgCats(c)[2] + ' ' + dgCats(c)[1]));
  if ((s.categories || []).length > 5) chips.push('+' + (s.categories.length - 5) + ' หมวด');
  const cc = s.custom_count != null ? s.custom_count : (s.custom_words || []).length; if (cc) chips.push('⭐ คำเอง ' + cc);
  chips.push('ระดับ ' + (DG_DIFFS.find(d => d[0] === s.difficulty) || [0, s.difficulty])[1]);
  chips.push('⏱ ' + (DG_TIMES.find(t => t[0] === +s.duration_seconds) || [0, '—'])[1]);
  chips.push('🔁 ' + s.total_rounds + ' รอบ'); chips.push('👥 สูงสุด ' + s.max_players);
  return chips;
}
function dgRender(){
  const r = DG.room; if (!r || !r.found) return;
  const waiting = r.status === 'waiting', drawing = r.status === 'drawing', ended = r.status === 'ended';
  const drawer = dgIsDrawer(), isHost = !!r.is_host, active = (r.players || []).filter(p => !p.left);
  DG.$('dgRound').textContent = waiting ? 'ห้องรอ' : 'รอบ ' + r.round_no + '/' + r.total_rounds;
  DG.$('dgTitle').textContent = r.name;
  const dn = (r.players || []).find(p => p.player_id === r.drawer_id);
  DG.$('dgSubTitle').textContent = waiting ? active.length + '/' + r.max_players + ' คน' : ended ? 'จบเกม' : r.status === 'reveal' ? 'เฉลย' : drawer ? '🎨 คุณกำลังวาด: ' + (r.secret_word || '…') : '🎨 ' + (dn ? dn.name : '—') + ' กำลังวาด';
  DG.$('dgClock').hidden = !drawing;
  DG.$('dgMSkip').hidden = !(drawing && (isHost || drawer));
  DG.$('dgMEnd').hidden = !(isHost && !waiting && !ended);
  DG.$('dgMSettings').hidden = !(isHost && waiting);

  DG.$('dgWait').hidden = !waiting; DG.$('dgStage').hidden = waiting;
  if (waiting) dgRenderWait(active);

  const secret = DG.$('dgSecret'); secret.hidden = !(drawer && r.secret_word); DG.$('dgSecretWord').textContent = r.secret_word || '—';
  const clue = DG.$('dgClue'), cat = dgCats(r.category || '');
  clue.hidden = waiting || drawer;
  clue.textContent = ended ? '' : r.status === 'reveal' ? 'คำตอบคือ: ' + (r.answer || '—') : 'หมวด: ' + cat[2] + ' ' + cat[1] + (r.word_length ? ' · ' + r.word_length + ' ตัวอักษร' : '');
  DG.$('dgPrompt').hidden = waiting || ended || (drawer && !r.secret_word);
  DG.$('dgTools').hidden = !drawer;
  DG.canvas.classList.toggle('dg-readonly', !drawer);
  dgRenderTools(); dgRenderScores(); dgRenderChatInput(); dgRenderResult();
  dgRequestRender();
}
function dgRenderWait(active){
  const r = DG.room, isHost = r.is_host;
  DG.$('dgWaitName').textContent = r.name;
  const chips = DG.$('dgWaitChips'); chips.replaceChildren(); dgSettingChips(r.settings).forEach(c => chips.appendChild(dgEl('span', 'dg-chip', c)));
  DG.$('dgWaitCount').textContent = 'ผู้เล่นในห้อง ' + active.length + '/' + r.max_players;
  const box = DG.$('dgWaitPlayers'); box.replaceChildren();
  active.forEach(p => {
    const row = dgEl('div', 'dg-score-row'); row.append(dgAvatar(p.player_id, p.name), dgEl('span', 'dg-score-name', p.name + (p.player_id === ME.id ? ' (คุณ)' : '')),
      dgEl('span', 'dg-status', (p.is_host ? '👑 เจ้าของห้อง' : '') + (p.away ? ' 💤' : ''))); box.appendChild(row);
  });
  DG.$('dgStartBtn').hidden = !isHost; DG.$('dgEditBtn').hidden = !isHost; DG.$('dgInviteBtn').hidden = false;
  DG.$('dgStartBtn').disabled = active.length < 2 || DG.busy;
  DG.$('dgWaitNote').textContent = isHost ? (active.length < 2 ? 'รอเพื่อนอย่างน้อย 1 คนก่อนเริ่มเกมได้ กด "เรียกเพื่อน" เพื่อส่งสัญญาณไปที่ห้องนั่งเล่น' : 'พร้อมแล้วกด "เริ่มเกม" ได้เลย เพื่อนที่เข้าห้องช้าจะเข้ามาเล่นกลางเกมได้') : 'รอเจ้าของห้องกดเริ่มเกม · คุยแชทรอได้ตรงนี้เลย';
}
function dgRenderScores(){
  const r = DG.room, box = DG.$('dgScoreList'); box.replaceChildren();
  const list = (r.players || []).filter(p => !p.left || r.status === 'ended');
  if (r.status !== 'waiting') list.sort((a, b) => b.score - a.score || a.join_order - b.join_order);
  list.forEach(p => {
    const row = dgEl('div', 'dg-score-row' + (p.player_id === ME.id ? ' me' : '') + (p.left ? ' gone' : ''));
    const tag = p.left ? 'ออกแล้ว' : p.is_drawer && r.status === 'drawing' ? '✏️ วาด' : p.solved && r.status === 'drawing' ? '✓ ถูก' : p.away ? '💤' : '';
    row.append(dgAvatar(p.player_id, p.name), dgEl('span', 'dg-score-name', (p.is_host ? '👑 ' : '') + p.name), dgEl('span', 'dg-status', tag), dgEl('strong', 'dg-score-points', String(p.score)));
    box.appendChild(row);
  });
  box.hidden = r.status === 'waiting';
}
function dgRenderChatInput(){
  const r = DG.room, me = dgMe(), inp = DG.$('dgChatInput');
  let ph = 'พิมพ์ข้อความ…';
  if (r.status === 'drawing'){ ph = dgIsDrawer() ? 'คุยกับคนที่ทายถูกแล้ว…' : me && me.solved ? 'ทายถูกแล้ว! คุยกับคนที่ถูกเหมือนกัน…' : 'พิมพ์คำตอบ หรือคุยกันได้เลย…'; }
  inp.placeholder = ph;
  DG.$('dgNotice').textContent = DG.notice; DG.$('dgNotice').className = 'dg-notice ' + DG.noticeKind;
}
function dgRenderResult(){
  const r = DG.room, box = DG.$('dgResult');
  const show = (r.status === 'reveal' || r.status === 'ended') && !DG.resultHidden;
  box.hidden = !show; if (!show) return;
  const ended = r.status === 'ended';
  const ranked = [...(r.players || [])].sort((a, b) => b.score - a.score || a.join_order - b.join_order);
  const top = ranked.length ? ranked[0].score : 0, winners = ranked.filter(p => p.score === top && top > 0);
  DG.$('dgResultTitle').textContent = ended ? (winners.length > 1 ? '🏆 เสมอกัน!' : winners.length ? '🏆 ผู้ชนะ: ' + winners[0].name : 'จบเกม') : 'จบรอบที่ ' + r.round_no + '/' + r.total_rounds;
  DG.$('dgResultAnswer').textContent = ended && !r.answer ? 'ขอบคุณที่เล่นด้วยกัน' : (ended ? 'คำสุดท้าย: ' : '') + (r.answer || '—');
  const solved = (r.players || []).filter(p => p.solved && !p.is_drawer && !p.left).map(p => p.name);
  DG.$('dgResultReason').textContent = ended ? 'คะแนนรวมเรียงจากมากไปน้อย' : (solved.length ? 'ทายถูก: ' + solved.join(', ') : 'รอบนี้ไม่มีใครทายถูก') + ' · รอบต่อไปเริ่มเองในไม่กี่วินาที';
  const sc = DG.$('dgResultScores'); sc.replaceChildren();
  ranked.forEach((p, i) => { const l = dgEl('div', 'dg-score-row'); l.append(dgEl('span', 'dg-score-name', (i + 1) + '. ' + p.name + (ended && p.score === top && top > 0 ? ' 🏆' : '') + (p.left ? ' (ออกแล้ว)' : '')), dgEl('strong', 'dg-score-points', p.score + ' คะแนน')); sc.appendChild(l); });
  const member = r.is_member;
  DG.$('dgNextBtn').hidden = ended || !member; DG.$('dgNextBtn').textContent = r.round_no >= r.total_rounds ? 'ดูผลสรุป' : 'รอบถัดไป';
  DG.$('dgAgainBtn').hidden = !(ended && r.is_host); DG.$('dgResultView').hidden = false;
  DG.$('dgLeaveBtn').hidden = false;
}

/* ============================ ตัวจับเวลา / เปลี่ยนรอบ ============================ */
function dgScheduleNext(){
  clearTimeout(DG.timers.next);
  if (!DG.room || DG.room.status !== 'reveal' || !DG.room.is_member) return;
  const r = DG.room.round_no;
  DG.timers.next = setTimeout(() => { if (DG.room && DG.room.status === 'reveal' && DG.room.round_no === r) dgAdvance(); }, 6500 + Math.random() * 700);
}
function dgTick(){
  const r = DG.room; if (!r || r.status !== 'drawing' || !r.is_member) return;
  const clock = DG.$('dgClock');
  if (!r.ends_at){ clock.textContent = '∞'; }
  else {
    const left = Math.max(0, Math.ceil((Date.parse(r.ends_at) - dgNow()) / 1000));
    clock.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'); clock.classList.toggle('low', left <= 10);
    if (left <= 0 && !DG.busy && Date.now() - DG.lastAway > 2500){ DG.lastAway = Date.now(); dgFinishRound('timeout'); return; }
  }
  const drawer = (r.players || []).find(p => p.player_id === r.drawer_id);
  if (drawer && drawer.away && r.drawer_id !== ME.id && Date.now() - DG.lastAway > 8000){ DG.lastAway = Date.now(); dgFinishRound('drawer_away'); }
}

/* ============================ การกระทำในห้อง ============================ */
async function dgStartGame(){
  if (DG.busy || !DG.room) return; DG.busy = true; dgRender();
  try { const st = await dgRpc('dg3_start', { p_room_id: DG.roomId, p_player_id: ME.id }); dgApplyState(st); dgBroadcast('room'); dgBroadcast('rooms'); }
  catch (e){ toast(dgError(e)); }
  finally { DG.busy = false; dgRender(); }
}
function dgInvite(){
  dgBroadcast('rooms'); dgBroadcast('invite', { by: dgMeName(), name: DG.room ? DG.room.name : '' });
  toast('ส่งสัญญาณเรียกเพื่อนแล้ว');
}
async function dgFinishRound(reason){
  if (!DG.room || DG.room.status !== 'drawing') return;
  try {
    const d = await dgRpc('dg3_finish_round', { p_room_id: DG.roomId, p_round_no: DG.room.round_no, p_player_id: ME.id, p_reason: reason });
    if (d && d.state){ dgApplyState(d.state); dgBroadcast('room'); } else if (d && d.stale) dgSync(true);
  } catch (e){ if (reason === 'skipped') toast(dgError(e)); }
}
async function dgAdvance(){
  clearTimeout(DG.timers.next);
  if (!DG.room || DG.room.status !== 'reveal' || DG.busy) return; DG.busy = true;
  try { const st = await dgRpc('dg3_advance', { p_room_id: DG.roomId, p_round_no: DG.room.round_no, p_player_id: ME.id }); dgApplyState(st); dgBroadcast('room'); }
  catch (e){ toast(dgError(e)); }
  finally { DG.busy = false; }
}
async function dgEndRoom(){
  if (!DG.room || !DG.room.is_host || !confirm('จบเกมตอนนี้ใช่ไหม? ระบบจะสรุปคะแนนที่มีอยู่')) return;
  try { const st = await dgRpc('dg3_end_room', { p_room_id: DG.roomId, p_player_id: ME.id }); dgApplyState(st); dgBroadcast('room'); dgBroadcast('rooms'); } catch (e){ toast(dgError(e)); }
}
async function dgReset(){
  if (DG.busy || !DG.room) return; DG.busy = true;
  try { const st = await dgRpc('dg3_reset', { p_room_id: DG.roomId, p_player_id: ME.id }); dgResetRound(true); dgApplyState(st); dgBroadcast('room'); dgBroadcast('rooms'); }
  catch (e){ toast(dgError(e)); }
  finally { DG.busy = false; }
}

/* ============================ แชท + ทายคำ ============================ */
async function dgSend(){
  const inp = DG.$('dgChatInput'), text = inp.value.trim();
  if (!text || !DG.room || DG.sending) return;
  DG.sending = true; DG.notice = ''; DG.noticeKind = '';
  try {
    const d = await dgRpc('dg3_send', { p_room_id: DG.roomId, p_round_no: DG.room.round_no, p_player_id: ME.id, p_text: text });
    if (d && d.throttled){ DG.sending = false; return; }
    if (d && d.ok){ inp.value = ''; if (d.correct){ DG.notice = 'ถูกต้อง! +' + d.score_delta + ' คะแนน 🎉'; DG.noticeKind = 'good'; } }
    else if (d && d.message){ DG.notice = d.message; DG.noticeKind = 'bad'; }
    else if (d && d.stale){ inp.value = ''; }
    if (d && d.expired) dgSync(true);
    await dgFetchChat(false); dgBroadcast('chat'); if (d && d.correct){ dgBroadcast('room'); dgSync(true); }
  } catch (e){ DG.notice = dgError(e); DG.noticeKind = 'bad'; }
  finally {
    DG.sending = false; if (DG.room) dgRenderChatInput();
    clearTimeout(DG.timers.notice); DG.timers.notice = setTimeout(() => { DG.notice = ''; DG.noticeKind = ''; if (DG.room) dgRenderChatInput(); }, 4500);
    inp.focus();
  }
}
async function dgFetchChat(reset){
  if (!sb || !DG.roomId) return;
  if (DG.chatBusy){ DG.chatAgain = DG.chatAgain || reset; return; }
  DG.chatBusy = true; const wantReset = reset || DG.chatReset; const id = DG.roomId;
  try {
    const rows = await dgRpc('dg3_get_chat', { p_room_id: id, p_player_id: ME.id, p_after: wantReset ? 0 : DG.chatLast });
    if (id !== DG.roomId) return;
    if (wantReset){ DG.chat = []; DG.chatReset = false; }
    rows.forEach(m => { if (!DG.chat.some(x => x.id === m.id)) DG.chat.push(m); });
    DG.chat.sort((a, b) => a.id - b.id); if (DG.chat.length > 300) DG.chat = DG.chat.slice(-300);
    DG.chatLast = DG.chat.length ? DG.chat[DG.chat.length - 1].id : 0;
    dgRenderChat();
  } catch (e){}
  finally { DG.chatBusy = false; if (DG.chatAgain){ DG.chatAgain = false; dgFetchChat(false); } }
}
function dgRenderChat(){
  const log = DG.$('dgChatLog'); const near = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.replaceChildren();
  DG.chat.forEach(m => {
    if (m.kind === 'system'){ log.appendChild(dgEl('div', 'dg-msg sys', m.body)); return; }
    if (m.kind === 'correct'){ const d = dgEl('div', 'dg-msg ok'); d.textContent = '✓ ' + (m.name || '—') + ' ทายถูกแล้ว!'; log.appendChild(d); return; }
    const d = dgEl('div', 'dg-msg' + (m.audience === 'solved' ? ' inner' : '') + (m.player_id === ME.id ? ' mine' : ''));
    const n = dgEl('b', '', (m.name || '—') + ' '); n.style.color = dgColor(m.player_id);
    d.append(n, document.createTextNode(m.body));
    if (m.audience === 'solved') d.title = 'เห็นเฉพาะคนวาดกับคนที่ทายถูกแล้ว';
    log.appendChild(d);
  });
  if (near) dgScrollChat(true);
}
function dgScrollChat(force){ const log = DG.$('dgChatLog'); if (log) log.scrollTop = log.scrollHeight; }

/* ============================ เครื่องมือวาด ============================ */
function dgSetTool(t){ DG.tool = t; if (t === 'eraser'){ DG.cursor = null; } dgRenderTools(); dgRequestRender(); }
function dgSetEMode(m){ DG.eMode = m; DG.prefs.eMode = m; dgSavePrefs(); dgRenderTools(); }
function dgRenderTools(){
  const er = DG.tool === 'eraser';
  const fl = DG.tool === 'fill';
  DG.$('dgToolFill').setAttribute('aria-pressed', String(fl));
  DG.$('dgToolPen').setAttribute('aria-pressed', String(!er && !fl)); DG.$('dgToolEraser').setAttribute('aria-pressed', String(er));
  DG.$('dgEMode').hidden = !er;
  DG.$('dgEMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === DG.eMode)));
  DG.$('dgColorRow').classList.toggle('dim', er);
  DG.$('dgSize').parentElement.style.visibility = fl ? 'hidden' : '';
  const size = er ? DG.prefs.eraser : DG.prefs.pen; DG.$('dgSize').value = size;
  const dot = DG.$('dgSizeDot'); const px = Math.max(3, Math.min(26, size * .45)); dot.style.width = dot.style.height = px + 'px';
  dot.style.background = er ? '#9a8a74' : DG.prefs.color;
  DG.$('dgColorCur').style.background = DG.prefs.color;
  DG.$('dgUndo').disabled = !DG.mine.length;
  const q = DG.$('dgColors'); q.replaceChildren();
  const list = [...new Set([...DG.prefs.recent, ...DG_QUICK])].slice(0, 12);
  list.forEach(c => { const b = dgEl('button', 'dg-color'); b.style.background = c; b.title = c.toUpperCase(); b.setAttribute('aria-label', 'สี ' + c); b.setAttribute('aria-pressed', String(c === DG.prefs.color)); b.onclick = () => dgSetColor(c, false); q.appendChild(b); });
}
function dgSetColor(c, remember){
  if (!/^#[0-9a-f]{6}$/i.test(c)) return; c = c.toLowerCase();
  DG.prefs.color = c;
  if (remember !== false) DG.prefs.recent = [c, ...DG.prefs.recent.filter(x => x !== c)].slice(0, 10);
  if (DG.tool === 'eraser') DG.tool = 'pen';
  dgSavePrefs(); dgRenderTools(); dgRenderPalette();
}
function dgOpenPalette(){ dgRenderPalette(); DG.$('dgPalette').hidden = false; }
function dgSwatch(c, extra){ const b = dgEl('button', 'dg-sw' + (extra || '')); b.type = 'button'; b.style.background = c; b.title = c.toUpperCase(); b.setAttribute('aria-label', 'สี ' + c); b.setAttribute('aria-pressed', String(c === DG.prefs.color)); b.onclick = () => dgSetColor(c, true); return b; }
function dgRenderPalette(){
  const g = DG.$('dgPalGrid'); if (!g) return; g.replaceChildren();
  DG_GRID.forEach(c => g.appendChild(dgSwatch(c))); DG_GRAYS.forEach(c => g.appendChild(dgSwatch(c, c === '#ffffff' ? ' light' : ''))); DG_SKINS.forEach(c => g.appendChild(dgSwatch(c)));
  const m = DG.$('dgPalMine'); m.replaceChildren();
  if (!DG.prefs.mine.length) m.appendChild(dgEl('span', 'dg-palette-empty', 'ยังไม่มี เลือกสีแล้วกด "เก็บเข้าสีของฉัน"'));
  DG.prefs.mine.forEach(c => m.appendChild(dgSwatch(c)));
  DG.$('dgPickInput').value = DG.prefs.color; DG.$('dgHexInput').value = DG.prefs.color.toUpperCase();
}

/* ---------- ลาก / วาด ---------- */
const dgR4 = v => Math.round(v * 10000) / 10000;
function dgPt(e){ const r = DG.canvas.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
const dgSize = () => (DG.tool === 'eraser' ? DG.prefs.eraser : DG.prefs.pen) / DG_REF;
function dgNewId(){ return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'dg-' + ME.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }
function dgPointerDown(e){
  if (!dgCanDraw() || DG.cur) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault(); try { DG.canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const [x, y] = dgPt(e);
  if (DG.tool === 'fill'){ dgFillAt(x, y); return; }
  if (DG.tool === 'eraser' && DG.eMode === 'stroke'){ DG.cur = { type: 'sweep', pointerId: e.pointerId, gone: [] }; DG.cursor = [x, y]; dgSweep(x, y); dgRequestRender(); return; }
  const erase = DG.tool === 'eraser', id = dgNewId();
  const s = { id, color: erase ? '#ffffff' : DG.prefs.color, width: dgSize(), erase, points: [dgR4(x), dgR4(y), dgR4(x), dgR4(y)] };
  DG.cur = { type: 'ink', pointerId: e.pointerId, stroke: s }; DG.live.set(id, s); DG.pending = [s.points[0], s.points[1]];
  DG.cursor = [x, y]; dgFlushLive(true); dgRequestRender();
}
function dgPointerMove(e){
  const [x, y] = dgPt(e);
  if (DG.tool === 'eraser' && dgIsDrawer() && e.pointerType !== 'touch'){ DG.cursor = [x, y]; if (!DG.cur) dgRequestRender(); }
  const c = DG.cur; if (!c || e.pointerId !== c.pointerId) return; e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const W = DG.canvas.clientWidth || 1, H = DG.canvas.clientHeight || 1;
  for (const ev of evs){
    const [px, py] = dgPt(ev);
    if (c.type === 'sweep'){ dgSweep(px, py); DG.cursor = [px, py]; continue; }
    const p = c.stroke.points, n = p.length; if (n >= 5990) break;
    if (Math.hypot((px - p[n - 2]) * W, (py - p[n - 1]) * H) > 1.4){ const a = dgR4(px), b = dgR4(py); p.push(a, b); DG.pending.push(a, b); DG.cursor = [px, py]; }
  }
  if (c.type === 'ink') dgFlushLive(false);
  dgRequestRender();
}
function dgPointerUp(e){
  const c = DG.cur; if (!c || e.pointerId !== c.pointerId) return; e.preventDefault(); DG.cur = null;
  if (c.type === 'sweep'){ dgCommitSweep(c); dgRequestRender(); return; }
  dgFlushLive(true); dgSaveStroke(c.stroke);
}
function dgFlushLive(force){
  if (!DG.cur || DG.cur.type !== 'ink' || !DG.pending.length) return;
  const now = Date.now(); if (!force && now - DG.lastLiveAt < 60) return;
  const s = DG.cur.stroke, pts = DG.pending.splice(0); DG.lastLiveAt = now;
  dgBroadcast('live', { round: DG.room.round_no, id: s.id, color: s.color, width: s.width, erase: s.erase, pts });
}
async function dgSaveStroke(s){
  const round = DG.room ? DG.room.round_no : 0, roomId = DG.roomId;
  if (s.points.length < 4){ DG.live.delete(s.id); dgRequestRender(); return; }
  try {
    await dgRpc('dg3_save_stroke', { p_room_id: roomId, p_round_no: round, p_player_id: ME.id, p_stroke: s });
    if (!DG.room || DG.room.round_no !== round) return;
    const body = { id: s.id, color: s.color, width: s.width, erase: s.erase, points: s.points }; if (s.fill) body.fill = true;
    DG.strokes.set(s.id, body); if (!DG.order.includes(s.id)) DG.order.push(s.id);
    DG.own.set(s.id, Date.now()); DG.mine.push(s.id); DG.live.delete(s.id); DG.inkDirty = true;
    dgBroadcast('sdone', { round, id: s.id }); dgRenderTools(); dgRequestRender();
  } catch (e){ DG.live.delete(s.id); dgRequestRender(); dgBroadcast('sdone', { round, id: s.id, failed: true }); toast('บันทึกเส้นไม่สำเร็จ: ' + dgError(e)); }
}

/* ---------- ถังสี ----------
   คำนวณพื้นที่ที่จะเทสีบนตารางความละเอียดคงที่ (DG_FW x DG_FH) แล้วส่งเป็น "แถบแนวนอน" (run) ในรูปเส้นชนิด fill
   ทุกเครื่องจึงเห็นผลเหมือนกันเป๊ะ ไม่ขึ้นกับขนาดหน้าจอ และ undo/ยางลบก็ใช้กับมันได้เหมือนเส้นทั่วไป */
const DG_FW = 640, DG_FH = 480, DG_MAX_RUNS = 1400;
let dgFillBusy = false;
function dgFillRaster(){
  const c = document.createElement('canvas'); c.width = DG_FW; c.height = DG_FH;
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fffdf8'; g.fillRect(0, 0, DG_FW, DG_FH);
  for (const id of DG.order){ if (DG.hidden.has(id)) continue; const s = DG.strokes.get(id); if (s) dgDrawStroke(g, s, DG_FW, DG_FH); }
  return g.getImageData(0, 0, DG_FW, DG_FH).data;
}
function dgFillMask(px, sx, sy){
  const N = DG_FW * DG_FH, o = (sy * DG_FW + sx) * 4, r0 = px[o], g0 = px[o + 1], b0 = px[o + 2];
  const TOL = 96, near = i => Math.abs(px[i * 4] - r0) + Math.abs(px[i * 4 + 1] - g0) + Math.abs(px[i * 4 + 2] - b0) <= TOL;
  const mask = new Uint8Array(N), stack = [sy * DG_FW + sx]; mask[stack[0]] = 1;
  while (stack.length){
    const i = stack.pop(), x = i % DG_FW, y = (i / DG_FW) | 0;
    if (x > 0 && !mask[i - 1] && near(i - 1)){ mask[i - 1] = 1; stack.push(i - 1); }
    if (x < DG_FW - 1 && !mask[i + 1] && near(i + 1)){ mask[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !mask[i - DG_FW] && near(i - DG_FW)){ mask[i - DG_FW] = 1; stack.push(i - DG_FW); }
    if (y < DG_FH - 1 && !mask[i + DG_FW] && near(i + DG_FW)){ mask[i + DG_FW] = 1; stack.push(i + DG_FW); }
  }
  // ขยายออก 1 ช่อง ให้สีเข้าไปชิดขอบเส้น ไม่เหลือขอบขาว
  const out = new Uint8Array(mask);
  for (let y = 0; y < DG_FH; y++) for (let x = 0; x < DG_FW; x++){
    const i = y * DG_FW + x; if (mask[i]) continue;
    if ((x > 0 && mask[i - 1]) || (x < DG_FW - 1 && mask[i + 1]) || (y > 0 && mask[i - DG_FW]) || (y < DG_FH - 1 && mask[i + DG_FW])) out[i] = 1;
  }
  return out;
}
function dgFillRuns(mask){
  const pts = []; let runs = 0;
  for (let y = 0; y < DG_FH; y++){
    let x = 0; const row = y * DG_FW, yy = dgR4((y + .5) / DG_FH);
    while (x < DG_FW){
      if (!mask[row + x]){ x++; continue; }
      let e = x; while (e < DG_FW && mask[row + e]) e++;
      if (++runs > DG_MAX_RUNS) return null;
      pts.push(dgR4(x / DG_FW), yy, dgR4(e / DG_FW), yy); x = e;
    }
  }
  return pts;
}
async function dgFillAt(nx, ny){
  if (dgFillBusy || !dgCanDraw()) return; dgFillBusy = true;
  try {
    const sx = Math.min(DG_FW - 1, Math.floor(nx * DG_FW)), sy = Math.min(DG_FH - 1, Math.floor(ny * DG_FH));
    const px = dgFillRaster(), mask = dgFillMask(px, sx, sy), pts = dgFillRuns(mask);
    if (!pts){ toast('พื้นที่นี้ซับซ้อนเกินไปสำหรับถังสี ลองปิดขอบให้เป็นรูปง่ายขึ้น'); return; }
    if (pts.length < 4) return;
    const s = { id: dgNewId(), color: DG.prefs.color, width: .002, erase: false, fill: true, points: pts };
    await dgSaveStroke(s);
  } finally { dgFillBusy = false; }
}
function dgFillHit(s, x, y){
  const p = s.points, row = Math.min(DG_FH - 1, Math.floor(y * DG_FH)), yy = (row + .5) / DG_FH;
  for (let i = 0; i + 3 < p.length; i += 4) if (Math.abs(p[i + 1] - yy) < .0008 && x >= p[i] && x <= p[i + 2]) return true;
  return false;
}

/* ---------- ยางลบทั้งเส้น ---------- */
function dgBBox(s){
  if (s._bb) return s._bb; const p = s.points; let a = 1, b = 1, c = 0, d = 0;
  for (let i = 0; i < p.length; i += 2){ a = Math.min(a, p[i]); b = Math.min(b, p[i + 1]); c = Math.max(c, p[i]); d = Math.max(d, p[i + 1]); }
  return s._bb = [a, b, c, d];
}
function dgSegDist(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function dgSweep(x, y){
  const c = DG.cur; if (!c) return;
  const r = (DG.prefs.eraser / DG_REF) / 2 * 0.9 + 0.004;     // รัศมีในหน่วยความสูงผืน
  // ถังสีซ้อนกัน: ถ้าเมาส์ยังอยู่ในพื้นที่ของถังสีที่เพิ่งลบ ไม่ลบชั้นล่างต่อ (ต้องลากออกแล้วแตะใหม่)
  let fillHit = c.gone.some(gid => { const g = DG.strokes.get(gid); return g && g.fill && dgFillHit(g, x, y); });
  for (let i = DG.order.length - 1; i >= 0; i--){
    const id = DG.order[i]; if (DG.hidden.has(id)) continue; const s = DG.strokes.get(id); if (!s || s.erase) continue;
    if (s.fill){ if (!fillHit && dgFillHit(s, x, y)){ fillHit = true; DG.hidden.add(id); c.gone.push(id); DG.inkDirty = true; } continue; } // ถังสีซ้อนกัน ลบเฉพาะชั้นบนสุด
    const bb = dgBBox(s), pad = r + s.width / 2, A = DG_ASPECT;
    if (x * A < bb[0] * A - pad || x * A > bb[2] * A + pad || y < bb[1] - pad || y > bb[3] + pad) continue;
    const p = s.points; let hit = false;
    for (let k = 0; k + 3 < p.length && !hit; k += 2) hit = dgSegDist(x * A, y, p[k] * A, p[k + 1], p[k + 2] * A, p[k + 3]) <= pad;
    if (!hit && p.length === 4) hit = Math.hypot(x * A - p[0] * A, y - p[1]) <= pad;
    if (hit){ DG.hidden.add(id); c.gone.push(id); DG.inkDirty = true; }
  }
}
async function dgCommitSweep(c){
  if (!c.gone.length) return; const ids = c.gone.slice(), round = DG.room.round_no;
  try {
    await dgRpc('dg3_delete_strokes', { p_room_id: DG.roomId, p_round_no: round, p_player_id: ME.id, p_ids: ids });
    ids.forEach(id => { DG.strokes.delete(id); DG.hidden.delete(id); DG.own.delete(id); }); DG.order = DG.order.filter(id => !ids.includes(id));
    DG.mine = DG.mine.filter(id => !ids.includes(id)); DG.inkDirty = true;
    dgBroadcast('sdel', { round, ids }); dgRenderTools(); dgRequestRender();
  } catch (e){ ids.forEach(id => DG.hidden.delete(id)); DG.inkDirty = true; dgRequestRender(); toast('ลบเส้นไม่สำเร็จ: ' + dgError(e)); }
}
async function dgUndo(){
  if (!dgCanDraw()) return;
  while (DG.mine.length && !DG.strokes.has(DG.mine[DG.mine.length - 1])) DG.mine.pop();
  const id = DG.mine.pop(); if (!id) return;
  DG.hidden.add(id); DG.inkDirty = true; dgRenderTools(); dgRequestRender();
  const round = DG.room.round_no;
  try {
    await dgRpc('dg3_delete_strokes', { p_room_id: DG.roomId, p_round_no: round, p_player_id: ME.id, p_ids: [id] });
    DG.strokes.delete(id); DG.hidden.delete(id); DG.order = DG.order.filter(x => x !== id); DG.inkDirty = true;
    dgBroadcast('sdel', { round, ids: [id] }); dgRequestRender();
  } catch (e){ DG.hidden.delete(id); DG.mine.push(id); DG.inkDirty = true; dgRenderTools(); dgRequestRender(); toast(dgError(e)); }
}
async function dgClearCanvas(){
  if (!dgCanDraw() || !DG.order.length) return;
  if (!confirm('ล้างภาพวาดทั้งหมดในรอบนี้?')) return;
  const round = DG.room.round_no; DG.busy = true;
  try {
    await dgRpc('dg3_clear_canvas', { p_room_id: DG.roomId, p_round_no: round, p_player_id: ME.id });
    DG.strokes.clear(); DG.order = []; DG.hidden.clear(); DG.live.clear(); DG.mine = []; DG.inkDirty = true;
    dgBroadcast('clear', { round }); dgRenderTools(); dgRequestRender();
  } catch (e){ toast(dgError(e)); }
  finally { DG.busy = false; }
}

/* ---------- ดึงเส้นจากเซิร์ฟเวอร์ (เฉพาะเส้นที่ยังไม่มี) ---------- */
async function dgFetchStrokes(){
  if (!sb || !DG.roomId || !DG.room || !DG.room.round_no) return;
  if (DG.strokeBusy){ DG.strokeAgain = true; return; }
  DG.strokeBusy = true; const started = Date.now(), round = DG.room.round_no, id = DG.roomId;
  try {
    const d = await dgRpc('dg3_get_strokes', { p_room_id: id, p_round_no: round, p_known: [...DG.strokes.keys()].slice(0, 800) });
    if (id !== DG.roomId || !DG.room || DG.room.round_no !== round || d.round_no !== round) return;
    d.strokes.forEach(r => { DG.strokes.set(r.id, r.stroke); DG.live.delete(r.id); });
    const ids = d.ids.slice();
    DG.own.forEach((ts, sid) => { if (ts >= started - 200 && !ids.includes(sid) && DG.strokes.has(sid)) ids.push(sid); });
    DG.order = ids.filter(sid => DG.strokes.has(sid));
    [...DG.strokes.keys()].forEach(sid => { if (!DG.order.includes(sid)) DG.strokes.delete(sid); });
    DG.hidden.forEach(sid => { if (!DG.strokes.has(sid)) DG.hidden.delete(sid); });
    DG.inkDirty = true; dgRequestRender();
  } catch (e){}
  finally { DG.strokeBusy = false; if (DG.strokeAgain){ DG.strokeAgain = false; dgFetchStrokes(); } }
}

/* ---------- วาดลงผืน ---------- */
function dgDrawStroke(g, s, W, H){
  const p = s.points || []; if (p.length < 2) return;
  if (s.fill){
    g.save(); g.fillStyle = s.color || '#252525'; const rh = H / DG_FH;
    for (let i = 0; i + 3 < p.length; i += 4){ const y = Math.round((p[i + 1] * DG_FH - .5)) * rh; g.fillRect(p[i] * W - .25, y - .25, (p[i + 2] - p[i]) * W + .5, rh + .5); }
    g.restore(); return;
  }
  g.save(); g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  g.strokeStyle = g.fillStyle = s.erase ? '#000' : (s.color || '#252525');
  const w = Math.max(1, (s.width || .006) * H); g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  if (p.length <= 4 && Math.hypot(p[p.length - 2] - p[0], p[p.length - 1] - p[1]) * H < 1){ g.beginPath(); g.arc(p[0] * W, p[1] * H, w / 2, 0, Math.PI * 2); g.fill(); g.restore(); return; }
  g.beginPath(); g.moveTo(p[0] * W, p[1] * H);
  for (let i = 2; i + 3 < p.length; i += 2){ g.quadraticCurveTo(p[i] * W, p[i + 1] * H, (p[i] + p[i + 2]) / 2 * W, (p[i + 1] + p[i + 3]) / 2 * H); }
  g.lineTo(p[p.length - 2] * W, p[p.length - 1] * H); g.stroke(); g.restore();
}
function dgRequestRender(){ if (DG.raf) return; DG.raf = requestAnimationFrame(() => { DG.raf = 0; dgRenderCanvas(); }); }
function dgRenderCanvas(){
  const cv = DG.canvas; if (!cv || !DG.visible) return;
  const fr = DG.frame || (DG.frame = DG.$('dgFrame')), aw = fr.clientWidth - 16, ah = fr.clientHeight - 16;
  if (aw < 20 || ah < 20) return;
  let fw = aw, fh = fw / DG_ASPECT; if (fh > ah){ fh = ah; fw = fh * DG_ASPECT; }
  cv.style.width = Math.floor(fw) + 'px'; cv.style.height = Math.floor(fh) + 'px';
  const W = Math.max(1, cv.clientWidth), H = Math.max(1, cv.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (cv.width !== pw || cv.height !== ph){ cv.width = pw; cv.height = ph; DG.ink.width = DG.tmp.width = pw; DG.ink.height = DG.tmp.height = ph; DG.inkDirty = true; }
  if (DG.ink.width !== pw){ DG.ink.width = DG.tmp.width = pw; DG.ink.height = DG.tmp.height = ph; DG.inkDirty = true; }
  if (DG.inkDirty){
    const g = DG.ink.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (const id of DG.order){ if (DG.hidden.has(id)) continue; const s = DG.strokes.get(id); if (s) dgDrawStroke(g, s, W, H); }
    DG.inkDirty = false;
  }
  const g = DG.ctx; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fffdf8'; g.fillRect(0, 0, cv.width, cv.height);
  if (DG.live.size){
    const t = DG.tmp.getContext('2d'); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, DG.tmp.width, DG.tmp.height); t.drawImage(DG.ink, 0, 0);
    t.setTransform(dpr, 0, 0, dpr, 0, 0); DG.live.forEach(s => dgDrawStroke(t, s, W, H));
    g.drawImage(DG.tmp, 0, 0);
  } else g.drawImage(DG.ink, 0, 0);
  if (DG.cursor && dgIsDrawer() && DG.tool === 'eraser'){
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.beginPath(); g.arc(DG.cursor[0] * W, DG.cursor[1] * H, Math.max(3, DG.prefs.eraser / DG_REF * H / 2), 0, Math.PI * 2);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(60,45,30,.7)'; g.stroke();
  }
}

/* ============================ เรียลไทม์ (channel lobby:main, event draw_guess) ============================ */
function dgBroadcast(t, extra, roomId){
  if (!S.chan) return; const room = roomId || DG.roomId;
  S.chan.send({ type: 'broadcast', event: 'draw_guess', payload: Object.assign({ t, room, from: ME.id }, extra || {}) }).catch(() => {});
}
DG.onBroadcast = function(p){
  if (!p || typeof p !== 'object' || p.from === ME.id) return;
  if (p.t === 'rooms'){ if (DG.hubOpen) dgLoadRooms(true); return; }
  if (p.t === 'invite'){ if (!DG.roomId) toast('🎨 ' + (p.by || 'เพื่อน') + ' ชวนเล่นวาดภาพทายคำ: ' + (p.name || 'ห้องใหม่')); return; }
  if (!DG.roomId || p.room !== DG.roomId || !DG.room) return;
  if (p.t === 'room'){ dgSync(true); return; }
  if (p.t === 'chat'){ dgFetchChat(false); return; }
  if (p.round !== undefined && p.round !== DG.room.round_no) return;
  if (p.t === 'live'){
    if (DG.room.drawer_id === ME.id) return;
    let s = DG.live.get(p.id); if (!s){ s = { id: p.id, color: p.color, width: p.width, erase: !!p.erase, points: [] }; DG.live.set(p.id, s); }
    if (Array.isArray(p.pts)) s.points.push(...p.pts); dgRequestRender(); return;
  }
  if (p.t === 'sdone'){ if (p.failed){ DG.live.delete(p.id); dgRequestRender(); } else dgFetchStrokes(); return; }
  if (p.t === 'sdel'){ (p.ids || []).forEach(id => { DG.hidden.add(id); }); DG.inkDirty = true; dgRequestRender(); dgFetchStrokes(); return; }
  if (p.t === 'clear'){ DG.strokes.clear(); DG.order = []; DG.hidden.clear(); DG.live.clear(); DG.inkDirty = true; dgRequestRender(); dgFetchStrokes(); }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dgBuildUI, { once: true }); else dgBuildUI();
