/* ---------- ต่อคำภาษาไทย (Word Chain) ----------
   ผลัดกันพิมพ์คำที่ขึ้นต้นด้วยพยัญชนะตัวสุดท้ายของคำก่อนหน้า ไม่ทันเวลาเสียหัวใจ หัวใจหมดตกรอบ เหลือคนสุดท้ายชนะ
   ตาราง/RPC wc_* (supabase/word_chain.sql), พจนานุกรม assets/words-th.txt (tools/words-th-build.py)
   ใช้ตัวช่วยของวาดภาพทายคำ (dgEl, dgRpc, dgError, dgAvatar, dgMeName) และคลาส .dg-* ร่วมกัน */
const WC_TIMES = [[10, '10 วินาที'], [15, '15 วินาที'], [20, '20 วินาที'], [30, '30 วินาที'], [45, '45 วินาที'], [60, '1 นาที']];
const WC = {
  roomId: null, room: null, rooms: [], mineRoom: null, visible: false, hubOpen: false, busy: false, sending: false,
  chat: [], chatLast: 0, skew: 0, lastSyncAt: 0, lastTimeout: 0, lastBeep: -1, prev: null, restored: null,
  dict: null, dictState: '', notice: '', noticeKind: '', timers: {}, formMode: 'create',
  $: id => document.getElementById(id)
};
const wcNow = () => Date.now() + WC.skew;

/* ---- กติกาตัวอักษร (ต้องตรงกับ wc_head / wc_tail ใน supabase/word_chain.sql) ---- */
function wcHead(w){ const m = String(w || '').match(/^[เ-ไ]*([ก-ฮ])/); return m ? m[1] : ''; }
function wcTail(w){
  let s = String(w || '').replace(/[ๆฯ\s]+$/, '').replace(/[็-๋ํ]/g, '');
  if (/์$/.test(s)){
    const m = s.match(/([ก-ฮ])[ิุ]?์$/);
    if (m){ s = s.slice(0, s.length - m[0].length); if (m[1] === 'ร' && /[ก-ฮั-ฺ][ตทด]$/.test(s)) s = s.slice(0, -1); }
    else s = s.slice(0, -1);
  }
  s = s.replace(/[ะ-ฺๅ-๎]+$/, '');
  const m = s.match(/[ก-ฮ]$/); if (m) return m[0];
  const f = String(w || '').match(/([ก-ฮ])[^ก-ฮ]*$/); return f ? f[1] : '';
}
const wcClean = w => String(w || '').replace(/\s+/g, '');

/* ---- พจนานุกรม (~60,000 คำ จาก PyThaiNLP, โหลดครั้งเดียวตอนเปิดเกม) ---- */
function wcLoadDict(){
  if (WC.dict || WC.dictState === 'loading') return;
  WC.dictState = 'loading';
  fetch('assets/words-th.txt').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(t => { WC.dict = new Set(t.split('\n').map(x => x.trim()).filter(Boolean)); WC.dictState = 'ok'; if (WC.visible) wcRender(); })
    .catch(() => { WC.dictState = 'fail'; if (WC.visible) wcRender(); });
}

/* ============================ โครงหน้าจอ ============================ */
function wcBuildUI(){
  document.body.insertAdjacentHTML('beforeend', `
  <section id="wcHub" class="dg-screen" hidden>
    <div class="dg-card">
      <div class="dg-head"><div><h2>🔤 ต่อคำ</h2><p class="dg-sub">ผลัดกันพิมพ์คำที่ขึ้นต้นด้วยตัวท้ายของคำก่อนหน้า เล่นคนเดียวหรือกับเพื่อนก็ได้</p></div><button class="dg-close" id="wcHubClose" aria-label="ปิด">×</button></div>
      <div class="dg-actions"><button class="btn primary" id="wcNewRoom">＋ สร้างห้องใหม่</button><button class="btn soft" id="wcHubRefresh">รีเฟรช</button></div>
      <div class="dg-room-list" id="wcRoomList"></div>
      <p class="dg-note">กติกา: คำต่อไปต้องขึ้นต้นด้วยพยัญชนะตัวสุดท้ายของคำก่อนหน้า (ไม่นับสระ วรรณยุกต์ และตัวการันต์ เช่น ปลา → ล, ศาสตร์ → ส) ห้ามใช้คำซ้ำ คิดไม่ทันเวลาเสียหัวใจ</p>
    </div>
  </section>

  <section id="wcForm" class="dg-screen dg-over" hidden>
    <div class="dg-card">
      <div class="dg-head"><div><h2 id="wcFormTitle">สร้างห้อง</h2><p class="dg-sub">แก้ได้อีกตอนอยู่ห้องรอ</p></div><button class="dg-close" id="wcFormClose" aria-label="ปิด">×</button></div>
      <label class="dg-field">ชื่อห้อง<input id="wcFName" maxlength="40" autocomplete="off" placeholder="เช่น ต่อคำกันเถอะ"></label>
      <div class="dg-setting-grid wc-setting-grid">
        <label class="dg-field">เวลาต่อตา<select id="wcFTime"></select></label>
        <label class="dg-field">หัวใจ<select id="wcFLives"></select></label>
        <label class="dg-field">คนสูงสุด<select id="wcFMax"></select></label>
      </div>
      <label class="dg-category wc-check"><input type="checkbox" id="wcFStrict"><span>ต้องเป็นคำที่มีในพจนานุกรม<small>ปิดไว้ถ้าอยากใช้ชื่อเฉพาะหรือคำแสลง แล้วให้เพื่อนตัดสินกันเอง</small></span></label>
      <div class="dg-actions"><button class="btn soft" id="wcFCancel">ยกเลิก</button><button class="btn primary" id="wcFSubmit">สร้างห้อง</button></div>
      <p class="err" id="wcFError" role="alert"></p>
    </div>
  </section>

  <section id="wcRoom" class="dg-screen dg-game-screen" hidden>
    <div class="dg-game-layout">
      <header class="dg-game-header">
        <button class="dg-close" id="wcHide" aria-label="ซ่อนเกม (ยังอยู่ในห้อง)" title="ซ่อนเกม (ยังอยู่ในห้อง)">⌂</button>
        <span class="dg-round-pill" id="wcPill">ห้องรอ</span>
        <div class="dg-game-heading"><strong id="wcTitle">ห้อง</strong><span id="wcSubTitle"></span></div>
        <span class="dg-time-pill" id="wcClock" hidden>0:20</span>
        <div class="dg-menu-wrap"><button class="dg-close" id="wcMenuBtn" aria-label="เมนู">⋯</button>
          <div class="dg-menu" id="wcMenu" hidden>
            <button id="wcMEnd">จบเกมเลย</button><button id="wcMSettings">ตั้งค่าห้อง</button><button id="wcMLeave" class="danger">ออกจากห้อง</button>
          </div></div>
      </header>
      <div class="dg-game-body">
        <div class="dg-main">
          <div class="dg-wait" id="wcWait" hidden>
            <h3 id="wcWaitName">ห้องรอ</h3>
            <div class="dg-chips" id="wcWaitChips"></div>
            <div class="dg-label" id="wcWaitCount">ผู้เล่น</div>
            <div class="dg-wait-players" id="wcWaitPlayers"></div>
            <p class="dg-note" id="wcWaitNote"></p>
            <div class="dg-actions"><button class="btn primary" id="wcStartBtn">เริ่มเกม</button><button class="btn soft" id="wcEditBtn">ตั้งค่าห้อง</button><button class="btn soft" id="wcInviteBtn">เรียกเพื่อน 🔔</button></div>
          </div>
          <div class="wc-stage" id="wcStage" hidden>
            <div class="wc-top">
              <div class="wc-need"><small>ขึ้นต้นด้วย</small><b id="wcNeed">ก</b></div>
              <div class="wc-turninfo">
                <div class="wc-turn" id="wcTurn">—</div>
                <div class="wc-bar"><i id="wcBar"></i></div>
                <div class="wc-count" id="wcCount">0 คำ</div>
              </div>
            </div>
            <div class="wc-chain" id="wcChain" aria-live="polite"></div>
            <form class="wc-form" id="wcForm2" autocomplete="off">
              <input id="wcInput" maxlength="30" placeholder="พิมพ์คำ…" enterkeyhint="send" autocapitalize="off" spellcheck="false" aria-label="คำของคุณ">
              <button type="submit" class="btn primary" id="wcSend">ส่ง</button>
            </form>
            <div class="wc-msg" id="wcMsg" aria-live="polite"></div>
          </div>
        </div>
        <aside class="dg-side wc-side">
          <div class="dg-players" id="wcPlayers"></div>
          <div class="dg-chat">
            <div class="dg-chat-log" id="wcChatLog" aria-live="polite"></div>
            <form class="dg-chat-form" id="wcChatForm" autocomplete="off">
              <input id="wcChatInput" maxlength="160" placeholder="คุยกันได้ตรงนี้…" enterkeyhint="send"><button type="submit">ส่ง</button>
            </form>
          </div>
        </aside>
      </div>
      <div class="dg-result" id="wcResult" hidden><div class="dg-result-card">
        <h3 id="wcResultTitle"></h3>
        <div class="dg-result-answer" id="wcResultSub"></div>
        <div class="dg-result-scores" id="wcResultScores"></div>
        <div class="dg-actions"><button class="btn soft" id="wcResultView">ดูคำทั้งหมด</button><button class="btn primary" id="wcAgainBtn">เล่นอีกรอบ</button><button class="btn soft" id="wcLeaveBtn">ออกจากห้อง</button></div>
      </div></div>
    </div>
  </section>`);

  const fill = (id, rows) => { const s = WC.$(id); rows.forEach(([v, l]) => { const o = dgEl('option', '', l); o.value = v; s.appendChild(o); }); };
  fill('wcFTime', WC_TIMES); fill('wcFLives', [1, 2, 3, 4, 5].map(n => [n, '❤'.repeat(n)])); fill('wcFMax', Array.from({ length: 9 }, (_, i) => [i + 2, (i + 2) + ' คน']));

  WC.$('wcHubClose').onclick = wcCloseHub;
  WC.$('wcHubRefresh').onclick = () => wcLoadRooms(false);
  WC.$('wcNewRoom').onclick = () => wcOpenForm('create');
  WC.$('wcFormClose').onclick = WC.$('wcFCancel').onclick = wcCloseForm;
  WC.$('wcFSubmit').onclick = wcSubmitForm;
  WC.$('wcHide').onclick = wcHideRoom;
  WC.$('wcMenuBtn').onclick = e => { e.stopPropagation(); WC.$('wcMenu').hidden = !WC.$('wcMenu').hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('#wcRoom .dg-menu-wrap')) WC.$('wcMenu').hidden = true; });
  WC.$('wcMEnd').onclick = () => { WC.$('wcMenu').hidden = true; wcEndRoom(); };
  WC.$('wcMSettings').onclick = WC.$('wcEditBtn').onclick = () => { WC.$('wcMenu').hidden = true; wcOpenForm('edit'); };
  WC.$('wcMLeave').onclick = WC.$('wcLeaveBtn').onclick = () => { WC.$('wcMenu').hidden = true; wcLeaveRoom(); };
  WC.$('wcStartBtn').onclick = WC.$('wcAgainBtn').onclick = wcStart;
  WC.$('wcInviteBtn').onclick = wcInvite;
  WC.$('wcResultView').onclick = () => { WC.resultHidden = true; WC.$('wcResult').hidden = true; };
  WC.$('wcForm2').addEventListener('submit', e => { e.preventDefault(); wcPlay(); });
  WC.$('wcInput').addEventListener('input', wcLiveCheck);
  WC.$('wcChatForm').addEventListener('submit', e => { e.preventDefault(); wcSendChat(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!WC.$('wcForm').hidden) wcCloseForm(); else if (WC.visible) wcHideRoom(); else if (WC.hubOpen) wcCloseHub();
  });
  WC.timers.tick = setInterval(wcTick, 250);
  WC.timers.poll = setInterval(wcPoll, 1000);
}

/* ============================ รายการห้อง ============================ */
function wcOpen(){
  if (!sb){ toast('ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์'); return; }
  wcLoadDict();
  if (WC.room && WC.room.found){ wcShowRoom(); return; }
  WC.hubOpen = true; WC.$('wcHub').hidden = false; wcLoadRooms(false);
  clearInterval(WC.timers.hub); WC.timers.hub = setInterval(() => { if (WC.hubOpen) wcLoadRooms(true); }, 4000);
}
function wcCloseHub(){ WC.hubOpen = false; WC.$('wcHub').hidden = true; clearInterval(WC.timers.hub); }
async function wcLoadRooms(silent){
  if (!sb || !ME || !ME.id) return;
  try {
    const d = await dgRpc('wc_list_rooms', { p_player_id: ME.id });
    WC.rooms = d.rooms || []; WC.mineRoom = d.my_room_id || null;
    if (WC.mineRoom && !WC.roomId){ WC.roomId = WC.mineRoom; const st = await wcSync(true); if (WC.hubOpen && st){ wcCloseHub(); wcShowRoom(); wcFetchChat(true); return; } }
    wcRenderHub();
  } catch (e){ if (!silent) toast('โหลดรายการห้องไม่สำเร็จ'); }
}
function wcRenderHub(){
  const box = WC.$('wcRoomList'); box.replaceChildren();
  if (!WC.rooms.length){ box.appendChild(dgEl('div', 'dg-empty', 'ยังไม่มีห้อง กด "สร้างห้องใหม่" แล้วชวนเพื่อนได้เลย')); return; }
  WC.rooms.forEach(r => {
    const card = dgEl('div', 'dg-room-card'), info = dgEl('div', 'dg-room-info'), s = r.settings || {};
    const st = r.status === 'playing' ? 'กำลังเล่น · ' + r.count_words + ' คำ' : r.status === 'ended' ? 'เพิ่งจบเกม' : 'รอเริ่ม';
    info.append(dgEl('strong', '', r.name), dgEl('span', 'dg-room-meta', '👑 ' + (r.host_name || '—') + ' · ' + r.count + '/' + r.max_players + ' คน · ⏱ ' + s.turn_seconds + ' วิ · ' + st),
      dgEl('span', 'dg-room-names', (r.names || []).join(', ')));
    const mine = r.id === WC.mineRoom, full = r.count >= r.max_players && !mine;
    const btn = dgEl('button', 'btn ' + (mine ? 'soft' : 'primary'), mine ? 'กลับเข้าห้อง' : full ? 'เต็ม' : r.status === 'playing' ? 'เข้าไปดู' : 'เข้าร่วม');
    btn.disabled = full; btn.onclick = () => wcJoin(r.id);
    card.append(info, btn); box.appendChild(card);
  });
}
async function wcJoin(id){
  if (WC.busy) return; WC.busy = true;
  try { const st = await dgRpc('wc_join_room', { p_player_id: ME.id, p_name: dgMeName(), p_room_id: id }); wcEnterRoom(st); wcBroadcast('rooms'); wcBroadcast('room'); }
  catch (e){ toast(dgError(e)); wcLoadRooms(true); }
  finally { WC.busy = false; }
}

/* ============================ ฟอร์มสร้าง / ตั้งค่า ============================ */
function wcDefaults(){ return Object.assign({ turn_seconds: 20, lives: 3, max_players: 8, strict: true }, LS.get('jt-wc-settings', {})); }
function wcOpenForm(mode){
  WC.formMode = mode; WC.$('wcHub').hidden = true;
  const edit = mode === 'edit' && WC.room && WC.room.found, s = edit ? WC.room.settings : wcDefaults();
  WC.$('wcFormTitle').textContent = edit ? 'ตั้งค่าห้อง' : 'สร้างห้อง';
  WC.$('wcFSubmit').textContent = edit ? 'บันทึก' : 'สร้างห้อง';
  WC.$('wcFName').value = edit ? WC.room.name : 'ห้องของ ' + dgMeName();
  WC.$('wcFTime').value = s.turn_seconds; WC.$('wcFLives').value = s.lives; WC.$('wcFMax').value = s.max_players; WC.$('wcFStrict').checked = s.strict !== false;
  WC.$('wcFError').textContent = ''; WC.$('wcForm').hidden = false;
}
function wcCloseForm(){ WC.$('wcForm').hidden = true; if (WC.hubOpen && !WC.room) WC.$('wcHub').hidden = false; }
async function wcSubmitForm(){
  if (WC.busy) return;
  const s = { turn_seconds: +WC.$('wcFTime').value, lives: +WC.$('wcFLives').value, max_players: +WC.$('wcFMax').value, strict: WC.$('wcFStrict').checked };
  const name = WC.$('wcFName').value.trim();
  WC.busy = true; WC.$('wcFSubmit').disabled = true;
  try {
    if (WC.formMode === 'edit' && WC.room && WC.room.found){
      wcApply(await dgRpc('wc_update_settings', { p_room_id: WC.roomId, p_player_id: ME.id, p_name: name, p_settings: s })); wcBroadcast('room');
    } else {
      LS.set('jt-wc-settings', s);
      wcEnterRoom(await dgRpc('wc_create_room', { p_player_id: ME.id, p_name: dgMeName(), p_room_name: name, p_settings: s }));
    }
    WC.$('wcForm').hidden = true; wcBroadcast('rooms');
  } catch (e){ WC.$('wcFError').textContent = dgError(e); }
  finally { WC.busy = false; WC.$('wcFSubmit').disabled = false; }
}

/* ============================ เข้า / ออก / ซิงก์ ============================ */
function wcEnterRoom(st){
  WC.roomId = st.room_id; WC.room = null; WC.prev = null; WC.chat = []; WC.chatLast = 0; WC.resultHidden = false;
  wcCloseHub(); WC.$('wcForm').hidden = true;
  wcApply(st); wcShowRoom(); wcFetchChat(true);
}
function wcShowRoom(){
  if (!WC.room) return; WC.visible = true; WC.hubOpen = false; WC.$('wcHub').hidden = true; WC.$('wcRoom').hidden = false;
  wcRender(); requestAnimationFrame(() => { wcScroll('wcChatLog'); wcScroll('wcChain'); });
}
function wcHideRoom(){ WC.visible = false; WC.$('wcRoom').hidden = true; WC.$('wcMenu').hidden = true; }
function wcLeaveLocal(msg){
  WC.roomId = null; WC.room = null; WC.prev = null; WC.chat = []; WC.chatLast = 0; WC.mineRoom = null;
  WC.$('wcRoom').hidden = true; WC.visible = false; WC.$('wcResult').hidden = true; if (msg) toast(msg);
}
async function wcLeaveRoom(){
  if (!WC.room) return;
  const me = wcMe();
  if (WC.room.status === 'playing' && me && !me.out && !confirm('ออกจากห้องตอนนี้จะตกรอบทันที ออกใช่ไหม?')) return;
  const id = WC.roomId; wcLeaveLocal();
  try { await dgRpc('wc_leave_room', { p_room_id: id, p_player_id: ME.id }); wcBroadcast('room', {}, id); wcBroadcast('rooms'); } catch (e){}
  wcOpen();
}
async function wcSync(silent){
  if (!sb || !WC.roomId) return null;
  try {
    const st = await dgRpc('wc_get_state', { p_room_id: WC.roomId, p_player_id: ME.id });
    WC.lastSyncAt = Date.now();
    if (!st || !st.found){ wcLeaveLocal(silent ? '' : 'ห้องนี้ถูกปิดแล้ว'); return null; }
    wcApply(st); return st;
  } catch (e){ if (!silent) toast('โหลดสถานะห้องไม่สำเร็จ'); return null; }
}
function wcPoll(){
  if (S.connected && S.chan && WC.restored !== S.chan){ WC.restored = S.chan; if (WC.roomId){ wcSync(true); wcFetchChat(false); } }
  if (!S.connected) WC.restored = null;
  if (!WC.roomId || WC.busy || WC.sending) return;
  const gap = WC.room && WC.room.status === 'playing' ? 3000 : 6000;
  if (Date.now() - WC.lastSyncAt > gap){ WC.lastSyncAt = Date.now(); wcSync(true).then(() => wcFetchChat(false)); }
}
function wcApply(st){
  if (st.is_member === false && WC.room){ wcLeaveLocal('คุณไม่ได้อยู่ในห้องนี้แล้ว'); return; }
  const prev = WC.prev;
  if (st.server_now) WC.skew = Date.parse(st.server_now) - Date.now();
  WC.room = st; WC.roomId = st.room_id; WC.mineRoom = st.room_id;
  const myTurn = st.status === 'playing' && st.turn_player === ME.id;
  const turnChanged = !prev || prev.turn !== st.turn_no || prev.game !== st.game_no;
  if (prev && prev.status !== st.status){
    WC.resultHidden = false;
    if (st.status === 'playing'){ if (!WC.visible) wcShowRoom(); toast('เกมต่อคำเริ่มแล้ว!'); }
    if (st.status === 'ended'){ if (st.winner_id === ME.id) sfxDone(); else sfxSet(); }
  }
  if (turnChanged){
    WC.lastBeep = -1;
    if (prev && prev.count < st.count) sfxSnap();
    if (myTurn){ sfxTurn(); WC.notice = ''; const inp = WC.$('wcInput'); if (inp && WC.visible) { inp.value = ''; setTimeout(() => inp.focus(), 60); } }
    if (prev && turnChanged) wcFetchChat(false);
  }
  WC.prev = { turn: st.turn_no, game: st.game_no, status: st.status, count: st.count };
  if (WC.visible) wcRender();
}

/* ============================ วาดหน้าจอ ============================ */
function wcMe(){ return WC.room && (WC.room.players || []).find(p => p.player_id === ME.id); }
const wcName = id => { const p = WC.room && (WC.room.players || []).find(x => x.player_id === id); return p ? p.name : '—'; };
function wcChips(s){
  return ['⏱ ' + s.turn_seconds + ' วิ/ตา', '❤ ' + s.lives + ' ดวง', '👥 สูงสุด ' + s.max_players + ' คน', s.strict ? '📖 ตรวจคำกับพจนานุกรม' : '🗣 ไม่ตรวจพจนานุกรม'];
}
function wcRender(){
  const r = WC.room; if (!r || !r.found) return;
  const waiting = r.status === 'waiting', playing = r.status === 'playing', ended = r.status === 'ended';
  const active = (r.players || []).filter(p => !p.left), me = wcMe(), myTurn = playing && r.turn_player === ME.id;
  WC.$('wcPill').textContent = waiting ? 'ห้องรอ' : playing ? 'เกมที่ ' + r.game_no : 'จบเกม';
  WC.$('wcTitle').textContent = r.name;
  WC.$('wcSubTitle').textContent = waiting ? active.length + '/' + r.max_players + ' คน' : playing ? (r.solo ? 'เล่นคนเดียว · ' : '') + 'ต่อได้ ' + r.count + ' คำ' : 'ต่อได้ ' + r.count + ' คำ';
  WC.$('wcClock').hidden = !playing;
  WC.$('wcMEnd').hidden = !(r.is_host && playing);
  WC.$('wcMSettings').hidden = !(r.is_host && !playing);
  WC.$('wcWait').hidden = !waiting; WC.$('wcStage').hidden = waiting;

  if (waiting){
    WC.$('wcWaitName').textContent = r.name;
    const chips = WC.$('wcWaitChips'); chips.replaceChildren(); wcChips(r.settings).forEach(c => chips.appendChild(dgEl('span', 'dg-chip', c)));
    WC.$('wcWaitCount').textContent = 'ผู้เล่นในห้อง ' + active.length + '/' + r.max_players;
    const box = WC.$('wcWaitPlayers'); box.replaceChildren();
    active.forEach(p => { const row = dgEl('div', 'dg-score-row'); row.append(dgAvatar(p.player_id, p.name), dgEl('span', 'dg-score-name', p.name + (p.player_id === ME.id ? ' (คุณ)' : '')), dgEl('span', 'dg-status', (p.is_host ? '👑 เจ้าของห้อง' : '') + (p.away ? ' 💤' : ''))); box.appendChild(row); });
    WC.$('wcStartBtn').hidden = WC.$('wcEditBtn').hidden = !r.is_host; WC.$('wcStartBtn').disabled = WC.busy;
    WC.$('wcStartBtn').textContent = active.length < 2 ? 'เริ่มเล่นคนเดียว' : 'เริ่มเกม';
    WC.$('wcWaitNote').textContent = r.is_host ? (active.length < 2 ? 'เล่นคนเดียวได้ (ฝึกต่อคำให้ได้ยาวที่สุด) หรือกด "เรียกเพื่อน" แล้วรอเพื่อนเข้ามาก่อน' : 'พร้อมแล้วกด "เริ่มเกม" ได้เลย ระบบจะสุ่มคนเริ่มและตัวอักษรแรก') : 'รอเจ้าของห้องกดเริ่มเกม · คุยแชทรอได้เลย';
  } else {
    WC.$('wcNeed').textContent = playing ? (r.need || '?') : '🏁';
    WC.$('wcTurn').textContent = ended ? (r.winner_id ? '🏆 ' + wcName(r.winner_id) + ' ชนะ!' : 'จบเกมแล้ว') : myTurn ? 'ตาคุณแล้ว! พิมพ์คำที่ขึ้นต้นด้วย "' + r.need + '"' : 'ตาของ ' + wcName(r.turn_player);
    WC.$('wcTurn').classList.toggle('mine', myTurn);
    WC.$('wcCount').textContent = r.count + ' คำ';
    wcRenderChain();
    const inp = WC.$('wcInput'), canPlay = myTurn && !WC.sending;
    inp.disabled = !myTurn; WC.$('wcSend').disabled = !canPlay;
    inp.placeholder = myTurn ? 'คำที่ขึ้นต้นด้วย "' + r.need + '"…' : me && me.out && playing ? 'ตกรอบแล้ว รอดูเพื่อนเล่นต่อ' : playing ? 'รอตาของคุณ…' : 'จบเกมแล้ว';
    WC.$('wcForm2').hidden = ended;
    let note = WC.notice, kind = WC.noticeKind;
    if (!note && myTurn && r.settings.strict && WC.dictState === 'loading'){ note = 'กำลังโหลดพจนานุกรม…'; kind = ''; }
    if (!note && r.settings.strict && WC.dictState === 'fail'){ note = 'โหลดพจนานุกรมไม่ได้ เกมนี้จะไม่ตรวจคำ'; kind = 'bad'; }
    WC.$('wcMsg').textContent = note || ''; WC.$('wcMsg').className = 'wc-msg ' + (kind || '');
  }
  wcRenderPlayers(); wcRenderResult();
}
function wcRenderChain(){
  const r = WC.room, box = WC.$('wcChain'), near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.replaceChildren();
  if (!r.chain.length){ box.appendChild(dgEl('div', 'wc-empty', r.status === 'playing' ? 'ยังไม่มีคำ เริ่มด้วยตัว "' + r.need + '"' : 'ไม่มีคำในเกมนี้')); return; }
  if (r.count > r.chain.length) box.appendChild(dgEl('div', 'wc-more', '… อีก ' + (r.count - r.chain.length) + ' คำก่อนหน้า'));
  r.chain.forEach((c, i) => {
    const last = i === r.chain.length - 1, el = dgEl('div', 'wc-word' + (last ? ' last' : '') + (c.by === ME.id ? ' mine' : ''));
    const w = dgEl('b', '', c.w), who = dgEl('small', '', wcName(c.by)); who.style.color = dgColor(c.by);
    el.append(w, who); box.appendChild(el);
    if (!last) box.appendChild(dgEl('span', 'wc-link', wcTail(c.w)));
  });
  if (near || r.status === 'playing') wcScroll('wcChain');
}
function wcRenderPlayers(){
  const r = WC.room, box = WC.$('wcPlayers'); box.replaceChildren();
  const list = (r.players || []).filter(p => !p.left || r.status !== 'waiting');
  list.forEach(p => {
    const row = dgEl('div', 'dg-score-row' + (p.player_id === ME.id ? ' me' : '') + (p.left || (p.out && r.status === 'playing') ? ' gone' : '') + (p.is_turn ? ' wc-turnrow' : ''));
    const hearts = r.status === 'waiting' ? '' : p.left ? 'ออกแล้ว' : p.out && r.status === 'playing' ? (p.lives ? 'รอเกมหน้า' : 'ตกรอบ') : '❤'.repeat(Math.max(0, p.lives));
    row.append(dgAvatar(p.player_id, p.name), dgEl('span', 'dg-score-name', (p.is_host ? '👑 ' : '') + (p.is_turn ? '✍️ ' : '') + p.name + (p.away ? ' 💤' : '')),
      dgEl('span', 'dg-status wc-hearts', hearts), dgEl('strong', 'dg-score-points', String(p.words)));
    if (p.wins) row.title = 'ชนะ ' + p.wins + ' ครั้งในห้องนี้';
    box.appendChild(row);
  });
  box.hidden = r.status === 'waiting';
}
function wcRenderResult(){
  const r = WC.room, box = WC.$('wcResult'), show = r.status === 'ended' && !WC.resultHidden && r.game_no > 0;
  box.hidden = !show; if (!show) return;
  WC.$('wcResultTitle').textContent = r.winner_id ? (r.winner_id === ME.id ? '🏆 คุณชนะ!' : '🏆 ' + wcName(r.winner_id) + ' ชนะ!') : r.solo ? 'จบเกม · ต่อได้ ' + r.count + ' คำ' : 'จบเกม';
  WC.$('wcResultSub').textContent = r.chain.length ? 'คำสุดท้าย: ' + r.chain[r.chain.length - 1].w : 'ยังไม่มีใครต่อได้เลย';
  const sc = WC.$('wcResultScores'); sc.replaceChildren();
  [...(r.players || [])].sort((a, b) => (b.player_id === r.winner_id) - (a.player_id === r.winner_id) || b.words - a.words || a.join_order - b.join_order)
    .forEach((p, i) => { const l = dgEl('div', 'dg-score-row'); l.append(dgEl('span', 'dg-score-name', (i + 1) + '. ' + p.name + (p.player_id === r.winner_id ? ' 🏆' : '') + (p.wins ? ' · ชนะ ' + p.wins : '') + (p.left ? ' (ออกแล้ว)' : '')), dgEl('strong', 'dg-score-points', p.words + ' คำ')); sc.appendChild(l); });
  WC.$('wcAgainBtn').hidden = !r.is_host;
}
function wcScroll(id){ const el = WC.$(id); if (el) el.scrollTop = el.scrollHeight; }

/* ============================ เวลา ============================ */
function wcTick(){
  const r = WC.room; if (!r || r.status !== 'playing') return;
  const total = (r.settings.turn_seconds || 20) * 1000, left = r.turn_ends_at ? Date.parse(r.turn_ends_at) - wcNow() : total;
  const sec = Math.max(0, Math.ceil(left / 1000));
  if (WC.visible){
    const c = WC.$('wcClock'); c.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); c.classList.toggle('low', sec <= 5);
    const bar = WC.$('wcBar'); bar.style.width = Math.max(0, Math.min(100, left / total * 100)) + '%'; bar.classList.toggle('low', sec <= 5);
  }
  if (r.turn_player === ME.id && sec <= 5 && sec > 0 && sec !== WC.lastBeep){ WC.lastBeep = sec; tone(880, 0, .06, 'square', .05); }
  if (!r.is_member || WC.busy || WC.sending) return;
  const turnP = (r.players || []).find(p => p.player_id === r.turn_player);
  const away = turnP && (turnP.away || turnP.left) && r.turn_player !== ME.id;
  // คนที่ถึงตาแจ้งหมดเวลาเอง คนอื่นช่วยแจ้งช้ากว่านิดหน่อย (เผื่อเครื่องเขาหลับหรือหลุด)
  const grace = r.turn_player === ME.id ? 0 : 1500;
  if ((left <= -grace && Date.now() - WC.lastTimeout > 2500) || (away && Date.now() - WC.lastTimeout > 8000)){ WC.lastTimeout = Date.now(); wcTimeout(); }
}
async function wcTimeout(){
  const r = WC.room; if (!r || r.status !== 'playing') return;
  try {
    const d = await dgRpc('wc_timeout', { p_room_id: WC.roomId, p_player_id: ME.id, p_turn_no: r.turn_no });
    if (d && d.state){ wcApply(d.state); if (d.ok){ wcBroadcast('room'); wcBroadcast('chat'); wcFetchChat(false); } }
  } catch (e){}
}

/* ============================ การกระทำ ============================ */
async function wcStart(){
  if (WC.busy || !WC.room) return; WC.busy = true; WC.resultHidden = false; wcRender();
  try { const st = await dgRpc('wc_start', { p_room_id: WC.roomId, p_player_id: ME.id }); wcApply(st); wcBroadcast('room'); wcBroadcast('rooms'); wcFetchChat(false); }
  catch (e){ toast(dgError(e)); }
  finally { WC.busy = false; if (WC.room) wcRender(); }
}
function wcInvite(){ wcBroadcast('rooms'); wcBroadcast('invite', { by: dgMeName(), name: WC.room ? WC.room.name : '' }); toast('ส่งสัญญาณเรียกเพื่อนแล้ว'); }
async function wcEndRoom(){
  if (!WC.room || !WC.room.is_host || !confirm('จบเกมตอนนี้ใช่ไหม?')) return;
  try { wcApply(await dgRpc('wc_end_room', { p_room_id: WC.roomId, p_player_id: ME.id })); wcBroadcast('room'); wcBroadcast('rooms'); wcFetchChat(false); } catch (e){ toast(dgError(e)); }
}
/* ตรวจคำก่อนส่ง: ข้อความ '' = ผ่าน */
function wcCheck(w){
  const r = WC.room;
  if (!w) return 'พิมพ์คำก่อน';
  if (!/^[ก-ฺเ-๎]{2,20}$/.test(w)) return 'ใช้ตัวอักษรไทย 2–20 ตัว';
  if (wcHead(w) !== r.need) return 'ต้องขึ้นต้นด้วย "' + r.need + '"';
  if (r.chain.some(c => c.w === w)) return '"' + w + '" ใช้ไปแล้ว';
  if (r.settings.strict && WC.dict && !WC.dict.has(w)) return 'ไม่มี "' + w + '" ในพจนานุกรม';
  return '';
}
function wcLiveCheck(){
  const w = wcClean(WC.$('wcInput').value);
  if (!WC.room || WC.room.turn_player !== ME.id || !w){ if (WC.noticeKind === 'bad'){ WC.notice = ''; WC.noticeKind = ''; wcRender(); } return; }
  const head = wcHead(w);
  if (head && head !== WC.room.need){ WC.notice = 'ต้องขึ้นต้นด้วย "' + WC.room.need + '"'; WC.noticeKind = 'bad'; }
  else if (WC.noticeKind){ WC.notice = ''; WC.noticeKind = ''; }
  else return;
  WC.$('wcMsg').textContent = WC.notice; WC.$('wcMsg').className = 'wc-msg ' + WC.noticeKind;
}
async function wcPlay(){
  const r = WC.room, inp = WC.$('wcInput'), w = wcClean(inp.value);
  if (!r || r.status !== 'playing' || r.turn_player !== ME.id || WC.sending) return;
  if (r.settings.strict && WC.dictState === 'loading'){ WC.notice = 'รอโหลดพจนานุกรมแป๊บหนึ่ง…'; WC.noticeKind = ''; wcRender(); return; }
  const bad = wcCheck(w);
  if (bad){ WC.notice = bad; WC.noticeKind = 'bad'; sfxSet(); inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); wcRender(); inp.focus(); return; }
  WC.sending = true; wcRender();
  try {
    const d = await dgRpc('wc_play', { p_room_id: WC.roomId, p_player_id: ME.id, p_turn_no: r.turn_no, p_word: w });
    if (d && d.ok){ inp.value = ''; WC.notice = ''; WC.noticeKind = ''; WC.sending = false; wcApply(d.state); wcBroadcast('room'); wcBroadcast('chat'); wcFetchChat(false); }
    else if (d && d.state){ WC.sending = false; wcApply(d.state); }
    else { WC.notice = (d && d.message) || 'ส่งไม่สำเร็จ'; WC.noticeKind = 'bad'; sfxSet(); if (d && d.expired) wcSync(true); }
  } catch (e){ WC.notice = dgError(e); WC.noticeKind = 'bad'; }
  finally { WC.sending = false; if (WC.room) wcRender(); if (WC.room && WC.room.turn_player === ME.id) inp.focus(); }
}

/* ============================ แชท ============================ */
async function wcSendChat(){
  const inp = WC.$('wcChatInput'), text = inp.value.trim();
  if (!text || !WC.room) return;
  inp.value = '';
  try { const d = await dgRpc('wc_send', { p_room_id: WC.roomId, p_player_id: ME.id, p_text: text }); if (d && d.throttled){ inp.value = text; toast('ส่งเร็วไปนิด รอแป๊บหนึ่ง'); return; } await wcFetchChat(false); wcBroadcast('chat'); }
  catch (e){ inp.value = text; toast(dgError(e)); }
}
async function wcFetchChat(reset){
  if (!sb || !WC.roomId) return;
  if (WC.chatBusy){ WC.chatAgain = true; return; }
  WC.chatBusy = true; const id = WC.roomId;
  try {
    const rows = await dgRpc('wc_get_chat', { p_room_id: id, p_player_id: ME.id, p_after: reset ? 0 : WC.chatLast });
    if (id !== WC.roomId) return;
    if (reset) WC.chat = [];
    rows.forEach(m => { if (!WC.chat.some(x => x.id === m.id)) WC.chat.push(m); });
    WC.chat.sort((a, b) => a.id - b.id); if (WC.chat.length > 200) WC.chat = WC.chat.slice(-200);
    WC.chatLast = WC.chat.length ? WC.chat[WC.chat.length - 1].id : 0;
    wcRenderChat();
  } catch (e){}
  finally { WC.chatBusy = false; if (WC.chatAgain){ WC.chatAgain = false; wcFetchChat(false); } }
}
function wcRenderChat(){
  const log = WC.$('wcChatLog'), near = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.replaceChildren();
  WC.chat.forEach(m => {
    if (m.kind === 'system'){ log.appendChild(dgEl('div', 'dg-msg sys', m.body)); return; }
    const d = dgEl('div', 'dg-msg' + (m.kind === 'word' ? ' ok' : '') + (m.player_id === ME.id ? ' mine' : ''));
    const n = dgEl('b', '', (m.name || '—') + ' '); n.style.color = dgColor(m.player_id);
    d.append(n, document.createTextNode(m.kind === 'word' ? '→ ' + m.body : m.body)); log.appendChild(d);
  });
  if (near) wcScroll('wcChatLog');
}

/* ============================ เรียลไทม์ (lobby:main, event word_chain) ============================ */
function wcBroadcast(t, extra, roomId){
  if (!S.chan) return;
  S.chan.send({ type: 'broadcast', event: 'word_chain', payload: Object.assign({ t, room: roomId || WC.roomId, from: ME.id }, extra || {}) }).catch(() => {});
}
WC.onBroadcast = function(p){
  if (!p || typeof p !== 'object' || p.from === ME.id) return;
  if (p.t === 'rooms'){ if (WC.hubOpen) wcLoadRooms(true); return; }
  if (p.t === 'invite'){ if (!WC.roomId) toast('🔤 ' + (p.by || 'เพื่อน') + ' ชวนเล่นต่อคำ: ' + (p.name || 'ห้องใหม่')); return; }
  if (!WC.roomId || p.room !== WC.roomId) return;
  if (p.t === 'room'){ wcSync(true); return; }
  if (p.t === 'chat'){ wcFetchChat(false); }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wcBuildUI, { once: true }); else wcBuildUI();
