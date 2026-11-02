/* ---------- HUD, tools, tray ---------- */
const allPlaced = () => S.pieces.length > 0 && S.pieces.every(p => p.srv.state === 'placed');
function checkDone(){ if (!S.doneShown && allPlaced()) complete(false); }
function updateProg(){
  let placed = 0, inTray = 0, loose = 0;
  S.pieces.forEach(p => { if (p.srv.state === 'placed') placed++; else if (p.srv.state === 'tray') inTray++; else loose++; });
  $('#prog').textContent = `${placed} / ${S.pieces.length}`;
  $('#trayCount').textContent = `ในถาด ${inTray}` + (loose ? ` · พักบนกระดาน ${loose}` : '');
  let empty = tray.querySelector('.tray-empty');
  if (inTray === 0 && !empty){ empty = document.createElement('div'); empty.className = 'tray-empty'; tray.appendChild(empty); }
  if (inTray > 0 && empty){ empty.remove(); empty = null; }
  if (empty) empty.textContent = loose ? 'ถาดว่างแล้ว ที่เหลือพักอยู่บนกระดาน' : 'ถาดว่างแล้ว';
}
function applyFilter(){
  let shown = 0;
  S.pieces.forEach(p => { const hide = S.filterEdges && !p.edge; p.slot.hidden = hide; if (!hide && p.srv.state === 'tray') shown++; });
  if (S.filterEdges && shown === 0){ S.filterEdges = false; setPressed('#tEdge', false); applyFilter(); toast('ชิ้นขอบหมดถาดแล้ว'); }
}
function setPressed(sel, v){ $(sel).setAttribute('aria-pressed', v ? 'true' : 'false'); }
$('#tRef').onclick = () => { const r = $('#ref'); r.hidden = !r.hidden; setPressed('#tRef', !r.hidden); };
$('#ref').onclick = () => { $('#ref').hidden = true; setPressed('#tRef', false); };
$('#tGhost').onclick = () => { S.ghost = !S.ghost; board.classList.toggle('ghost-on', S.ghost); setPressed('#tGhost', S.ghost); LS.set('jt-ghost', S.ghost); };
$('#tEdge').onclick = () => { S.filterEdges = !S.filterEdges; setPressed('#tEdge', S.filterEdges); applyFilter(); tray.scrollLeft = 0; };
$('#tGather').onclick = async () => {
  const loose = S.pieces.filter(p => p.srv.state === 'loose' && !p.holder);
  if (!loose.length){ toast('ไม่มีชิ้นพักอยู่บนกระดาน'); return; }
  loose.forEach(p => { p.srv = { ...p.srv, state: 'tray' }; p.inflight++; show(p); p.slot.hidden = S.filterEdges && !p.edge; });
  updateProg(); tray.scrollLeft = 0;
  try { const { error } = await sb.rpc('gather_loose', { p_room: S.code, p_pass: S.pass }); if (error) throw error; } catch(e){ toast('เก็บชิ้นไม่สำเร็จ ลองใหม่อีกครั้ง'); }
  loose.forEach(p => { p.inflight--; p.lastRow = null; });
  refetch();
};
$('#tShuffle').onclick = () => { shuffle([...tray.querySelectorAll('.slot')]).forEach(s => tray.appendChild(s)); const e = tray.querySelector('.tray-empty'); if (e) tray.appendChild(e); tray.scrollLeft = 0; };
$('#tSound').onclick = () => { soundOn = !soundOn; setPressed('#tSound', soundOn); $('#wave').style.opacity = soundOn ? 1 : .15; if (soundOn){ audioInit(); sfxSnap(); } };
$('#tl').onclick = () => tray.scrollBy({ left: -tray.clientWidth * .8, behavior: 'smooth' });
$('#tr').onclick = () => tray.scrollBy({ left: tray.clientWidth * .8, behavior: 'smooth' });
tray.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)){ tray.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
function complete(silent){
  S.doneShown = true; if (!S.doneAt) S.doneAt = Date.now();
  tickTime();
  $('#doneInfo').textContent = `${S.pieces.length} ชิ้น · ใช้เวลา ${fmtT(Math.max(0, Math.round((S.doneAt - S.created) / 1000)))}` + (S.rotate ? ' · ระดับยาก' : '');
  $('#done').hidden = false; $('#full').classList.add('show');
  if (silent) return;
  sfxDone();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = ['#e8728c', '#38b2a6', '#ffd36e', '#a78bfa', '#fff'];
  for (let i = 0; i < 46; i++){
    const s = document.createElement('span'); s.className = 'conf';
    s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % cols.length];
    s.style.setProperty('--d', S.H + 30 + 'px'); s.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    s.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; s.style.animationDelay = Math.random() * .6 + 's';
    board.appendChild(s);
  }
}

function tickTime(){ if (!S.game) return; const end = S.doneAt || Date.now(); $('#time').textContent = fmtT(Math.max(0, Math.floor((end - S.created) / 1000))); }
setInterval(tickTime, 1000);

let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#game').hidden){ layout(); S.pieces.forEach(p => { if (p.where !== 'drag') sizeFor(p); posTag(p); }); } else drawPreview(); }, 120); });
