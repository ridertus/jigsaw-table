/* ---------- Draw & Guess (isolated mini-game; does not reuse Board / board_items) ---------- */
const DG_CATEGORIES = [
  ['animals','สัตว์','🐾'],['food','อาหาร','🍜'],['objects','สิ่งของ','🎒'],
  ['occupations','อาชีพ','🧑‍🍳'],['places','สถานที่','🏡'],['nature','ธรรมชาติ','🌈'],
  ['vehicles','ยานพาหนะ','🛺'],['thai_culture','วัฒนธรรมไทย','🇹🇭'],['fantasy','แฟนตาซี','🐉']
];
const DG_COLORS = ['#252525','#e45151','#ec9635','#3b9e68','#328cc9','#8062c9','#e06aa4','#ffffff'];
const DG = {
  state: null, selectedCats: ['animals','food','objects'], difficulty: 'normal', duration: 90,
  visible: false, busy: false, color: DG_COLORS[0], size: 0.006, eraser: false,
  canvas: null, ctx: null, live: new Map(), current: null, lastLiveAt: 0, pendingLive: [],
  revealTimer: 0, tickTimer: 0, pollTimer: 0, restoredChannel: null, lastPoll: 0,
  feedback: '', feedbackKind: '',
  $: id => document.getElementById(id)
};

function dgPaletteList(){
  if (typeof Board !== 'undefined' && Array.isArray(Board.palettes) && Board.palettes.length) return Board.palettes;
  return [{id:'basic',name:'พื้นฐาน',colors:[...DG_COLORS]}];
}
function dgCurrentPalette(){
  const palettes=dgPaletteList();
  const activeId=typeof Board !== 'undefined' ? Board.activePaletteId : 'basic';
  return palettes.find(p=>p.id===activeId)||palettes[0];
}
function dgSetDrawColor(color){
  if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))return;
  DG.color=color.toLowerCase(); DG.eraser=false;
  if(typeof Board!=='undefined'){
    Board.color=DG.color;
    Board.recentColors=[DG.color,...(Array.isArray(Board.recentColors)?Board.recentColors.filter(c=>c!==DG.color):[])].slice(0,8);
    if(typeof LS!=='undefined'){
      LS.set('jt-bd-color',DG.color);
      LS.set('jt-bd-recent-colors',Board.recentColors);
    }
    if(typeof renderBdTools==='function')renderBdTools();
  }
  const eraser=DG.$('dgEraser');
  if(eraser)eraser.setAttribute('aria-pressed','false');
  dgRenderPaletteControls();
}
function dgRenderPaletteControls(){
  const select=DG.$('dgPaletteSelect'), box=DG.$('dgColors'), picker=DG.$('dgColorPicker');
  if(!select||!box)return;
  const palettes=dgPaletteList(), active=dgCurrentPalette();
  select.replaceChildren();
  palettes.forEach(p=>{
    const option=document.createElement('option');option.value=p.id;option.textContent=p.name;
    option.selected=p.id===active.id;select.appendChild(option);
  });
  box.replaceChildren();
  (active.colors||[]).forEach(color=>{
    const b=document.createElement('button');b.type='button';b.className='dg-color';
    b.style.background=color;b.title=color.toUpperCase();b.setAttribute('aria-label','เลือกสี '+color.toUpperCase());
    b.setAttribute('aria-pressed',String(color.toLowerCase()===DG.color));
    b.addEventListener('click',()=>dgSetDrawColor(color));box.appendChild(b);
  });
  if(!box.children.length){
    const empty=document.createElement('span');empty.className='dg-palette-empty';empty.textContent='ชุดสีนี้ยังว่าง';box.appendChild(empty);
  }
  if(picker)picker.value=DG.color;
}

function dgBuildUI(){
  const topbar = document.querySelector('.topbar');
  if (topbar && !DG.$('dgLauncher')) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'round'; b.id = 'dgLauncher';
    b.setAttribute('aria-label','มินิเกม Draw & Guess'); b.title = 'มินิเกม Draw & Guess';
    b.textContent = '🎨'; b.addEventListener('click', dgOpen);
    const wx = DG.$('wxBtn'); topbar.insertBefore(b, wx || topbar.firstChild);
  }

  if (!DG.$('dgLobby')) document.body.insertAdjacentHTML('beforeend', `
    <section id="dgLobby" class="dg-screen" hidden>
      <div class="dg-card">
        <div class="dg-head"><div><h2>🎨 Draw &amp; Guess</h2><p class="dg-sub">วาดภาพให้เพื่อนทาย ใครจะเดาใจคนวาดได้ก่อน?</p></div><button class="dg-close" id="dgLobbyClose" aria-label="ปิด">×</button></div>
        <div class="dg-section"><div class="dg-label">ผู้เล่นในห้อง</div><div class="dg-player-chips" id="dgLobbyPlayers"></div><p class="dg-note" id="dgLobbyHint">ต้องมีผู้เล่นอย่างน้อย 2 คน เริ่มเล่นได้สูงสุด 4 คน</p></div>
        <div class="dg-section"><div class="dg-label">เลือกหมวดหมู่ (เลือกได้หลายหมวด)</div><div class="dg-category-grid" id="dgCategoryGrid"></div></div>
        <div class="dg-setting-grid">
          <label class="dg-field">ระดับความยาก<select id="dgDifficulty"><option value="easy">ง่าย</option><option value="normal" selected>ทั่วไป</option><option value="hard">ยาก</option></select></label>
          <label class="dg-field">เวลาต่อรอบ<select id="dgDuration"><option value="60">60 วินาที</option><option value="90" selected>90 วินาที</option><option value="120">120 วินาที</option><option value="0">ไม่จำกัดเวลา</option></select></label>
          <label class="dg-field">จำนวนรอบต่อห้อง<select id="dgTotalRounds"><option value="3">3 รอบ</option><option value="5" selected>5 รอบ</option><option value="10">10 รอบ</option><option value="15">15 รอบ</option><option value="20">20 รอบ</option></select></label>
        </div>
        <p class="dg-note">คนวาดจะหมุนเวียนตามลำดับผู้เล่น ทุกคนมีสิทธิ์ข้ามรอบหรือจบเกมก่อนกำหนด เมื่อครบจำนวนรอบ ระบบจะสรุปคะแนนและประกาศผู้ชนะโดยอัตโนมัติ</p>
        <div class="dg-actions"><button class="btn soft" id="dgLobbyCancel">กลับห้อง</button><button class="btn primary" id="dgStart">สร้างห้องและเริ่ม</button></div>
        <p class="err" id="dgLobbyError" role="alert"></p>
      </div>
    </section>
    <section id="dgGame" class="dg-screen dg-game-screen" hidden>
      <div class="dg-game-layout">
        <header class="dg-game-header">
          <button class="dg-close" id="dgGameClose" aria-label="ซ่อนเกม">×</button>
          <span class="dg-round-pill" id="dgRound">รอบ 1</span>
          <div class="dg-game-heading"><strong id="dgDrawerName">คนวาด</strong><span id="dgCategoryName">หมวดหมู่</span></div>
          <span class="dg-time-pill" id="dgClock">1:30</span>
          <button class="dg-tool-btn" id="dgSkip" hidden>ข้ามรอบ</button>
          <button class="dg-tool-btn" id="dgEnd" hidden>จบเกมก่อนกำหนด</button>
        </header>
        <div class="dg-game-body">
          <div class="dg-canvas-column">
            <div class="dg-canvas-frame"><canvas id="dgCanvas" width="960" height="720" aria-label="พื้นที่วาดภาพ"></canvas></div>
            <div class="dg-draw-tools" id="dgDrawTools" hidden>
              <div class="dg-palette-bar">
                <select class="dg-palette-select" id="dgPaletteSelect" aria-label="เลือกชุดสี"></select>
                <div class="dg-colors" id="dgColors" aria-label="สีที่ใช้วาด"></div>
                <label class="dg-color-add" title="เลือกสีอื่น" aria-label="เลือกสีอื่น">
                  <input type="color" id="dgColorPicker" value="#252525" aria-label="เลือกสีอื่น">
                  <span aria-hidden="true">+</span>
                </label>
                <button class="dg-palette-add" id="dgAddPaletteColor" type="button" title="เพิ่มสีปัจจุบันลงในชุดสี" aria-label="เพิ่มสีปัจจุบันลงในชุดสี">+</button>
              </div>
              <select class="dg-size-select" id="dgBrushSize" aria-label="ขนาดเส้น"><option value="0.0035">เล็ก</option><option value="0.006" selected>กลาง</option><option value="0.012">ใหญ่</option></select>
              <button class="dg-tool-btn" id="dgEraser" aria-pressed="false">ยางลบ</button>
              <button class="dg-tool-btn" id="dgClear">ล้างภาพ</button>
            </div>
          </div>
          <aside class="dg-side">
            <div class="dg-side-card" id="dgPromptCard">
              <div class="dg-label" id="dgPromptLabel">คำใบ้</div>
              <div class="dg-secret" id="dgSecret" hidden><small>คำที่คุณต้องวาด</small><strong id="dgSecretWord">—</strong></div>
              <div class="dg-clue" id="dgClue">หมวดหมู่: สัตว์</div>
              <div class="dg-guess-row" id="dgGuessRow"><input id="dgGuessInput" maxlength="80" autocomplete="off" placeholder="พิมพ์คำตอบ…"><button id="dgGuessSend">ส่ง</button></div>
              <div class="dg-feedback" id="dgFeedback" aria-live="polite"></div>
              <p class="dg-note" id="dgRoleNote"></p>
            </div>
            <div class="dg-side-card"><div class="dg-label">ผู้เล่นและคะแนน</div><div class="dg-player-list" id="dgScoreList"></div></div>
            <div class="dg-side-card"><div class="dg-label">สถานะรอบ</div><div class="dg-note" id="dgRoundStatus">กำลังเตรียมเกม…</div></div>
          </aside>
        </div>
      </div>
      <div class="dg-result" id="dgResult" hidden><div class="dg-result-card"><h3 id="dgResultTitle">หมดรอบ!</h3><div class="dg-result-answer" id="dgResultAnswer">คำตอบ</div><div class="dg-note" id="dgResultReason"></div><div class="dg-result-scores" id="dgResultScores"></div><div class="dg-actions"><button class="btn soft" id="dgResultClose">ซ่อนเกม</button><button class="btn soft" id="dgEndFromResult" hidden>จบเกมก่อนกำหนด</button><button class="btn primary" id="dgNextRound" hidden>เริ่มรอบถัดไป</button><button class="btn primary" id="dgPlayAgain" hidden>สร้างห้องใหม่</button></div></div></div>
    </section>`);

  DG.$('dgLobbyClose').onclick = dgCloseLobby;
  DG.$('dgLobbyCancel').onclick = dgCloseLobby;
  DG.$('dgGameClose').onclick = () => { DG.$('dgGame').hidden = true; DG.visible = false; };
  DG.$('dgStart').onclick = dgStartSession;
  DG.$('dgGuessSend').onclick = dgSubmitGuess;
  DG.$('dgGuessInput').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); dgSubmitGuess(); } });
  DG.$('dgSkip').onclick = () => dgFinishRound('skipped');
  DG.$('dgEnd').onclick = DG.$('dgEndFromResult').onclick = dgEndSession;
  DG.$('dgNextRound').onclick = dgNextRound;
  DG.$('dgPlayAgain').onclick = () => { DG.$('dgGame').hidden = true; DG.state = null; dgOpenLobby(); };
  DG.$('dgResultClose').onclick = () => { DG.$('dgGame').hidden = true; DG.visible = false; };
  DG.$('dgEraser').onclick = () => { DG.eraser = !DG.eraser; DG.$('dgEraser').setAttribute('aria-pressed',String(DG.eraser)); };
  DG.$('dgBrushSize').onchange = e => DG.size = +e.target.value;
  DG.$('dgClear').onclick = dgClearCanvas;
  DG.$('dgPaletteSelect').onchange = e => {
    if (typeof setActivePalette === 'function') setActivePalette(e.target.value);
    else if (typeof Board !== 'undefined') Board.activePaletteId = e.target.value;
    dgRenderPaletteControls();
  };
  DG.$('dgColorPicker').onchange = e => dgSetDrawColor(e.target.value);
  DG.$('dgAddPaletteColor').onclick = () => {
    if (typeof addColorToPalette === 'function') addColorToPalette(DG.color);
    dgRenderPaletteControls();
  };
  if (typeof Board !== 'undefined' && Board.color && /^#[0-9a-f]{6}$/i.test(Board.color)) DG.color = Board.color.toLowerCase();
  dgRenderPaletteControls();

  DG.canvas = DG.$('dgCanvas'); DG.ctx = DG.canvas.getContext('2d');
  DG.canvas.addEventListener('pointerdown', dgPointerDown);
  DG.canvas.addEventListener('pointermove', dgPointerMove);
  DG.canvas.addEventListener('pointerup', dgPointerUp);
  DG.canvas.addEventListener('pointercancel', dgPointerUp);
  window.addEventListener('resize', () => { if (DG.state) dgRenderCanvas(); });
  document.addEventListener('keydown', e => { if (e.key==='Escape' && !DG.$('dgGame').hidden){ DG.$('dgGame').hidden=true; DG.visible=false; } });

  DG_CATEGORY_RENDER();
  DG.tickTimer = setInterval(dgTick,250);
  DG.pollTimer = setInterval(() => {
    if (S.connected && S.chan && DG.restoredChannel !== S.chan){ DG.restoredChannel = S.chan; DG.lastPoll=Date.now(); dgRefreshState(true); }
    if (!S.connected) DG.restoredChannel = null;
    if (DG.state && DG.state.active && !DG.busy && Date.now()-DG.lastPoll>10000){ DG.lastPoll=Date.now(); dgRefreshState(true); }
  },1200);
}

function DG_CATEGORY_RENDER(){
  const box = DG.$('dgCategoryGrid'); if (!box) return;
  box.replaceChildren();
  DG_CATEGORIES.forEach(([id,label,emoji]) => {
    const labelEl=document.createElement('label'); labelEl.className='dg-category';
    const input=document.createElement('input'); input.type='checkbox'; input.value=id; input.checked=DG.selectedCats.includes(id);
    input.onchange=()=>{ DG.selectedCats = [...box.querySelectorAll('input:checked')].map(x=>x.value); };
    const name=document.createElement('span'); name.textContent=emoji+' '+label;
    labelEl.append(input,name); box.appendChild(labelEl);
  });
}
function dgOnlinePlayers(){
  const list=(S.players||[]).map(p=>({id:String(p.key||p.id||''),name:String(p.name||'ผู้เล่น'),color:p.color||colorOf(p.key||p.id||'')})).filter(p=>p.id);
  const seen=new Set(); return list.filter(p=>{ if(seen.has(p.id))return false;seen.add(p.id);return true; });
}
function dgRenderLobby(){
  const box=DG.$('dgLobbyPlayers'); box.replaceChildren();
  const players=dgOnlinePlayers();
  players.forEach(p=>{const item=document.createElement('span');item.className='dg-player-chip';const av=document.createElement('i');av.style.background=p.color;av.textContent=[...p.name][0]||'?';const n=document.createElement('span');n.textContent=p.name+(p.id===ME.id?' (คุณ)':'');item.append(av,n);box.appendChild(item);});
  DG.$('dgLobbyHint').textContent=players.length<2?'ต้องมีผู้เล่นอย่างน้อย 2 คนจึงเริ่มเกมได้':players.length>4?'เกมรองรับสูงสุด 4 คน':'พร้อมเล่น '+players.length+' คน';
  DG.$('dgStart').disabled=players.length<2||players.length>4||DG.selectedCats.length===0||DG.busy;
  DG.$('dgLobbyError').textContent='';
}
function dgOpen(){
  if (DG.state && DG.state.active){ dgShowGame(); return; }
  dgRefreshState(false).then(() => { if (DG.state && (DG.state.active || DG.state.status==='ended')) dgShowGame(); else dgOpenLobby(); });
}
function dgOpenLobby(){ DG.visible=false; dgRenderLobby(); DG.$('dgLobby').hidden=false; }
function dgCloseLobby(){ DG.$('dgLobby').hidden=true; }
async function dgStartSession(){
  if(DG.busy)return;
  const players=dgOnlinePlayers();
  if(players.length<2||players.length>4){ DG.$('dgLobbyError').textContent='ต้องมีผู้เล่นออนไลน์ 2–4 คน';return; }
  if(!DG.selectedCats.length){ DG.$('dgLobbyError').textContent='เลือกอย่างน้อยหนึ่งหมวดหมู่';return; }
  DG.busy=true; dgRenderLobby(); DG.$('dgStart').textContent='กำลังเริ่ม…';
  try{
    const {data,error}=await sb.rpc('dg_start_room',{p_creator_id:ME.id,p_players:players.map(p=>({id:p.id,name:p.name})),p_categories:DG.selectedCats,p_difficulty:DG.$('dgDifficulty').value,p_duration_seconds:+DG.$('dgDuration').value,p_total_rounds:+DG.$('dgTotalRounds').value});
    if(error)throw error;
    DG.state=data; DG.live.clear(); DG.feedback=''; DG.$('dgLobby').hidden=true; dgShowGame(); dgBroadcast('session_started');
  }catch(e){ DG.$('dgLobbyError').textContent=dgError(e); }
  finally{DG.busy=false;DG.$('dgStart').textContent='สร้างห้องและเริ่ม';dgRenderLobby();}
}
async function dgRefreshState(silent){
  if(!sb||!ME||!ME.id)return null;
  try{
    const {data,error}=await sb.rpc('dg_get_public_state',{p_player_id:ME.id}); if(error)throw error;
    if(data&&data.status==='ended'){
      DG.state=data;DG.live.clear();
      if(!DG.$('dgGame').hidden)dgRenderGame();
      return data;
    }
    if(data&&data.active){
      const changed=!DG.state||DG.state.session_id!==data.session_id||DG.state.round_no!==data.round_no||DG.state.status!==data.status;
      DG.state=data;DG.lastPoll=Date.now();
      if(changed){DG.live.clear();DG.feedback='';DG.feedbackKind='';}
      if(!DG.$('dgGame').hidden)dgRenderGame();
      dgRenderCanvas();
      if(DG.$('dgLobby')&&!DG.$('dgLobby').hidden)dgRenderLobby();
      dgScheduleAutoNext();
      return data;
    }
    if(!DG.state||DG.state.status==='ended')DG.state=null;
    if(!silent&&!DG.$('dgGame').hidden){DG.$('dgGame').hidden=true;DG.visible=false;}
    return null;
  }catch(e){ if(!silent)toast('โหลดสถานะ Draw & Guess ไม่สำเร็จ'); return null; }
}
function dgShowGame(){
  if(!DG.state)return;
  DG.$('dgLobby').hidden=true;DG.$('dgGame').hidden=false;DG.visible=true;
  dgRenderGame();requestAnimationFrame(dgRenderCanvas);dgScheduleAutoNext();
}
function dgBroadcast(type,extra){
  if(!S.chan||!DG.state||!DG.state.session_id)return;
  const payload={type,session_id:DG.state.session_id,round_no:DG.state.round_no,...(extra||{})};
  S.chan.send({type:'broadcast',event:'draw_guess',payload}).catch(()=>{});
}
function dgOnBroadcast(payload){
  if(!payload||typeof payload!=='object')return;
  if(payload.type==='session_started'){
    if(!DG.state||DG.state.session_id!==payload.session_id){
      dgRefreshState(true).then(()=>{ if(DG.state&&DG.state.active)dgShowGame(); });
    }
    return;
  }
  if(!DG.state||payload.session_id!==DG.state.session_id)return;
  if(payload.round_no!==undefined&&payload.round_no!==DG.state.round_no&&payload.type!=='state_changed')return;
  if(payload.type==='stroke_live'){
    if(payload.drawer_id===ME.id)return;
    let stroke=DG.live.get(payload.stroke_id);
    if(!stroke){stroke={id:payload.stroke_id,color:payload.color,width:payload.width,erase:!!payload.erase,points:[]};DG.live.set(payload.stroke_id,stroke);}
    if(Array.isArray(payload.points))stroke.points.push(...payload.points);
    dgRenderCanvas();return;
  }
  if(payload.type==='stroke_saved'||payload.type==='canvas_cleared'||payload.type==='state_changed'||payload.type==='round_finished'||payload.type==='round_started'||payload.type==='session_ended'){
    if((payload.type==='stroke_saved'||payload.type==='stroke_discarded')&&payload.stroke_id)DG.live.delete(payload.stroke_id);
    if(payload.type==='canvas_cleared')DG.live.clear();
    dgRefreshState(true);
  }
}
DG.onBroadcast=dgOnBroadcast;
function dgError(e){
  const msg=(e&&e.message)||String(e||'เกิดข้อผิดพลาด');
  return msg.replace(/^.*?:\s*/,'').replace(/[\r\n]+/g,' ').slice(0,180);
}
function dgName(id){ const p=(DG.state?.players||[]).find(x=>x.player_id===id);return p?p.name:'ผู้เล่น'; }
function dgIsDrawer(){return !!DG.state&&DG.state.drawer_id===ME.id&&DG.state.status==='drawing';}
function dgHasSolved(){const p=(DG.state?.players||[]).find(x=>x.player_id===ME.id);return !!(p&&p.solved);}
function dgRenderGame(){
  const s=DG.state;if(!s)return;
  const drawer=dgIsDrawer(),meParticipant=!!s.is_participant;
  const totalRounds=Number(s.total_rounds)||5;
  DG.$('dgRound').textContent='รอบ '+s.round_no+' / '+totalRounds;
  DG.$('dgDrawerName').textContent='🎨 '+dgName(s.drawer_id)+(drawer?' (คุณกำลังวาด)':' กำลังวาด');
  const cat=DG_CATEGORIES.find(x=>x[0]===s.category);DG.$('dgCategoryName').textContent='หมวดหมู่: '+(cat?cat[1]:s.category||'—');
  DG.$('dgSecret').hidden=!drawer;DG.$('dgSecretWord').textContent=s.secret_word||'กำลังโหลดคำ…';
  DG.$('dgClue').hidden=drawer;DG.$('dgClue').textContent='หมวดหมู่: '+(cat?cat[1]:s.category||'—');
  DG.$('dgDrawTools').hidden=!drawer;
  DG.canvas.classList.toggle('dg-readonly',!drawer);
  DG.$('dgGuessRow').hidden=drawer||dgHasSolved()||!meParticipant||s.status!=='drawing';
  DG.$('dgGuessInput').disabled=DG.busy;
  DG.$('dgRoleNote').textContent=drawer?'วาดให้เพื่อนเดาคำนี้ ห้ามเขียนตัวอักษรหรือใบ้ด้วยคำพูด':!meParticipant?'คุณเข้ามาหลังเริ่มเกม จึงรับชมรอบนี้ได้ รอบหน้าจึงจะเข้าร่วมได้':dgHasSolved()?'คุณทายถูกแล้ว รอเพื่อนคนอื่นได้เลย':'พิมพ์คำตอบที่คิดว่าใช่ได้เรื่อย ๆ';
  DG.$('dgSkip').hidden=!meParticipant||s.status!=='drawing';DG.$('dgEnd').hidden=!meParticipant||s.status==='ended';
  DG.$('dgClock').textContent=s.status==='reveal'?'เฉลย':s.status==='ended'?'จบเกม':DG.$('dgClock').textContent;
  DG.$('dgSkip').disabled=DG.busy;DG.$('dgEnd').disabled=DG.busy;
  DG.$('dgFeedback').textContent=DG.feedback;DG.$('dgFeedback').className='dg-feedback '+DG.feedbackKind;
  DG.$('dgRoundStatus').textContent=s.status==='drawing'?(drawer?'คุณเป็นคนวาด':'กำลังวาดภาพ')+' · รอบ '+s.round_no+'/'+totalRounds:s.status==='ended'?'เกมจบแล้ว · '+s.round_no+'/'+totalRounds+' รอบ':'กำลังเฉลยรอบ '+s.round_no+'/'+totalRounds;
  const scores=DG.$('dgScoreList');scores.replaceChildren();
  [...(s.players||[])].sort((a,b)=>b.score-a.score||a.join_order-b.join_order).forEach(p=>{
    const row=document.createElement('div');row.className='dg-score-row';const av=document.createElement('i');av.className='dg-avatar';const online=dgOnlinePlayers().find(x=>x.id===p.player_id);av.style.background=online?online.color:colorOf(p.player_id);av.textContent=[...(p.name||'?')][0]||'?';
    const name=document.createElement('span');name.className='dg-score-name';name.textContent=p.name+(p.player_id===ME.id?' (คุณ)':'');
    const status=document.createElement('span');status.className='dg-status';status.textContent=p.is_drawer?'คนวาด':p.solved?'✓ ทายถูก':'กำลังทาย';
    const pts=document.createElement('strong');pts.className='dg-score-points';pts.textContent=p.score+' คะแนน';row.append(av,name,status,pts);scores.appendChild(row);
  });
  const reveal=DG.$('dgResult');reveal.hidden=s.status!=='reveal'&&s.status!=='ended';
  if(!reveal.hidden)dgRenderResult();
  if(!DG.$('dgGame').hidden)requestAnimationFrame(dgRenderCanvas);
}
function dgRenderResult(){
  const s=DG.state;if(!s)return;
  const ended=s.status==='ended', totalRounds=Number(s.total_rounds)||5;
  const ranked=[...(s.players||[])].sort((a,b)=>b.score-a.score||a.join_order-b.join_order);
  const topScore=ranked.length?ranked[0].score:0;
  const winners=ranked.filter(p=>p.score===topScore);
  DG.$('dgResultTitle').textContent=ended
    ? (winners.length>1?'🏆 คะแนนเสมอกัน!':'🏆 ผู้ชนะ: '+(winners[0]?.name||'—'))
    : 'จบรอบที่ '+s.round_no+' / '+totalRounds;
  DG.$('dgResultAnswer').textContent=s.answer||'เฉลยไม่พร้อมใช้งาน';
  DG.$('dgResultReason').textContent=ended
    ? (s.round_no>=totalRounds?'เล่นครบ '+s.round_no+' รอบแล้ว':'จบเกมก่อนกำหนดที่รอบ '+s.round_no+'/'+totalRounds)+' · '+(winners.length>1?'ผู้ชนะร่วม: '+winners.map(p=>p.name).join(' / '):'คะแนนรวมสูงสุด '+topScore+' คะแนน')
    : ((s.players||[]).some(p=>!p.is_drawer&&!p.solved)?'ยังมีคนทายไม่ถูก':'ทุกคนทายถูกแล้ว เก่งมาก!')+' · รอบถัดไปจะเริ่มอัตโนมัติ';
  const box=DG.$('dgResultScores');box.replaceChildren();
  ranked.forEach((p,i)=>{const line=document.createElement('div');line.className='dg-score-row';const n=document.createElement('span');n.className='dg-score-name';n.textContent=(i+1)+'. '+p.name+(ended&&p.score===topScore?' 🏆':'');const pts=document.createElement('strong');pts.className='dg-score-points';pts.textContent=p.score+' คะแนน';line.append(n,pts);box.appendChild(line);});
  DG.$('dgNextRound').hidden=ended||!s.is_participant;
  DG.$('dgEndFromResult').hidden=ended||!s.is_participant;
  DG.$('dgPlayAgain').hidden=!ended||!s.is_participant;
  DG.$('dgResultClose').textContent=ended?'ปิดผลการแข่งขัน':'ซ่อนผลรอบนี้';
}

function dgScheduleAutoNext(){
  clearTimeout(DG.revealTimer);
  if(!DG.state||DG.state.status!=='reveal'||!DG.state.is_participant)return;
  DG.revealTimer=setTimeout(()=>{if(DG.state&&DG.state.status==='reveal')dgNextRound();},6500);
}
function dgTick(){
  if(!DG.state||DG.state.status!=='drawing')return;
  if(!DG.state.ends_at){DG.$('dgClock').textContent='∞';return;}
  const left=Math.max(0,Math.ceil((Date.parse(DG.state.ends_at)-(Date.now()+(L.offset||0)))/1000));
  DG.$('dgClock').textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
  if(left<=0&&!DG.busy)dgFinishRound('timeout');
}
async function dgSubmitGuess(){
  if(DG.busy||!DG.state||DG.state.status!=='drawing'||dgIsDrawer()||dgHasSolved())return;
  const input=DG.$('dgGuessInput'),guess=input.value.trim();if(!guess)return;
  DG.busy=true;DG.$('dgGuessSend').disabled=true;
  try{
    const {data,error}=await sb.rpc('dg_submit_guess',{p_session_id:DG.state.session_id,p_round_no:DG.state.round_no,p_player_id:ME.id,p_guess:guess});
    if(error)throw error;
    input.value='';
    if(data&&data.correct){
      DG.feedback='ถูกต้อง! ได้ '+data.score_delta+' คะแนน';DG.feedbackKind='good';
      if(data.state)DG.state=data.state;
      dgBroadcast('state_changed');dgRenderGame();dgScheduleAutoNext();
    }else{DG.feedback=(data&&data.message)||'ยังไม่ถูก ลองอีกครั้ง';DG.feedbackKind='bad';if(data&&data.expired)await dgRefreshState(true);}
  }catch(e){DG.feedback=dgError(e);DG.feedbackKind='bad';}
  finally{DG.busy=false;DG.$('dgGuessSend').disabled=false;dgRenderGame();}
}
async function dgFinishRound(reason){
  if(DG.busy||!DG.state||DG.state.status!=='drawing')return;
  DG.busy=true;
  try{
    const {data,error}=await sb.rpc('dg_finish_round_room',{p_session_id:DG.state.session_id,p_round_no:DG.state.round_no,p_requester_id:ME.id,p_reason:reason});
    if(error)throw error;
    if(data&&data.state){DG.state=data.state;DG.live.clear();dgRenderGame();dgRenderCanvas();dgBroadcast('round_finished');dgScheduleAutoNext();}
  }catch(e){if(reason==='skipped')toast(dgError(e));}
  finally{DG.busy=false;}
}
async function dgNextRound(){
  clearTimeout(DG.revealTimer);
  if(DG.busy||!DG.state||DG.state.status!=='reveal'||!DG.state.is_participant)return;
  DG.busy=true;DG.$('dgNextRound').disabled=true;
  try{
    const {data,error}=await sb.rpc('dg_advance_round',{p_session_id:DG.state.session_id,p_requester_id:ME.id,p_round_no:DG.state.round_no});
    if(error)throw error;
    DG.state=data;DG.live.clear();DG.feedback='';DG.feedbackKind='';dgRenderGame();dgRenderCanvas();dgBroadcast(DG.state.status==='ended'?'session_ended':'round_started');dgScheduleAutoNext();
  }catch(e){toast(dgError(e));}
  finally{DG.busy=false;DG.$('dgNextRound').disabled=false;}
}
async function dgEndSession(){
  if(DG.busy||!DG.state||!DG.state.is_participant||DG.state.status==='ended')return;
  if(!confirm('ต้องการจบเกมก่อนครบจำนวนรอบใช่ไหม? คะแนนปัจจุบันจะถูกใช้สรุปผู้ชนะ'))return;
  DG.busy=true;
  try{
    const {data,error}=await sb.rpc('dg_close_room',{p_session_id:DG.state.session_id,p_requester_id:ME.id});
    if(error)throw error;
    if(data&&data.state)DG.state=data.state;else if(DG.state)DG.state.status='ended';
    clearTimeout(DG.revealTimer);DG.live.clear();dgRenderGame();dgBroadcast('session_ended');
  }catch(e){toast(dgError(e));}
  finally{DG.busy=false;}
}
async function dgClearCanvas(){
  if(DG.busy||!dgIsDrawer())return;
  if(!confirm('ล้างภาพวาดทั้งหมดในรอบนี้?'))return;
  DG.busy=true;
  try{
    const {error}=await sb.rpc('dg_clear_canvas',{p_session_id:DG.state.session_id,p_round_no:DG.state.round_no,p_drawer_id:ME.id});if(error)throw error;
    DG.live.clear();DG.state.strokes=[];dgRenderCanvas();dgBroadcast('canvas_cleared');
  }catch(e){toast(dgError(e));}
  finally{DG.busy=false;}
}
function dgPoint(e){const r=DG.canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
function dgPointerDown(e){
  if(!dgIsDrawer()||DG.busy)return;
  e.preventDefault();try{DG.canvas.setPointerCapture(e.pointerId);}catch(_){}
  const [x,y]=dgPoint(e),id=(window.crypto&&window.crypto.randomUUID)?window.crypto.randomUUID():'dg-'+ME.id+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  DG.current={pointerId:e.pointerId,id,color:DG.color,width:DG.size,erase:DG.eraser,points:[x,y,x,y],sent:0};
  DG.live.set(id,{id,color:DG.color,width:DG.size,erase:DG.eraser,points:[x,y,x,y]});
  DG.pendingLive=[x,y];dgFlushLive(true);dgRenderCanvas();
}
function dgPointerMove(e){
  if(!DG.current||e.pointerId!==DG.current.pointerId)return;
  e.preventDefault();const events=e.getCoalescedEvents?e.getCoalescedEvents():[e];
  for(const ev of events){const [x,y]=dgPoint(ev),p=DG.current.points,n=p.length;if(n>=4000)break;if(Math.hypot((x-p[n-2])*960,(y-p[n-1])*720)>1.2){p.push(x,y);DG.pendingLive.push(x,y);}}
  const live=DG.live.get(DG.current.id);if(live)live.points=DG.current.points;
  dgFlushLive(false);dgRenderCanvas();
}
function dgPointerUp(e){
  if(!DG.current||e.pointerId!==DG.current.pointerId)return;
  e.preventDefault();const stroke=DG.current;DG.current=null;dgFlushLive(true);dgSaveCompletedStroke(stroke);
}
function dgFlushLive(force){
  if(!DG.current||!DG.pendingLive.length)return;
  const now=Date.now();if(!force&&now-DG.lastLiveAt<70)return;
  const points=DG.pendingLive.splice(0);DG.lastLiveAt=now;
  if(S.chan)S.chan.send({type:'broadcast',event:'draw_guess',payload:{type:'stroke_live',session_id:DG.state.session_id,round_no:DG.state.round_no,drawer_id:ME.id,stroke_id:DG.current.id,color:DG.current.color,width:DG.current.width,erase:DG.current.erase,points}}).catch(()=>{});
}
async function dgSaveCompletedStroke(stroke){
  if(stroke.points.length<4){DG.live.delete(stroke.id);dgRenderCanvas();return;}
  const payload={id:stroke.id,color:stroke.color,width:stroke.width,erase:stroke.erase,points:stroke.points};
  try{
    const {error}=await sb.rpc('dg_save_stroke',{p_session_id:DG.state.session_id,p_round_no:DG.state.round_no,p_drawer_id:ME.id,p_stroke:payload});if(error)throw error;
    DG.live.delete(stroke.id);dgBroadcast('stroke_saved',{stroke_id:stroke.id});
    await dgRefreshState(true);
  }catch(e){DG.live.delete(stroke.id);dgRenderCanvas();dgBroadcast('stroke_discarded',{stroke_id:stroke.id});toast('บันทึกเส้นไม่สำเร็จ: '+dgError(e));}
}
function dgDrawStroke(g,stroke,W,H){
  const p=stroke.points||[];if(p.length<2)return;
  g.save();g.globalCompositeOperation=stroke.erase?'destination-out':'source-over';g.strokeStyle=stroke.color||'#252525';g.lineWidth=Math.max(1,(stroke.width||.006)*Math.min(W,H));g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(p[0]*W,p[1]*H);
  for(let i=2;i<p.length;i+=2)g.lineTo(p[i]*W,p[i+1]*H);
  if(p.length===2)g.lineTo(p[0]*W+.1,p[1]*H+.1);
  g.stroke();g.restore();
}
function dgRenderCanvas(){
  if(!DG.canvas||!DG.ctx)return;
  const cv=DG.canvas,W=Math.max(1,cv.clientWidth),H=Math.max(1,cv.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);}
  const g=DG.ctx;g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);g.fillStyle='#fffdf8';g.fillRect(0,0,W,H);
  const saved=(DG.state&&DG.state.strokes)||[];
  saved.forEach(row=>dgDrawStroke(g,row.stroke||row,W,H));
  DG.live.forEach(stroke=>dgDrawStroke(g,stroke,W,H));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',dgBuildUI,{once:true});else dgBuildUI();
