# โต๊ะจิ๊กซอว์ · บันทึกโปรเจกต์

เกมต่อจิ๊กซอว์บนเว็บ ทำให้เพื่อนที่ชอบมินิเกมจิ๊กซอว์ใน Heartopia เล่นบน iPad และมือถือเป็นหลัก
หน้าตาและการเล่นอิง Heartopia: กระดานกรอบไม้ตรงกลาง ชิ้นอยู่ในถาดด้านล่าง ลากขึ้นไปวาง

**แชทใหม่: อ่านไฟล์นี้ก่อน แล้วค่อยเปิดเฉพาะไฟล์ที่เกี่ยวกับงาน**

## หน้าเว็บ (GitHub Pages: https://ridertus.github.io/jigsaw-table/)

| ไฟล์ที่ขึ้นเว็บ | คืออะไร | สถานะ |
|---|---|---|
| `index.html` | เล่นคนเดียว ไม่ต่อเน็ต บันทึกใน localStorage | ใช้งานจริง หน้าหลัก |
| `lobby.html` | ห้องนั่งเล่นพิกเซล เดินได้ แชท วิทยุ YouTube โต๊ะจิ๊กซอว์ต่อด้วยกัน | ใช้งานได้ เรียลไทม์ทำงานแล้ว (2 พ.ย. 2026) |
| `multi.html` | เวอร์ชันหลายคนแบบเก่า มีห้อง รหัสผ่าน หน้ารวมห้อง | เก็บไว้ทดสอบ ไม่มีลิงก์จากหน้าหลัก |

**ห้ามแก้ไฟล์ .html ที่ root ตรง ๆ** มันถูกสร้างจาก `src/` แก้ที่ `src/` แล้ว build:

```
python3 src/solo/build.py    # -> index.html  (ต้นฉบับคือ src/solo/page.html ไฟล์เดียว)
python3 src/multi/build.py   # -> multi.html
python3 src/lobby/build.py   # -> lobby.html
```

build แค่ต่อไฟล์เข้าด้วยกัน (ไม่มี npm, ไม่มี bundler) ทุกหน้าเป็นไฟล์เดียวจบ
`src/solo/page.html` เป็นเวอร์ชันเดียวกับ Claude artifact "โต๊ะจิ๊กซอว์" (ไม่มี `<html><head>` ของตัวเอง build.py ห่อให้)

### ลำดับไฟล์ใน `src/lobby/` (ทุกไฟล์อยู่ใน IIFE เดียวกัน ใช้ตัวแปรร่วมกัน)
- `base.css` `extra.css` `lobby.css` สไตล์ (โทนไม้ครีม เขียวมิ้นต์ ฟอนต์ Mitr + Nunito)
- `body.html` โครง HTML ทั้งหมด: `#room` canvas, แชท, mini player, `#game` (หน้าต่างจิ๊กซอว์), `#enter` `#setup` `#radio` `#settings`
- `prelude.js` utilities, `$`, `COUNTS`, `MAXN=500`
- `common.js` รูปทรงชิ้น (`BASE`, `makeEdges`, `edgePts`, `piecePath`), รูปตัวอย่าง `paintSample`, เสียง (Web Audio)
- `head.js` Supabase client, `ME` (id/ชื่อ/สี/ผม ใน localStorage `jt-me`), `S` (สถานะจิ๊กซอว์), `L` (สถานะห้อง), `drawChar` ตัวละครพิกเซล, หน้าเลือกตัวละคร
- `room.js` ห้อง 20×12 ช่อง ช่องละ 12px, `FURN` เฟอร์นิเจอร์+จุดแตะ, BFS เดิน, กล้อง, วาดชื่อ/บอลลูนแชท, ส่งตำแหน่ง `pos`
- `art.js` ภาพห้อง (`paintRoom`, `drawTable`, `drawRadio`, sprite ตัวละครมีเส้นขอบ)
- `puzzle.js` เอนจินจิ๊กซอว์ร่วมกัน: ลาก/วาง/หมุน, `write` -> RPC `move_piece`, รับ `drag`/`release`, `refetch` ทุก 10 วิ
- `hud.js` แถบความคืบหน้า เครื่องมือ (ภาพจาง ชิ้นขอบ เก็บกลับถาด สลับถาด) จอต่อเสร็จ
- `lobby.js` แชท, วิทยุ (`Radio` + YouTube IFrame API), โต๊ะ/รูปใหม่, ตั้งค่าเจ้าของบ้าน, presence, channel `lobby:main`, `enterLobby`

## Supabase
- โปรเจกต์ `jigsaw-table` id `slbgazdgvhjqhwwjifus` (สิงคโปร์, แพ็กเกจฟรี) ใน org "ridertus's Org"
- แพ็กเกจฟรีจะพักโปรเจกต์ถ้าไม่มีใครใช้ราว 7 วัน กดเปิดใหม่ในหน้า Supabase ได้
- ใช้ anon key ในหน้าเว็บ (เป็น key สาธารณะ ตั้งใจ) ผู้เล่นไม่ต้องสมัคร
- ประวัติ schema ดูได้ด้วย `list_migrations` (เช่น `jigsaw_rooms`, `room_passwords_and_lobby_v2`, `living_room_lobby`)

ตาราง (เปิด RLS, เขียนได้เฉพาะผ่าน RPC แบบ security definer):
- `rooms` รูป (data URL jpeg), cols, rows, edges (jsonb), rotate, name, host, thumb, pass_hash (bcrypt), active_at, done_at
- `pieces` (room, id) state = tray/loose/placed, fx, fy (0–1 ของกระดาน), rot 0–3
- `lobby` แถวเดียว id `main`: puzzle (รหัสห้องที่อยู่บนโต๊ะ), radio (jsonb), radio_mode all/owner, owner_hash
- `messages` แชท เก็บล่าสุด 300 ข้อความ (anon อ่านได้)

RPC: `create_room`, `open_room`, `list_rooms`, `move_piece` (ชิ้นที่ placed แล้วย้ายไม่ได้อีก), `gather_loose`,
`get_lobby` (คืนเวลาเซิร์ฟเวอร์ด้วยเพื่อ sync วิทยุ), `set_radio`, `set_radio_mode`, `claim_owner`, `check_owner`, `set_puzzle`, `send_message`

### Realtime (สำคัญ: เคยพังเพราะเรื่องนี้)
- ใช้ channel เดียว `lobby:main` เป็น broadcast ล้วน: `pos` `chat` `radio` `mode` `puzzle` `drag` `release`
- **ไม่ใช้ postgres_changes** และ **track presence ครั้งเดียวตอนเข้าห้อง** เท่านั้น
  เคยเรียก `track()` ทุกครั้งที่หยิบชิ้น -> โดน `ClientPresenceRateLimitReached` -> ค้าง "กำลังเชื่อมต่อ…"
- ชิ้นที่เพื่อนถืออยู่รู้จาก broadcast `drag` + heartbeat ทุก 1.5 วิ หมดอายุ 5 วิ
- ความจริงอยู่ในฐานข้อมูลเสมอ: broadcast ใช้แค่ให้ลื่น, `refetch()` ดึงสถานะจริงทุก 10 วิ
- หลุดแล้วต่อใหม่เอง (`scheduleReconnect` ถอยเวลา 3 วิ ถึง 30 วิ)
- ตรวจปัญหา: `query_logs` source `realtime_logs` และ `edge_logs`

## ทดสอบ
- เครื่องที่ Claude ทำงานเข้า supabase.co ไม่ได้ (proxy บล็อก) ทดสอบด้วย mock แทน:
  ทำ `window.supabase.createClient` ปลอม (เก็บข้อมูลใน localStorage + BroadcastChannel) แล้วเปิดสองแท็บด้วย Playwright
- ทดสอบของจริงต้องให้เจ้าของเปิดบนมือถือ+คอมพร้อมกัน แล้วดู log ของ Supabase

## ข้อตกลงกับเจ้าของงาน (RiDerTus)
- คุยภาษาไทย อะไรที่มีค่าใช้จ่ายต้องถามก่อน ชอบของฟรี
- push ขึ้น `main` ได้เลย (ติดตั้ง Claude GitHub App แล้ว) commit ด้วยชื่อ Claude <noreply@anthropic.com>
- โควตามีจำกัด: แชทละงาน, งานเล็กไม่ต้องเทสต์หนัก ถ้าเจ้าของบอก

## บั๊กที่แก้ไปแล้ว (อย่าทำซ้ำ)
- ถาดยาวดันความกว้างหน้า -> `#game` ต้องมี `grid-template-columns:minmax(0,1fr)` และลูกต้อง `min-width:0`
- ชิ้นค้างลอยบน Android เมื่อแตะขอบช่อง -> `setPointerCapture` บน `documentElement` + `settleDrag` เมื่อ touchend/blur
- ชิ้นกระโดดตอนหยิบจากกระดาน -> ตอน `where === 'drag'` ต้องล้าง left/top เป็น 0
- ชื่อ `S.ch` ชนกับความสูงช่อง -> channel ใช้ `S.chan`

## ไอเดียที่ค้างไว้
- ฟีเจอร์ต่อด้วยกัน: เห็นจุดนิ้วเพื่อน, นับว่าใครวางกี่ชิ้น, แตะค้างเพื่อชี้จุด, อีโมจิ
- ป้ายสถานะการเชื่อมต่อแบบกดดูรายละเอียดได้
- คุยด้วยเสียง (WebRTC ต้องใช้ TURN อาจมีค่าใช้จ่าย)
- ให้ `lobby.html` เป็นหน้าหลักเมื่อเสถียร
- ภาพห้องโทนอุ่นยุค 70 วาดเองใน Aseprite: canvas 384×216, เลเยอร์ `bg` `obj_*` `fg` `light` `mask`
  (mask: เขียว #00FF00 เดินได้, แดง #FF0000 จุดแตะโต๊ะ, น้ำเงิน #0000FF จุดแตะวิทยุ),
  ตัวละคร 24×36 4 ทิศ × 4 เฟรม เสื้อสี #FF00FF/#AA00AA ให้เกมเปลี่ยนสี
- อนาคต: เวอร์ชัน 3D แบบ Heartopia ด้วย Three.js (ใช้ระบบเชื่อมต่อเดิมได้)
