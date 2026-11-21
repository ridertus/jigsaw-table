"""สร้างพจนานุกรมของเกมต่อคำ: assets/words-th.txt + supabase/word_chain_letters.sql

ที่มา: words_th.txt ของ PyThaiNLP (CC0-1.0)
    pip download pythainlp --no-deps -d /tmp/ptn && unzip /tmp/ptn/*.whl -d /tmp/ptnx
    python3 tools/words-th-build.py /tmp/ptnx/pythainlp/corpus/words_th.txt [/tmp/ptnx/pythainlp/corpus/profanity_th.txt]

กติกาตัวอักษร (ต้องตรงกับ wcHead ใน src/lobby/word-chain.js และ wc_head ใน supabase/word_chain.sql):
ตัวขึ้นต้น = พยัญชนะตัวแรกหลังสระหน้า (เ แ โ ใ ไ)
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1])
bad = set()
if len(sys.argv) > 2:
    bad = {l.strip() for l in pathlib.Path(sys.argv[2]).read_text(encoding='utf-8-sig').splitlines() if l.strip()}

ok = re.compile(r'^[ก-ฺเ-๎]{2,20}$')   # ตัวไทยล้วน ไม่มีช่องว่าง/จุด/ตัวเลขไทย
head = re.compile(r'^[เ-ไ]*([ก-ฮ])')
words = set()
for line in src.read_text(encoding='utf-8-sig').splitlines():
    w = line.strip()
    if not ok.match(w) or w in bad or not head.match(w):
        continue
    if w.endswith('ๆ'):  # ๆ
        continue
    words.add(w)

words = sorted(words)
(root / 'assets' / 'words-th.txt').write_text('\n'.join(words) + '\n', encoding='utf-8')

counts = {}
for w in words:
    h = head.match(w).group(1)
    counts[h] = counts.get(h, 0) + 1
rows = ',\n'.join(f"  ('{k}', {v})" for k, v in sorted(counts.items()))
sql = f"""-- สร้างจาก tools/words-th-build.py ห้ามแก้ด้วยมือ ({len(words)} คำ)
-- จำนวนคำในพจนานุกรมที่ขึ้นต้นด้วยแต่ละตัว ใช้ตัดสินว่าตัวอักษรไหน "ต่อยากเกินไป" แล้วต้องสุ่มตัวใหม่
create table if not exists public.wc_letters (letter text primary key, n integer not null);
alter table public.wc_letters enable row level security;
revoke all on public.wc_letters from anon, authenticated;
truncate public.wc_letters;
insert into public.wc_letters(letter, n) values
{rows};
"""
(root / 'supabase' / 'word_chain_letters.sql').write_text(sql, encoding='utf-8')
print(len(words), 'words;', len(counts), 'letters')
print(sorted(counts.items(), key=lambda x: x[1]))
