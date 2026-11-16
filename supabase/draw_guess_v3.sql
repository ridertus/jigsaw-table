-- Draw & Guess v3 — ห้องหลายห้อง / ห้องรอ / แชทระหว่างเล่น / ลบเส้น / คำเพิ่ม
-- รันครั้งเดียวใน Supabase SQL Editor (รันซ้ำได้ปลอดภัย) จากนั้นรัน draw_guess_words_v3.sql เพื่อเพิ่มคำ
-- เป็นแบบ "เพิ่ม" อย่างเดียว: ตารางและฟังก์ชันชุดเก่า (draw_guess_*, dg_*) ไม่ถูกแตะ
-- ตารางและฟังก์ชันใหม่ขึ้นต้นด้วย dg3_ คลังคำใช้ตาราง draw_guess_words เดิมร่วมกัน
-- หมายเหตุ: ผู้เล่นเป็นแบบ guest (player_id จาก LocalStorage) ไม่ใช่ระบบยืนยันตัวตนจริง ดู DRAW_GUESS_DEPLOY.md

create table if not exists public.dg3_rooms (
  id uuid primary key default gen_random_uuid(),
  lobby_id text not null default 'main',
  name text not null,
  host_id text not null,
  status text not null check (status in ('waiting','drawing','reveal','ended')),
  settings jsonb not null default '{}'::jsonb,
  round_no integer not null default 0,
  drawer_id text,
  word text,
  word_aliases text[] not null default '{}',
  category text,
  used_words text[] not null default '{}',
  started_at timestamptz,
  ends_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dg3_rooms_open_idx on public.dg3_rooms (lobby_id, updated_at desc) where status <> 'ended';

create table if not exists public.dg3_players (
  room_id uuid not null references public.dg3_rooms(id) on delete cascade,
  player_id text not null,
  name text not null,
  score integer not null default 0,
  join_order integer not null,
  solved_at timestamptz,
  last_seen timestamptz not null default now(),
  left_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (room_id, player_id)
);
create index if not exists dg3_players_active_idx on public.dg3_players (player_id) where left_at is null;

create table if not exists public.dg3_strokes (
  seq bigint generated always as identity,
  id text primary key,
  room_id uuid not null references public.dg3_rooms(id) on delete cascade,
  round_no integer not null,
  drawer_id text not null,
  stroke jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists dg3_strokes_round_idx on public.dg3_strokes (room_id, round_no, seq);

create table if not exists public.dg3_chat (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.dg3_rooms(id) on delete cascade,
  round_no integer not null default 0,
  player_id text,
  name text,
  kind text not null check (kind in ('chat','correct','system')),
  audience text not null default 'all' check (audience in ('all','solved')),
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists dg3_chat_room_idx on public.dg3_chat (room_id, id);

alter table public.dg3_rooms enable row level security;
alter table public.dg3_players enable row level security;
alter table public.dg3_strokes enable row level security;
alter table public.dg3_chat enable row level security;
revoke all on public.dg3_rooms, public.dg3_players, public.dg3_strokes, public.dg3_chat from anon, authenticated;

-- ---------------------------------------------------------------- ตัวช่วยภายใน (ไม่เปิดให้เรียกจากเว็บ)

-- ตัวช่วยเทียบคำตอบ: ตัดช่องว่าง/เครื่องหมาย/วรรณยุกต์/ไม้ไต่คู้/ทัณฑฆาต ให้ "กีต้าร์" = "กีตาร์"
create or replace function public.dg3_norm(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(p_value, ''), '[[:space:][:punct:]\u0E47-\u0E4C]+', '', 'g'));
$$;
revoke all on function public.dg3_norm(text) from public, anon, authenticated;

create or replace function public.dg3_clean_settings(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cats text[];
  v_diff text;
  v_dur integer;
  v_rounds integer;
  v_max integer;
  v_custom text[];
begin
  p := coalesce(p, '{}'::jsonb);
  v_cats := array(
    select distinct c from jsonb_array_elements_text(coalesce(p->'categories','[]'::jsonb)) c
    where c in (select distinct w.category from public.draw_guess_words w where w.enabled)
  );
  v_diff := coalesce(p->>'difficulty','normal');
  if v_diff not in ('easy','normal','hard','mixed') then raise exception 'ระดับความยากไม่ถูกต้อง'; end if;
  v_dur := coalesce(nullif(p->>'duration_seconds','')::integer, 90);
  if v_dur not in (0,45,60,90,120,180) then raise exception 'เวลาต่อรอบไม่ถูกต้อง'; end if;
  v_rounds := coalesce(nullif(p->>'total_rounds','')::integer, 5);
  if v_rounds < 1 or v_rounds > 30 then raise exception 'จำนวนรอบต้องอยู่ระหว่าง 1–30'; end if;
  v_max := coalesce(nullif(p->>'max_players','')::integer, 8);
  if v_max < 2 or v_max > 12 then raise exception 'จำนวนผู้เล่นต้องอยู่ระหว่าง 2–12 คน'; end if;
  v_custom := array(
    select left(t, 30) from (
      select distinct btrim(x) as t from jsonb_array_elements_text(coalesce(p->'custom_words','[]'::jsonb)) x
    ) s where t <> '' limit 60
  );
  if coalesce(array_length(v_cats,1),0) = 0 and coalesce(array_length(v_custom,1),0) = 0 then
    raise exception 'เลือกอย่างน้อยหนึ่งหมวดหมู่ หรือเพิ่มคำของคุณเอง';
  end if;
  return jsonb_build_object(
    'categories', to_jsonb(v_cats),
    'difficulty', v_diff,
    'duration_seconds', v_dur,
    'total_rounds', v_rounds,
    'max_players', v_max,
    'custom_words', to_jsonb(v_custom)
  );
end;
$$;

create or replace function public.dg3_pick_word(p_settings jsonb, p_used text[], out o_word text, out o_aliases text[], out o_category text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cats text[] := array(select jsonb_array_elements_text(coalesce(p_settings->'categories','[]'::jsonb)));
  v_custom text[] := array(select jsonb_array_elements_text(coalesce(p_settings->'custom_words','[]'::jsonb)));
  v_diff text := coalesce(p_settings->>'difficulty','normal');
  v_used text[] := coalesce(p_used,'{}'::text[]);
  v_has_custom boolean := coalesce(array_length(v_custom,1),0) > 0;
begin
  if v_has_custom and (coalesce(array_length(v_cats,1),0) = 0 or random() < 0.35) then
    select c into o_word from unnest(v_custom) c where not (c = any(v_used)) order by random() limit 1;
    if o_word is not null then o_aliases := '{}'; o_category := 'custom'; return; end if;
  end if;
  if coalesce(array_length(v_cats,1),0) > 0 then
    select w.answer, w.aliases, w.category into o_word, o_aliases, o_category
    from public.draw_guess_words w
    where w.enabled and w.category = any(v_cats) and (v_diff = 'mixed' or w.difficulty = v_diff)
      and not (w.answer = any(v_used))
    order by random() limit 1;
    if o_word is not null then return; end if;
    -- คำหมดแล้ว: เริ่มวนใหม่ได้
    select w.answer, w.aliases, w.category into o_word, o_aliases, o_category
    from public.draw_guess_words w
    where w.enabled and w.category = any(v_cats) and (v_diff = 'mixed' or w.difficulty = v_diff)
    order by random() limit 1;
    if o_word is not null then return; end if;
  end if;
  if v_has_custom then
    select c into o_word from unnest(v_custom) c order by random() limit 1;
    if o_word is not null then o_aliases := '{}'; o_category := 'custom'; return; end if;
  end if;
  raise exception 'ไม่พบคำในหมวดหมู่และระดับที่เลือก';
end;
$$;

create or replace function public.dg3_state(p_room uuid, p_player text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_players jsonb;
  v_is_drawer boolean;
  v_member boolean;
begin
  select * into v from public.dg3_rooms where id = p_room;
  if not found then return jsonb_build_object('found', false); end if;
  v_is_drawer := v.drawer_id is not null and v.drawer_id = coalesce(p_player,'');
  v_member := exists (select 1 from public.dg3_players p where p.room_id = v.id and p.player_id = p_player and p.left_at is null);
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.player_id,
    'name', p.name,
    'score', p.score,
    'join_order', p.join_order,
    'solved', p.solved_at is not null,
    'is_drawer', p.player_id = v.drawer_id,
    'is_host', p.player_id = v.host_id,
    'left', p.left_at is not null,
    'away', p.left_at is null and p.last_seen < now() - interval '30 seconds'
  ) order by p.join_order), '[]'::jsonb)
  into v_players
  from public.dg3_players p
  where p.room_id = v.id and (p.left_at is null or v.status = 'ended' or p.score > 0);
  return jsonb_build_object(
    'found', true,
    'room_id', v.id,
    'name', v.name,
    'host_id', v.host_id,
    'status', v.status,
    'active', v.status <> 'ended',
    -- คำที่เจ้าของห้องเพิ่มเอง ส่งให้เฉพาะเจ้าของห้อง (ไม่ให้คนอื่นแอบดูจาก network)
    'settings', (case when v.host_id = coalesce(p_player,'') then v.settings else v.settings - 'custom_words' end)
                || jsonb_build_object('custom_count', jsonb_array_length(coalesce(v.settings->'custom_words','[]'::jsonb))),
    'total_rounds', coalesce(nullif(v.settings->>'total_rounds','')::integer, 5),
    'max_players', coalesce(nullif(v.settings->>'max_players','')::integer, 8),
    'round_no', v.round_no,
    'drawer_id', v.drawer_id,
    'category', v.category,
    'started_at', v.started_at,
    'ends_at', v.ends_at,
    'revealed_at', v.revealed_at,
    'server_now', now(),
    'secret_word', case when v_is_drawer and v.status = 'drawing' then v.word else null end,
    'answer', case when v.status in ('reveal','ended') then v.word else null end,
    'word_length', case when v.status = 'drawing' and not v_is_drawer then char_length(v.word) else null end,
    'is_member', v_member,
    'is_host', v.host_id = coalesce(p_player,''),
    'players', v_players
  );
end;
$$;

-- ผู้เล่นทุกคนที่ยังอยู่ทายถูกครบหรือยัง (ไม่นับคนวาด) -> จบรอบ + โบนัสคนวาด
create or replace function public.dg3_check_all_solved(p_room uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_guessers integer;
  v_solved integer;
begin
  select * into v from public.dg3_rooms where id = p_room;
  if not found or v.status <> 'drawing' then return false; end if;
  select count(*)::integer, count(p.solved_at)::integer into v_guessers, v_solved
  from public.dg3_players p where p.room_id = p_room and p.left_at is null and p.player_id <> v.drawer_id;
  if v_guessers > 0 and v_guessers = v_solved then
    update public.dg3_players set score = score + 2 where room_id = p_room and player_id = v.drawer_id and left_at is null;
    update public.dg3_rooms set status = 'reveal', revealed_at = now(), updated_at = now() where id = p_room;
    insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room, v.round_no, 'system', 'ทุกคนทายถูกแล้ว! คนวาดได้โบนัส +2');
    return true;
  end if;
  return false;
end;
$$;

-- ออกจากห้อง (ใช้ทั้งตอนกดออก และตอนสร้าง/เข้าห้องใหม่ขณะอยู่อีกห้อง)
create or replace function public.dg3_leave(p_room uuid, p_player text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_name text;
  v_active integer;
  v_new_host text;
  v_new_host_name text;
begin
  select * into v from public.dg3_rooms where id = p_room for update;
  if not found then return; end if;
  update public.dg3_players set left_at = now() where room_id = p_room and player_id = p_player and left_at is null
  returning name into v_name;
  if v_name is null then return; end if;
  select count(*)::integer into v_active from public.dg3_players where room_id = p_room and left_at is null;
  if v_active = 0 then
    update public.dg3_rooms set status = 'ended', updated_at = now() where id = p_room;
    return;
  end if;
  insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room, v.round_no, 'system', v_name || ' ออกจากห้อง');
  if v.host_id = p_player then
    select player_id, name into v_new_host, v_new_host_name from public.dg3_players
    where room_id = p_room and left_at is null order by join_order limit 1;
    update public.dg3_rooms set host_id = v_new_host where id = p_room;
    insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room, v.round_no, 'system', v_new_host_name || ' เป็นเจ้าของห้องคนใหม่');
  end if;
  if v.status in ('drawing','reveal') and v_active < 2 then
    update public.dg3_rooms set status = 'ended', updated_at = now() where id = p_room;
    insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room, v.round_no, 'system', 'ผู้เล่นไม่พอ จบเกมแล้ว');
  elsif v.status = 'drawing' and v.drawer_id = p_player then
    update public.dg3_rooms set status = 'reveal', revealed_at = now(), updated_at = now() where id = p_room;
    insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room, v.round_no, 'system', 'คนวาดออกจากห้อง ข้ามรอบนี้');
  elsif v.status = 'drawing' then
    perform public.dg3_check_all_solved(p_room);
  end if;
  update public.dg3_rooms set updated_at = now() where id = p_room;
end;
$$;

create or replace function public.dg3_assert_player(p_player text, p_name text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_player is null or length(btrim(p_player)) < 1 or length(p_player) > 80 then raise exception 'invalid player id'; end if;
  return left(coalesce(nullif(btrim(p_name),''),'ผู้เล่น'), 32);
end;
$$;

-- ---------------------------------------------------------------- RPC ที่เว็บเรียกใช้

create or replace function public.dg3_list_rooms(p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rooms jsonb;
  v_mine uuid;
begin
  perform public.dg3_assert_player(p_player_id, null);
  -- ห้องที่ไม่มีใครออนไลน์เกิน 3 นาที หรือค้างเกิน 12 ชั่วโมง ถือว่าปิดแล้ว
  update public.dg3_rooms r set status = 'ended', updated_at = now()
  where r.status <> 'ended' and (
    r.updated_at < now() - interval '12 hours' or (
      r.updated_at < now() - interval '3 minutes'
      and not exists (select 1 from public.dg3_players p where p.room_id = r.id and p.left_at is null and p.last_seen > now() - interval '3 minutes')
    )
  );
  -- เก็บกวาดข้อมูลของห้องที่จบไปเกิน 3 วัน
  delete from public.dg3_rooms where status = 'ended' and updated_at < now() - interval '3 days';

  select r.id into v_mine from public.dg3_rooms r
  join public.dg3_players p on p.room_id = r.id and p.player_id = p_player_id and p.left_at is null
  where r.status <> 'ended' order by r.updated_at desc limit 1;

  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into v_rooms from (
    select jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'status', r.status,
      'round_no', r.round_no,
      'total_rounds', coalesce(nullif(r.settings->>'total_rounds','')::integer, 5),
      'max_players', coalesce(nullif(r.settings->>'max_players','')::integer, 8),
      'count', (select count(*) from public.dg3_players p where p.room_id = r.id and p.left_at is null),
      'host_name', (select p.name from public.dg3_players p where p.room_id = r.id and p.player_id = r.host_id),
      'names', (select coalesce(jsonb_agg(p.name order by p.join_order), '[]'::jsonb) from public.dg3_players p where p.room_id = r.id and p.left_at is null),
      'created_at', r.created_at
    ) as x
    from public.dg3_rooms r
    where r.lobby_id = 'main' and r.status <> 'ended'
    order by r.created_at desc limit 30
  ) s;
  return jsonb_build_object('rooms', v_rooms, 'my_room_id', v_mine);
end;
$$;

create or replace function public.dg3_create_room(p_player_id text, p_name text, p_room_name text, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := public.dg3_assert_player(p_player_id, p_name);
  v_settings jsonb := public.dg3_clean_settings(p_settings);
  v_room uuid;
  v_old record;
  v_room_name text := left(coalesce(nullif(btrim(p_room_name),''), 'ห้องของ ' || v_name), 40);
begin
  for v_old in select p.room_id from public.dg3_players p join public.dg3_rooms r on r.id = p.room_id
               where p.player_id = p_player_id and p.left_at is null and r.status <> 'ended' loop
    perform public.dg3_leave(v_old.room_id, p_player_id);
  end loop;
  insert into public.dg3_rooms(name, host_id, status, settings) values (v_room_name, p_player_id, 'waiting', v_settings)
  returning id into v_room;
  insert into public.dg3_players(room_id, player_id, name, join_order) values (v_room, p_player_id, v_name, 1);
  insert into public.dg3_chat(room_id, round_no, kind, body) values (v_room, 0, 'system', v_name || ' สร้างห้อง รอเพื่อนเข้ามาแล้วกดเริ่มได้เลย');
  return public.dg3_state(v_room, p_player_id);
end;
$$;

create or replace function public.dg3_join_room(p_player_id text, p_name text, p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := public.dg3_assert_player(p_player_id, p_name);
  v public.dg3_rooms%rowtype;
  v_row public.dg3_players%rowtype;
  v_old record;
  v_active integer;
  v_max integer;
  v_existed boolean;
begin
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found or v.status = 'ended' then raise exception 'ห้องนี้ปิดไปแล้ว'; end if;
  select * into v_row from public.dg3_players where room_id = p_room_id and player_id = p_player_id;
  v_existed := found;
  if v_existed and v_row.left_at is null then
    update public.dg3_players set last_seen = now(), name = v_name where room_id = p_room_id and player_id = p_player_id;
    return public.dg3_state(p_room_id, p_player_id);
  end if;
  select count(*)::integer into v_active from public.dg3_players where room_id = p_room_id and left_at is null;
  v_max := coalesce(nullif(v.settings->>'max_players','')::integer, 8);
  if v_active >= v_max then raise exception 'ห้องเต็มแล้ว (% คน)', v_max; end if;
  for v_old in select p.room_id from public.dg3_players p join public.dg3_rooms r on r.id = p.room_id
               where p.player_id = p_player_id and p.left_at is null and r.status <> 'ended' and p.room_id <> p_room_id loop
    perform public.dg3_leave(v_old.room_id, p_player_id);
  end loop;
  if v_existed then
    update public.dg3_players set left_at = null, name = v_name, last_seen = now(), solved_at = null,
      join_order = (select coalesce(max(join_order),0) + 1 from public.dg3_players where room_id = p_room_id)
    where room_id = p_room_id and player_id = p_player_id;
  else
    insert into public.dg3_players(room_id, player_id, name, join_order)
    values (p_room_id, p_player_id, v_name, (select coalesce(max(join_order),0) + 1 from public.dg3_players where room_id = p_room_id));
  end if;
  insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, v.round_no, 'system', v_name || ' เข้าห้อง');
  update public.dg3_rooms set updated_at = now() where id = p_room_id;
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.dg3_leave_room(p_room_id uuid, p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.dg3_assert_player(p_player_id, null);
  perform public.dg3_leave(p_room_id, p_player_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dg3_get_state(p_room_id uuid, p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.dg3_assert_player(p_player_id, null);
  update public.dg3_players set last_seen = now() where room_id = p_room_id and player_id = p_player_id and left_at is null;
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.dg3_update_settings(p_room_id uuid, p_player_id text, p_name text, p_settings jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_settings jsonb := public.dg3_clean_settings(p_settings);
  v_active integer;
begin
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องเท่านั้น'; end if;
  if v.status <> 'waiting' then raise exception 'แก้ตั้งค่าได้ตอนรอเริ่มเกมเท่านั้น'; end if;
  select count(*)::integer into v_active from public.dg3_players where room_id = p_room_id and left_at is null;
  if (v_settings->>'max_players')::integer < v_active then raise exception 'จำนวนคนสูงสุดต่ำกว่าคนที่อยู่ในห้องตอนนี้'; end if;
  update public.dg3_rooms set settings = v_settings, name = left(coalesce(nullif(btrim(p_name),''), name), 40), updated_at = now() where id = p_room_id;
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.dg3_start(p_room_id uuid, p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_active integer;
  v_drawer text;
  w record;
begin
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องเท่านั้นที่เริ่มเกมได้'; end if;
  if v.status <> 'waiting' then return public.dg3_state(p_room_id, p_player_id); end if;
  select count(*)::integer into v_active from public.dg3_players where room_id = p_room_id and left_at is null;
  if v_active < 2 then raise exception 'ต้องมีผู้เล่นอย่างน้อย 2 คน'; end if;
  select player_id into v_drawer from public.dg3_players where room_id = p_room_id and left_at is null order by random() limit 1;
  select * into w from public.dg3_pick_word(v.settings, v.used_words);
  update public.dg3_players set solved_at = null, score = 0 where room_id = p_room_id;
  delete from public.dg3_strokes where room_id = p_room_id;
  update public.dg3_rooms set
    status = 'drawing', round_no = 1, drawer_id = v_drawer,
    word = w.o_word, word_aliases = w.o_aliases, category = w.o_category,
    used_words = (select coalesce(array_agg(x), '{}') from (select x from unnest(coalesce(v.used_words,'{}'::text[]) || w.o_word) with ordinality t(x, i) order by i desc limit 150) z),
    started_at = now(), revealed_at = null,
    ends_at = case when (v.settings->>'duration_seconds')::integer = 0 then null else now() + make_interval(secs => (v.settings->>'duration_seconds')::integer) end,
    updated_at = now()
  where id = p_room_id;
  insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, 1, 'system', 'เริ่มเกม! รอบที่ 1');
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.dg3_finish_round(p_room_id uuid, p_round_no integer, p_player_id text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_seen timestamptz;
begin
  perform public.dg3_assert_player(p_player_id, null);
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('ok', false, 'stale', true); end if;
  if v.status <> 'drawing' or v.round_no <> p_round_no then
    return jsonb_build_object('ok', false, 'stale', true, 'state', public.dg3_state(p_room_id, p_player_id));
  end if;
  if not exists (select 1 from public.dg3_players where room_id = p_room_id and player_id = p_player_id and left_at is null) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  if p_reason = 'timeout' then
    if v.ends_at is null or now() < v.ends_at then return jsonb_build_object('ok', false, 'not_expired', true); end if;
  elsif p_reason = 'skipped' then
    if p_player_id <> v.host_id and p_player_id <> v.drawer_id then raise exception 'เฉพาะเจ้าของห้องหรือคนวาดเท่านั้นที่ข้ามรอบได้'; end if;
  elsif p_reason = 'drawer_away' then
    select last_seen into v_seen from public.dg3_players where room_id = p_room_id and player_id = v.drawer_id;
    if v_seen is not null and v_seen > now() - interval '35 seconds' then return jsonb_build_object('ok', false, 'drawer_here', true); end if;
  else
    raise exception 'invalid finish reason';
  end if;
  update public.dg3_rooms set status = 'reveal', revealed_at = now(), updated_at = now() where id = p_room_id;
  insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, v.round_no, 'system',
    case p_reason when 'timeout' then 'หมดเวลา!' when 'skipped' then 'ข้ามรอบนี้' else 'คนวาดหายไป ข้ามรอบนี้' end);
  return jsonb_build_object('ok', true, 'state', public.dg3_state(p_room_id, p_player_id));
end;
$$;

create or replace function public.dg3_advance(p_room_id uuid, p_round_no integer, p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_total integer;
  v_order integer;
  v_next text;
  v_dur integer;
  w record;
  v_used text[];
begin
  perform public.dg3_assert_player(p_player_id, null);
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v.status = 'ended' then return public.dg3_state(p_room_id, p_player_id); end if;
  if not exists (select 1 from public.dg3_players where room_id = p_room_id and player_id = p_player_id and left_at is null) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  if v.round_no <> p_round_no or v.status <> 'reveal' then return public.dg3_state(p_room_id, p_player_id); end if;
  v_total := coalesce(nullif(v.settings->>'total_rounds','')::integer, 5);
  if v.round_no >= v_total then
    update public.dg3_rooms set status = 'ended', updated_at = now() where id = p_room_id;
    insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, v.round_no, 'system', 'เกมจบแล้ว!');
    return public.dg3_state(p_room_id, p_player_id);
  end if;
  select join_order into v_order from public.dg3_players where room_id = p_room_id and player_id = v.drawer_id;
  -- คนวาดคนถัดไป: ถัดจากคนเดิมตามลำดับเข้าห้อง ข้ามคนที่ออฟไลน์ (ไม่เห็นเกิน 45 วิ) ถ้าไม่มีใครเลยค่อยเลือกใครก็ได้
  select player_id into v_next from public.dg3_players
  where room_id = p_room_id and left_at is null and last_seen > now() - interval '45 seconds' and join_order > coalesce(v_order,0)
  order by join_order limit 1;
  if v_next is null then
    select player_id into v_next from public.dg3_players
    where room_id = p_room_id and left_at is null and last_seen > now() - interval '45 seconds' order by join_order limit 1;
  end if;
  if v_next is null then
    select player_id into v_next from public.dg3_players where room_id = p_room_id and left_at is null order by join_order limit 1;
  end if;
  select * into w from public.dg3_pick_word(v.settings, v.used_words);
  v_used := v.used_words;
  if not (w.o_word = any(v_used)) then v_used := v_used || w.o_word; else v_used := array[w.o_word]; end if;
  v_dur := (v.settings->>'duration_seconds')::integer;
  update public.dg3_players set solved_at = null where room_id = p_room_id;
  update public.dg3_rooms set
    status = 'drawing', round_no = round_no + 1, drawer_id = v_next,
    word = w.o_word, word_aliases = w.o_aliases, category = w.o_category, used_words = v_used,
    started_at = now(), revealed_at = null,
    ends_at = case when v_dur = 0 then null else now() + make_interval(secs => v_dur) end,
    updated_at = now()
  where id = p_room_id;
  insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, v.round_no + 1, 'system', 'รอบที่ ' || (v.round_no + 1));
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.dg3_end_room(p_room_id uuid, p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v public.dg3_rooms%rowtype;
begin
  perform public.dg3_assert_player(p_player_id, null);
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องเท่านั้นที่จบเกมได้'; end if;
  if v.status <> 'ended' then
    update public.dg3_rooms set status = 'ended', updated_at = now() where id = p_room_id;
    insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, v.round_no, 'system', 'เจ้าของห้องจบเกม');
  end if;
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

-- เล่นอีกรอบในห้องเดิม: กลับไปห้องรอ คะแนนรีเซ็ต คนที่ยังอยู่ไม่ต้องเข้าใหม่
create or replace function public.dg3_reset(p_room_id uuid, p_player_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v public.dg3_rooms%rowtype;
begin
  perform public.dg3_assert_player(p_player_id, null);
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องเท่านั้น'; end if;
  if v.status <> 'ended' then return public.dg3_state(p_room_id, p_player_id); end if;
  if not exists (select 1 from public.dg3_players where room_id = p_room_id and player_id = p_player_id and left_at is null) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  delete from public.dg3_strokes where room_id = p_room_id;
  update public.dg3_players set score = 0, solved_at = null where room_id = p_room_id;
  update public.dg3_players set last_seen = now() where room_id = p_room_id and left_at is null;
  update public.dg3_rooms set status = 'waiting', round_no = 0, drawer_id = null, word = null, word_aliases = '{}', category = null,
    started_at = null, ends_at = null, revealed_at = null, updated_at = now() where id = p_room_id;
  insert into public.dg3_chat(room_id, round_no, kind, body) values (p_room_id, 0, 'system', 'กลับมาที่ห้องรอ พร้อมแล้วให้เจ้าของห้องกดเริ่มได้เลย');
  return public.dg3_state(p_room_id, p_player_id);
end;
$$;

-- ---------------------------------------------------------------- วาดภาพ

create or replace function public.dg3_get_strokes(p_room_id uuid, p_round_no integer, p_known text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids jsonb;
  v_new jsonb;
begin
  select coalesce(jsonb_agg(s.id order by s.seq), '[]'::jsonb) into v_ids
  from public.dg3_strokes s where s.room_id = p_room_id and s.round_no = p_round_no;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'stroke', s.stroke) order by s.seq), '[]'::jsonb) into v_new
  from public.dg3_strokes s
  where s.room_id = p_room_id and s.round_no = p_round_no and not (s.id = any(coalesce(p_known,'{}'::text[])));
  return jsonb_build_object('round_no', p_round_no, 'ids', v_ids, 'strokes', v_new);
end;
$$;

create or replace function public.dg3_save_stroke(p_room_id uuid, p_round_no integer, p_player_id text, p_stroke jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_pts jsonb := p_stroke->'points';
  v_id text := p_stroke->>'id';
  v_color text := p_stroke->>'color';
  v_width numeric := (p_stroke->>'width')::numeric;
begin
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found or v.status <> 'drawing' or v.round_no <> p_round_no or v.drawer_id <> p_player_id then raise exception 'ไม่มีสิทธิ์วาดในรอบนี้'; end if;
  if v.ends_at is not null and now() >= v.ends_at + interval '2 seconds' then raise exception 'หมดเวลาแล้ว'; end if;
  if v_id is null or length(v_id) > 80 then raise exception 'invalid stroke id'; end if;
  if v_color is null or v_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid stroke color'; end if;
  if v_width is null or v_width < 0.001 or v_width > 0.15 then raise exception 'invalid stroke width'; end if;
  if v_pts is null or jsonb_typeof(v_pts) <> 'array' then raise exception 'invalid stroke points'; end if;
  if jsonb_array_length(v_pts) < 4 or jsonb_array_length(v_pts) > 6000 or jsonb_array_length(v_pts) % 2 <> 0 then raise exception 'invalid stroke points'; end if;
  if exists (select 1 from jsonb_array_elements(v_pts) as pt(value)
             where case when jsonb_typeof(pt.value) = 'number' then (pt.value::text)::numeric < 0 or (pt.value::text)::numeric > 1 else true end) then
    raise exception 'stroke coordinate outside canvas';
  end if;
  if (select count(*) from public.dg3_strokes where room_id = p_room_id and round_no = p_round_no) >= 800 then
    raise exception 'ถึงขีดจำกัดจำนวนเส้นของรอบนี้แล้ว';
  end if;
  insert into public.dg3_strokes(id, room_id, round_no, drawer_id, stroke)
  values (v_id, p_room_id, p_round_no, p_player_id,
          jsonb_build_object('id', v_id, 'color', lower(v_color), 'width', v_width, 'erase', coalesce((p_stroke->>'erase')::boolean, false), 'points', v_pts)
          || case when coalesce((p_stroke->>'fill')::boolean, false) then jsonb_build_object('fill', true) else '{}'::jsonb end)
  on conflict (id) do nothing;
  return true;
end;
$$;

create or replace function public.dg3_delete_strokes(p_room_id uuid, p_round_no integer, p_player_id text, p_ids text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  n integer;
begin
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found or v.status <> 'drawing' or v.round_no <> p_round_no or v.drawer_id <> p_player_id then raise exception 'ไม่มีสิทธิ์ลบในรอบนี้'; end if;
  if coalesce(array_length(p_ids,1),0) > 200 then raise exception 'ลบครั้งละมากเกินไป'; end if;
  delete from public.dg3_strokes where room_id = p_room_id and round_no = p_round_no and id = any(coalesce(p_ids,'{}'::text[]));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.dg3_clear_canvas(p_room_id uuid, p_round_no integer, p_player_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v public.dg3_rooms%rowtype;
begin
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found or v.status <> 'drawing' or v.round_no <> p_round_no or v.drawer_id <> p_player_id then raise exception 'ไม่มีสิทธิ์ล้างภาพในรอบนี้'; end if;
  delete from public.dg3_strokes where room_id = p_room_id and round_no = p_round_no;
  return true;
end;
$$;

-- ---------------------------------------------------------------- แชท + ทายคำ (ช่องเดียว)

create or replace function public.dg3_send(p_room_id uuid, p_round_no integer, p_player_id text, p_text text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  me public.dg3_players%rowtype;
  v_text text := btrim(coalesce(p_text,''));
  v_norm text;
  v_ans text;
  v_rank integer;
  v_delta integer;
  v_all boolean;
begin
  perform public.dg3_assert_player(p_player_id, null);
  if v_text = '' then return jsonb_build_object('ok', false); end if;
  if char_length(v_text) > 120 then raise exception 'ข้อความยาวเกินไป (สูงสุด 120 ตัวอักษร)'; end if;
  select * into v from public.dg3_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  select * into me from public.dg3_players where room_id = p_room_id and player_id = p_player_id and left_at is null for update;
  if not found then raise exception 'คุณไม่ได้อยู่ในห้องนี้'; end if;
  update public.dg3_players set last_seen = now() where room_id = p_room_id and player_id = p_player_id;
  if exists (select 1 from public.dg3_chat where room_id = p_room_id and player_id = p_player_id and created_at > now() - interval '400 milliseconds') then
    return jsonb_build_object('ok', false, 'throttled', true);
  end if;

  if v.status = 'drawing' then
    if v.round_no <> p_round_no then return jsonb_build_object('ok', false, 'stale', true); end if;
    if v.ends_at is not null and now() >= v.ends_at then
      return jsonb_build_object('ok', false, 'expired', true, 'message', 'หมดเวลาแล้ว');
    end if;
    v_norm := public.dg3_norm(v_text);
    v_ans := public.dg3_norm(v.word);
    if p_player_id = v.drawer_id then
      if v_norm <> '' and char_length(v_ans) >= 2 and position(v_ans in v_norm) > 0 then
        return jsonb_build_object('ok', false, 'message', 'คนวาดห้ามบอกคำตอบนะ');
      end if;
      insert into public.dg3_chat(room_id, round_no, player_id, name, kind, audience, body) values (p_room_id, v.round_no, p_player_id, me.name, 'chat', 'solved', v_text);
      return jsonb_build_object('ok', true);
    end if;
    if me.solved_at is not null then
      insert into public.dg3_chat(room_id, round_no, player_id, name, kind, audience, body) values (p_room_id, v.round_no, p_player_id, me.name, 'chat', 'solved', v_text);
      return jsonb_build_object('ok', true);
    end if;
    if v_norm <> '' and (v_norm = v_ans or exists (select 1 from unnest(v.word_aliases) a where v_norm = public.dg3_norm(a))) then
      select count(*)::integer + 1 into v_rank from public.dg3_players
      where room_id = p_room_id and left_at is null and player_id <> v.drawer_id and solved_at is not null;
      v_delta := case when v_rank = 1 then 3 else 1 end;
      update public.dg3_players set solved_at = now(), score = score + v_delta where room_id = p_room_id and player_id = p_player_id;
      update public.dg3_players set score = score + 1 where room_id = p_room_id and player_id = v.drawer_id and left_at is null;
      insert into public.dg3_chat(room_id, round_no, player_id, name, kind, audience, body) values (p_room_id, v.round_no, p_player_id, me.name, 'correct', 'all', '');
      v_all := public.dg3_check_all_solved(p_room_id);
      update public.dg3_rooms set updated_at = now() where id = p_room_id;
      return jsonb_build_object('ok', true, 'correct', true, 'rank', v_rank, 'score_delta', v_delta, 'round_finished', v_all);
    end if;
    if char_length(v_ans) >= 4 and position(v_ans in v_norm) > 0 then
      return jsonb_build_object('ok', false, 'hidden', true, 'message', 'ข้อความนี้มีคำตอบอยู่ ถ้าจะตอบให้พิมพ์คำตอบเดี่ยว ๆ ในข้อความเดียว');
    end if;
    insert into public.dg3_chat(room_id, round_no, player_id, name, kind, audience, body) values (p_room_id, v.round_no, p_player_id, me.name, 'chat', 'all', v_text);
    return jsonb_build_object('ok', true, 'correct', false);
  end if;

  insert into public.dg3_chat(room_id, round_no, player_id, name, kind, audience, body) values (p_room_id, v.round_no, p_player_id, me.name, 'chat', 'all', v_text);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dg3_get_chat(p_room_id uuid, p_player_id text, p_after bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.dg3_rooms%rowtype;
  v_priv boolean;
  v_rows jsonb;
begin
  perform public.dg3_assert_player(p_player_id, null);
  select * into v from public.dg3_rooms where id = p_room_id;
  if not found then return '[]'::jsonb; end if;
  -- คนวาดและคนที่ทายถูกแล้วเห็นแชทวงใน; คนที่ยังทายอยู่เห็นแค่แชทสาธารณะ จนกว่ารอบจะจบ
  v_priv := v.status <> 'drawing'
    or v.drawer_id = p_player_id
    or exists (select 1 from public.dg3_players p where p.room_id = p_room_id and p.player_id = p_player_id and p.solved_at is not null);
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('id', c.id, 'player_id', c.player_id, 'name', c.name, 'kind', c.kind,
                              'audience', c.audience, 'body', c.body, 'round_no', c.round_no) as x
    from public.dg3_chat c
    where c.room_id = p_room_id and c.id > coalesce(p_after, 0)
      and (c.audience = 'all' or v_priv or c.round_no < v.round_no)
    order by c.id desc limit case when coalesce(p_after,0) = 0 then 80 else 200 end
  ) s;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------- สิทธิ์: เปิดเฉพาะ RPC ที่เว็บใช้

revoke all on function public.dg3_clean_settings(jsonb) from public, anon, authenticated;
revoke all on function public.dg3_pick_word(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.dg3_state(uuid, text) from public, anon, authenticated;
revoke all on function public.dg3_check_all_solved(uuid) from public, anon, authenticated;
revoke all on function public.dg3_leave(uuid, text) from public, anon, authenticated;
revoke all on function public.dg3_assert_player(text, text) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'dg3_list_rooms(text)',
    'dg3_create_room(text,text,text,jsonb)',
    'dg3_join_room(text,text,uuid)',
    'dg3_leave_room(uuid,text)',
    'dg3_get_state(uuid,text)',
    'dg3_update_settings(uuid,text,text,jsonb)',
    'dg3_start(uuid,text)',
    'dg3_finish_round(uuid,integer,text,text)',
    'dg3_advance(uuid,integer,text)',
    'dg3_end_room(uuid,text)',
    'dg3_reset(uuid,text)',
    'dg3_get_strokes(uuid,integer,text[])',
    'dg3_save_stroke(uuid,integer,text,jsonb)',
    'dg3_delete_strokes(uuid,integer,text,text[])',
    'dg3_clear_canvas(uuid,integer,text)',
    'dg3_send(uuid,integer,text,text)',
    'dg3_get_chat(uuid,text,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

comment on table public.dg3_rooms is 'Draw & Guess v3 rooms. Use dg3_* RPCs only; answers are never exposed except via dg3_state rules.';
