/* ---------- the game table ----------
   The coffee table is a game table: it holds one game at a time and anyone can switch.
   Add a new game by adding an entry here (and something to draw in drawTable).
   Switching only changes what the table shows/opens; each game keeps its own saved state
   (an unfinished jigsaw stays on the server and comes back when you switch back). */
const TABLE_GAMES = [
  { id: 'jigsaw', name: 'จิ๊กซอว์', icon: 'puzzle', desc: 'ต่อภาพด้วยกัน ภาพที่ต่อค้างไว้จะยังอยู่', play(){ tableTapped(); } },
  { id: 'guess', name: 'วาดภาพทายคำ', icon: 'pad', desc: 'ผลัดกันวาด คนอื่นทายคำ', play(){ openDrawGuess(); } },
  { id: 'chain', name: 'ต่อคำ', icon: 'tiles', desc: 'ผลัดกันต่อคำภาษาไทย คิดไม่ทันเสียหัวใจ เล่นคนเดียวก็ได้', play(){ wcOpen(); } }
];
const Table = { mode: 'jigsaw', at: 0, fx: 0 };
(() => { const m = LS.get('jt-table', null); if (m && TABLE_GAMES.some(g => g.id === m.mode)){ Table.mode = m.mode; Table.at = m.at || 0; } })();
const tableGame = () => TABLE_GAMES.find(g => g.id === Table.mode) || TABLE_GAMES[0];
function setTableMode(id, at, fromNet){
  if (!TABLE_GAMES.some(g => g.id === id)) return;
  const changed = id !== Table.mode;
  Table.mode = id; Table.at = at || serverNow(); LS.set('jt-table', { mode: id, at: Table.at });
  if (changed){ Table.fx = performance.now(); sfxTurn(); }
  if (!fromNet && S.chan) S.chan.send({ type: 'broadcast', event: 'table', payload: { k: ME.id, name: ME.name, mode: id, at: Table.at } }).catch(() => {});
  if (changed && fromNet && fromNet.name) toast(`${fromNet.name} เปลี่ยนโต๊ะเป็น${tableGame().name}`);
  if (!$('#tableSheet').hidden) renderTableSheet();
}
function onTable(m){ if (m && m.at > Table.at) setTableMode(m.mode, m.at, m); }
/* someone just joined and asks what's on the table; whoever knows answers */
function onTableAsk(m){ if (Table.at && S.chan) setTimeout(() => S.chan.send({ type: 'broadcast', event: 'table', payload: { k: ME.id, mode: Table.mode, at: Table.at } }).catch(() => {}), Math.random() * 600); }
function askTable(){ if (S.chan) S.chan.send({ type: 'broadcast', event: 'table?', payload: { k: ME.id } }).catch(() => {}); }

function openTableSheet(){ audioInit(); renderTableSheet(); $('#tableSheet').hidden = false; }
function renderTableSheet(){
  const box = $('#tgList'); box.innerHTML = '';
  TABLE_GAMES.forEach(gm => {
    const on = gm.id === Table.mode, card = document.createElement('div'); card.className = 'tg' + (on ? ' on' : '');
    const ic = document.createElement('canvas'); ic.className = 'px'; paintIcon(ic, gm.icon);
    const tx = document.createElement('div'); tx.className = 'tg-t';
    tx.innerHTML = `<b></b><small></small>`; tx.querySelector('b').textContent = gm.name + (on ? ' · อยู่บนโต๊ะ' : ''); tx.querySelector('small').textContent = gm.desc;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn ' + (on ? 'primary' : 'soft');
    btn.textContent = on ? 'เล่นเลย' : 'สลับมาเล่น';
    btn.onclick = () => { if (!on){ setTableMode(gm.id); } $('#tableSheet').hidden = true; gm.play(); };
    card.append(ic, tx, btn); box.appendChild(card);
  });
}
$('#tgClose').onclick = () => { $('#tableSheet').hidden = true; };
$('#tableSheet').addEventListener('click', e => { if (e.target.id === 'tableSheet') $('#tableSheet').hidden = true; });
