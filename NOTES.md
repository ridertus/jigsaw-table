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
- `head.js` Supabase client, `ME` (id/ชื่อ/ตัวละคร `ch` 0–4 ใน localStorage `jt-me`, สีชื่อมากับตัวละคร), `S` (สถานะจิ๊กซอว์), `L` (สถานะห้อง),
  ตัวละคร 5 ตัว (`CHARS`) เป็น sprite จาก PixelLab: `assets/chars/chars.png` แถวละตัว = ยืน 8 ทิศ | เดิน S,E,N,W ×4 เฟรม | นั่ง 8 ทิศ
  (ลำดับทิศ S, SE, E, NE, N, NW, W, SW) `build.py` ฝังภาพนี้ลงหน้าเว็บ, `charCol`/`charFeet` เลือกเฟรมและเส้นเท้า, หน้าเลือกตัวละคร
- ภาพตัวละครสร้างด้วย `tools/chars-build.py` จาก GIF ท่ายืน 8 ทิศของ PixelLab 5 ไฟล์ + ท่านั่งของตัวหูฟัง (ตัวอื่นใช้หัวตัวเองบนตัวนั่งของตัวหูฟังที่เปลี่ยนสีเสื้อ/กางเกง/รองเท้า, ผมยาววางทับกลับ) ท่าเดินสร้างจากท่ายืน (ขายกสลับ+ตัวเด้ง)
- `room.js` ห้อง 22×13 ช่อง ช่องละ 24px (ผนัง 4 แถวบน), `FURN` = จุดแตะ (`hit` สี่เหลี่ยมพิกเซล, `block` ช่องที่เดินไม่ได้, `spots` ช่องที่ต้องยืนใช้, `act` table/radio/window/board/tv/sit),
  `SEATS` ที่นั่ง (โซฟา 4, บีนแบ็ก, เบาะรอบโต๊ะ 5) แตะแล้วเดินไปนั่ง, BFS เดิน, กล้อง, บับเบิลแชทแบบพิกเซล + "…" ตอนเพื่อนพิมพ์ + โน้ตพิกเซลลอย (มิ้นต์+ส้ม ไม่มีกล่อง `drawMusicNotes`) ตอนนั่งฟังวิทยุ, ส่ง `pos` (มี `sit`, `ch`, **`v:2`** เพราะพิกัดห้องใหม่ไม่ตรงกับเวอร์ชันเก่า)
- `art.js` ภาพห้อง: `paintRoom` วาดพื้น/ผนัง/ของแบน ๆ ลง `bg`, ของที่เดินอ้อมหลังได้เป็น prop (`makeProp` แต่ละชิ้นมี canvas + `base` เส้นฐาน) แล้ว `frame` เรียงวาดตาม y ร่วมกับตัวละคร,
  ส่วนที่ขยับ (`live`): จานเสียง, ทีวี, จิ๊กซอว์บนโต๊ะ, กระดานบนขาตั้ง, พัดลม, แมวหลับ, นาฬิกา/อีควอไลเซอร์ (`drawWallLive`), sprite ตัวละครมีเส้นขอบ (`charSprite` cache)
- `pets.js` แมว 3 ตัว (โมจิ ข้าวปั้น โกโก้) ภาพจาก PixelLab (`assets/chars/cats.png` จาก `tools/cats-build.py`: แมวส้มยืน+นอนขด 8 ทิศ, แมวขาว/ดำเปลี่ยนสีจากตัวส้ม, ท่าเดินสร้างจากท่ายืน), แมวที่นอนตรงที่มีคนนั่งจะขึ้นไปนอนบนตัก, ตารางเวลาคำนวณจาก `serverNow()` ทุกคนจึงเห็นแมวตรงกันโดยไม่ต้องส่งข้อมูล: แบ่งเวลาเป็นช่อง ช่องละ ~1 นาที แต่ละช่องแมวเดินไปจุด `CAT_SPOTS` (กระโดดขึ้นโซฟา/โต๊ะ/ตู้/ทีวี) แล้วนอน/นั่ง หรือบางช่องเดินตามคน, แตะแมว = ลูบ (broadcast `pet` หัวใจลอยทุกจอ)
- `table-games.js` โต๊ะเกม: `TABLE_GAMES` (จิ๊กซอว์, วาดภาพทายคำ, ต่อคำ — เพิ่มเกมใหม่ที่นี่ + วาดใน `drawTable`), ใครก็สลับได้ (broadcast `table`, คนเข้าใหม่ถาม `table?`), แต่ละเกมเก็บสถานะของตัวเอง
- `icons.js` ไอคอนพิกเซล 20×20 ของ HUD (วาดด้วยชุดเครื่องมือเดียวกับ art.js ลง `<canvas class="px" data-px="...">`)
- `puzzle.js` เอนจินจิ๊กซอว์ร่วมกัน: ลาก/วาง/หมุน, `write` -> RPC `move_piece`, รับ `drag`/`release`, `refetch` ทุก 10 วิ
- `hud.js` แถบความคืบหน้า เครื่องมือ (ภาพจาง ชิ้นขอบ เก็บกลับถาด สลับถาด) จอต่อเสร็จ
- `ambient.js` สภาพอากาศ (แชร์ทั้งห้อง: `L.weather`, RPC `set_weather`, broadcast `weather`), วาดวิวหน้าต่าง (ฟ้า+บ้านไกล ๆ+ฝน), แสงห้อง (multiply ตามอากาศ + แสงโคมแบบ screen), ฟ้าแลบ, มิกเซอร์เสียงบรรยากาศสังเคราะห์ด้วย Web Audio (ไม่มีไฟล์เสียง, ตั้งค่าต่อเครื่องใน localStorage `jt-amb`), อีโมจิด่วน (broadcast `emo`)
- `board.js` กระดานวาดร่วมกัน (เปิดจากกระดานบนผนังในห้อง หรือ `openBoard()`): กระดาษไม่สิ้นสุด เลื่อน/ซูม (สองนิ้ว, ล้อเมาส์, Ctrl+ล้อ = ซูม, Space+ลาก),
  เครื่องมือ มือ (เลื่อน + ลากโน้ต/ข้อความ, แตะสองครั้งแก้) ปากกา ปากกาเน้น ยางลบ (ลบทั้งเส้น) ข้อความ โน้ตแปะ, undo/redo (เฉพาะของตัวเอง ย้อนการล้างกระดานได้)
  ถ้าเคยใช้ Apple Pencil นิ้วเดียวจะกลายเป็นเลื่อนกระดานแทน, ภาพย่อกระดานโชว์บนผนังห้อง (`drawWallBoard`)
- `board.css` สไตล์กระดาน (โหลดหลัง lobby.css)
- `draw-guess.js` + `draw-guess.css` เกมวาดภาพทายคำ v3 (`DG`): หน้ารวมห้อง/ฟอร์มสร้างห้อง/ห้องรอ/กระดานวาด/แชท-ทายช่องเดียว, `DG.onBroadcast` ถูกต่อใน `lobby.js` (event `draw_guess`)
  ตารางและ RPC ชุด `dg3_*` (ดูรายละเอียด/วิธีติดตั้ง/วิธีเพิ่มคำใน `DRAW_GUESS_DEPLOY.md`), ชุดเก่า `draw_guess_*`/`dg_*` เก็บไว้ ใช้คลังคำ `draw_guess_words` ร่วมกัน
  เส้นวาดใช้พิกัด 0–1 บนผ้าใบ 4:3, ยางลบเฉพาะจุด = เส้น `erase:true` (destination-out), ลบทั้งเส้น = `dg3_delete_strokes`
  ทดสอบแบบไม่ต้องมี Supabase จริงด้วย pglite + playwright (mock client ส่ง rpc เข้า pglite) ถ้ากลับมาแก้อีก
- `word-chain.js` + `word-chain.css` เกมต่อคำภาษาไทย (`WC`, เพิ่ม 21 พ.ย. 2026): หน้ารวมห้อง/ฟอร์ม/ห้องรอ/หน้าเล่น/ผลจบเกม ใช้ตัวช่วยและคลาส `.dg-*` ของวาดภาพทายคำ (ต้องโหลดหลัง draw-guess.js)
  RPC ชุด `wc_*`, broadcast event `word_chain` (ต่อใน `lobby.js`), พจนานุกรม `assets/words-th.txt` โหลดตอนเปิดเกม — กติกา/วิธีติดตั้ง/สถานะใน `WORD_CHAIN_DEPLOY.md`
  **ยังไม่ได้รัน SQL บน Supabase จริง** ต้องรัน `supabase/word_chain.sql` + `word_chain_letters.sql` ก่อนเกมจะใช้ได้
- มินิเพลเยอร์วิทยุ (`#mini` มุมขวาบน) โทนเข้มแบบ HUD, ปุ่มพับเหลือไอคอนวิทยุพิกเซล, **โหมดทีวี** (ปุ่มจอ, `Radio.tv`, localStorage `jt-tv`, ค่าเริ่มต้นเปิด): iframe YouTube (`#ytWrap` กล่อง 320×180 ไม่ย่อจริงเพราะ YouTube ต้องการ ≥200px) ถูก `placeTv()` ใน room.js ย้าย/ย่อด้วย transform ไปทับจอทีวีทุกเฟรม (จอ = พิกัดห้อง x16 y106 กว้าง48; วิดีโอ 48×27 มีแถบดำ), pointer-events:none เพื่อให้แตะทีวีเปิดวิทยุได้, ซ่อนนอกจอตอนเปิดจิ๊กซอว์/กระดาน; `drawTvScreen` วาดจอดำรองไว้ ข้อจำกัด: iframe ทับตัวละครที่เดินผ่านหน้าทีวี
- เพลย์ลิสต์วิทยุ: วางลิงก์ที่มี `list=` ได้ (`resolveRadioInput` ใน lobby.js) — state ที่แชร์ยังเป็น vid+queue (สูงสุด 30) จึงขยายลิสต์เป็นรายการในคิว โดยใช้ YT.Player ที่ซ่อนไว้โหลดลิสต์แล้วอ่าน `getPlaylist()` (ไม่ต้องใช้ API key); ถ้าเปิดลิสต์ไม่ได้ (Mix `RD…` มักฝังไม่ได้) จะ fallback เป็นคลิปเดี่ยว (`v=` หรือเพลงต้นทางใน `RD`+videoId); มีเช็กบ็อกซ์สุ่มลำดับ; ชื่อเพลงในคิวเติมทีหลังจาก noembed (`fillQueueTitles`) **ยังไม่ได้ทดสอบกับ YouTube จริง** (ทดสอบด้วย YT.Player ปลอมเท่านั้น)
- HUD (body.html + lobby.css ส่วน HUD): ป้ายห้องซ้ายบน, ปุ่มกลมขวาบน (คนในห้อง/ตั้งค่า/ออก), แชทพาเนลซ้ายล่าง, dock ขวาล่าง (จิ๊กซอว์ วาดรูป วาดทายคำ วิทยุ อากาศ) มือถือจะซ้อนเป็นสองแถว
  ตอนเปิดจิ๊กซอว์/กระดาน แชทจะกลายเป็นแถบเต็มความกว้างด้านล่าง (`--chatH`) และ dock ซ่อน
- `lobby.js` แชท (มีหน้าเล็ก ๆ ของคนพูด, broadcast `typing`), วิทยุ (`Radio` + YouTube IFrame API), โต๊ะ/รูปใหม่, ตั้งค่าเจ้าของบ้าน, presence, channel `lobby:main`, `enterLobby`

## ตัวละครแต่งตัวได้ (กำลังทำ, 17 พ.ย. 2026)
- หุ่นเปล่าจาก PixelLab (template mannequin, 48×48, 8 ทิศ, low top-down) อยู่ที่ `assets/doll/pixellab/`
  export นี้ **ไม่มี animation** (แต่ละท่าเป็นภาพนิ่ง 8 ทิศ): `Idle`, `walking_small_arm_s` (ท่าก้าว), `sitting_on_a_floor_c` (มีเบาะติดมา โค้ดลบให้), `standing_idle_gentl` (ยังไม่ใช้)
  หัวอยู่ตำแหน่งเดียวกันทุกท่า ทุกท่าใช้ชุดสี 35 สีเดียวกัน จึงแยกผิว/เสื้อขาว/เส้นขอบด้วยสีได้
- `tools/doll/`: `seg.py` แยกส่วน + ลบเบาะ, `doll.py` วาดตา (ลบตา PixelLab ก่อน), สีผิว, ผม 6 ทรง (ผมหน้า/ผมหลังวาดหลังตัว), เสื้อ, กางเกง, รองเท้า, แว่น ทีละเฟรมจากรูปทรงของเฟรมนั้น,
  `build.py looks.json out.png [--gif x.gif]` สร้าง atlas แบบเดียวกับ `chars.png` (ท่าเดิน = ก้าว / ยืนยกขึ้น 1px / ก้าวกลับด้าน (S,N) / ยืน), `options.py` แผ่นรวมตัวเลือก
- รอบ 2 (chibi): หุ่น PixelLab หัวเล็กกว่าตัวเก่ามาก (หัว 19px/ตัว 25px vs ตัวเก่า หัว ~27px/ตัว ~18px)
  `chibi.py` ตัดแถวลำตัว/ขา + หุบแขน แล้วใส่หัวที่ `head.py` เรนเดอร์เอง (SDF 3D จิ๋ว: หัว หู คอ + ผม 9 ทรง, ตาอนิเมะ 7 แบบ วาดเป็น decal ตามตำแหน่งที่ฉาย)
  มุมหันใช้ตามตัวเก่า (SE 32°, E 70°) ไม่ใช่ 45/90, `compare.py out.png` วางเทียบตัวเก่า, `chibi-options.py out.png` แผ่นรวมทรงผม/ตา
- ยังไม่ได้ต่อเข้าเกม

## Supabase
- โปรเจกต์ `jigsaw-table` id `slbgazdgvhjqhwwjifus` (สิงคโปร์, แพ็กเกจฟรี) ใน org "ridertus's Org"
- แพ็กเกจฟรีจะพักโปรเจกต์ถ้าไม่มีใครใช้ราว 7 วัน กดเปิดใหม่ในหน้า Supabase ได้
- ใช้ anon key ในหน้าเว็บ (เป็น key สาธารณะ ตั้งใจ) ผู้เล่นไม่ต้องสมัคร
- ประวัติ schema ดูได้ด้วย `list_migrations` (เช่น `jigsaw_rooms`, `room_passwords_and_lobby_v2`, `living_room_lobby`)

ตาราง (เปิด RLS, เขียนได้เฉพาะผ่าน RPC แบบ security definer):
- `rooms` รูป (data URL jpeg), cols, rows, edges (jsonb), rotate, name, host, thumb, pass_hash (bcrypt), active_at, done_at
- `pieces` (room, id) state = tray/loose/placed, fx, fy (0–1 ของกระดาน), rot 0–3
- `lobby` แถวเดียว id `main`: puzzle (รหัสห้องที่อยู่บนโต๊ะ), radio (jsonb), radio_mode all/owner, owner_hash, weather (sun/sunset/night/drizzle/rain/storm)
- `messages` แชท เก็บล่าสุด 300 ข้อความ (anon อ่านได้)
- `board_items` กระดานวาด (id สร้างจากฝั่งเครื่อง, kind pen/text/note, data jsonb) anon อ่านได้ เก็บสูงสุด 4000 ชิ้น (เกินแล้วลบเก่าสุด)
  pen: `{c,w,hl?,p:[x,y,...]}` พิกัดโลก, text: `{x,y,t,s,c}`, note: `{x,y,t,bg,by}` ขนาด 180

RPC: `create_room`, `open_room`, `list_rooms`, `move_piece` (ชิ้นที่ placed แล้วย้ายไม่ได้อีก), `gather_loose`,
`get_lobby` (คืนเวลาเซิร์ฟเวอร์ด้วยเพื่อ sync วิทยุ), `set_radio`, `set_radio_mode`, `claim_owner`, `check_owner`, `set_puzzle`, `send_message`, `set_weather`,
`board_add(p_items jsonb[])` (upsert), `board_del(p_ids)`, `board_clear()`

### Realtime (สำคัญ: เคยพังเพราะเรื่องนี้)
- ใช้ channel เดียว `lobby:main` เป็น broadcast ล้วน: `pos` `chat` `typing` `pet` `table` `table?` `radio` `mode` `puzzle` `drag` `release` `weather` `emo` `bd`
- `bd` = กระดาน: op `ink` (จุดของเส้นที่กำลังวาด ส่งทุก 100ms) `add` `del` `clear` `reload` (ของเยอะเกิน broadcast ให้โหลดจากฐานข้อมูลใหม่)
- **ไม่ใช้ postgres_changes** และ **track presence ครั้งเดียวตอนเข้าห้อง** เท่านั้น
  เคยเรียก `track()` ทุกครั้งที่หยิบชิ้น -> โดน `ClientPresenceRateLimitReached` -> ค้าง "กำลังเชื่อมต่อ…"
- ชิ้นที่เพื่อนถืออยู่รู้จาก broadcast `drag` + heartbeat ทุก 1.5 วิ หมดอายุ 5 วิ
- ความจริงอยู่ในฐานข้อมูลเสมอ: broadcast ใช้แค่ให้ลื่น, `refetch()` ดึงสถานะจริงทุก 10 วิ
- หลุดแล้วต่อใหม่เอง (`scheduleReconnect` ถอยเวลา 3 วิ ถึง 30 วิ)
- ตรวจปัญหา: `query_logs` source `realtime_logs` และ `edge_logs`

## ทดสอบ
- เครื่องที่ Claude ทำงานเข้า supabase.co ไม่ได้ (proxy บล็อก) ทดสอบด้วย mock แทน:
  ทำ `window.supabase.createClient` ปลอม (เก็บข้อมูลใน localStorage + BroadcastChannel) แล้วเปิดสองแท็บด้วย Playwright
  (สองแท็บใช้ localStorage ร่วมกัน -> `jt-me` ต้องแยกเป็น sessionStorage ตอนเทสต์ ไม่งั้น ME.id ซ้ำ และเพื่อนจะมองไม่เห็นกัน)
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
- กระดานวาด: ทำแล้ว (6 พ.ย. 2026) ต่อยอดได้ เช่น แทรกรูป, รูปทรง, เลือกหลายชิ้นแล้วย้าย, หลายหน้ากระดาน
- ถ้าเสียงสังเคราะห์ไม่ถูกใจ เปลี่ยนเป็นไฟล์เสียงจริง CC0 ทีละเสียงได้ (เจ้าของต้องโหลดมาให้ เครื่อง Claude โหลดเว็บไม่ได้)
- ฟีเจอร์ต่อด้วยกัน: เห็นจุดนิ้วเพื่อน, นับว่าใครวางกี่ชิ้น, แตะค้างเพื่อชี้จุด, อีโมจิ
- ป้ายสถานะการเชื่อมต่อแบบกดดูรายละเอียดได้
- คุยด้วยเสียง (WebRTC ต้องใช้ TURN อาจมีค่าใช้จ่าย)
- ให้ `lobby.html` เป็นหน้าหลักเมื่อเสถียร
- ภาพห้องโทนอุ่นยุค 70 วาดเองใน Aseprite: canvas 384×216, เลเยอร์ `bg` `obj_*` `fg` `light` `mask`
  (mask: เขียว #00FF00 เดินได้, แดง #FF0000 จุดแตะโต๊ะ, น้ำเงิน #0000FF จุดแตะวิทยุ),
  ตัวละคร 24×36 4 ทิศ × 4 เฟรม เสื้อสี #FF00FF/#AA00AA ให้เกมเปลี่ยนสี
- อนาคต: เวอร์ชัน 3D แบบ Heartopia ด้วย Three.js (ใช้ระบบเชื่อมต่อเดิมได้)
