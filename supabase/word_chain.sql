-- เกมต่อคำภาษาไทย (Word Chain) — ห้องหลายห้อง / ห้องรอ / ผลัดกันตอบ / จับเวลา / หัวใจ
-- รันใน Supabase SQL Editor (รันซ้ำได้) แล้วรัน word_chain_letters.sql (จำนวนคำต่อตัวอักษร)
-- ตารางและฟังก์ชันขึ้นต้นด้วย wc_ ไม่แตะของเกมอื่น
-- พจนานุกรมอยู่ฝั่งเว็บ (assets/words-th.txt) ฝั่งนี้ตรวจตัวอักษรต้นคำ คำซ้ำ ตาเล่น และเวลา
-- ผู้เล่นเป็นแบบ guest (player_id จาก localStorage) เหมือนวาดภาพทายคำ คนตั้งใจโกงเรียก RPC ตรงได้

create table if not exists public.wc_letters (letter text primary key, n integer not null);
alter table public.wc_letters enable row level security;

create table if not exists public.wc_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id text not null,
  status text not null check (status in ('waiting','playing','ended')),
  settings jsonb not null default '{}'::jsonb,
  game_no integer not null default 0,
  turn_no integer not null default 0,
  turn_player text,
  turn_ends_at timestamptz,
  need text,
  used text[] not null default '{}',
  used_by text[] not null default '{}',
  winner_id text,
  solo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wc_rooms_open_idx on public.wc_rooms (updated_at desc) where status <> 'ended';

create table if not exists public.wc_players (
  room_id uuid not null references public.wc_rooms(id) on delete cascade,
  player_id text not null,
  name text not null,
  join_order integer not null,
  lives integer not null default 0,
  words integer not null default 0,
  wins integer not null default 0,
  out_at timestamptz,
  last_seen timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, player_id)
);
create index if not exists wc_players_active_idx on public.wc_players (player_id) where left_at is null;

create table if not exists public.wc_chat (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.wc_rooms(id) on delete cascade,
  player_id text,
  name text,
  kind text not null check (kind in ('chat','word','system')),
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wc_chat_room_idx on public.wc_chat (room_id, id);

alter table public.wc_rooms enable row level security;
alter table public.wc_players enable row level security;
alter table public.wc_chat enable row level security;
revoke all on public.wc_rooms, public.wc_players, public.wc_chat, public.wc_letters from anon, authenticated;

-- ---------------------------------------------------------------- ตัวช่วยภายใน

-- ตัวขึ้นต้น = พยัญชนะตัวแรกหลังสระหน้า (เ แ โ ใ ไ)  ต้องตรงกับ wcHead ใน word-chain.js
create or replace function public.wc_head(p text)
returns text language sql immutable set search_path = '' as $$
  select substring(coalesce(p,'') from '^[เ-ไ]*([ก-ฮ])');
$$;

-- ตัวที่ต้องต่อ = พยัญชนะตัวสุดท้ายที่เขียน ไม่นับสระ/วรรณยุกต์ท้ายคำ และไม่นับตัวการันต์
-- (ศาสตร์ -> ส, จันทร์ -> น, ศักดิ์ -> ก, เกาะ -> ก, ปลา -> ล)  ต้องตรงกับ wcTail ใน word-chain.js
create or replace function public.wc_tail(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  s text := regexp_replace(coalesce(p,''), '[ๆฯ[:space:]]+$', '');
  m text[];
begin
  s := regexp_replace(s, '[็-๋ํ]', '', 'g');
  if s ~ '์$' then
    m := regexp_match(s, '([ก-ฮ])[ิุ]?์$');
    if m is not null then
      s := left(s, char_length(s) - char_length(substring(s from '[ก-ฮ][ิุ]?์$')));
      if m[1] = 'ร' and s ~ '[\u0E01-\u0E2E\u0E31-\u0E3A][ตทด]$' then s := left(s, char_length(s) - 1); end if;
    else
      s := left(s, char_length(s) - 1);
    end if;
  end if;
  s := regexp_replace(s, '[ะ-ฺๅ-๎]+$', '');
  -- ถ้าตัดจนไม่เหลือพยัญชนะท้าย ใช้พยัญชนะตัวสุดท้ายของคำเดิม
  return coalesce(substring(s from '([ก-ฮ])$'), substring(coalesce(p,'') from '([ก-ฮ])[^ก-ฮ]*$'));
end;
$$;

-- ตัวอักษรที่ยังมีคำให้ต่อพอ ไม่งั้นสุ่มตัวที่ใช้บ่อยแทน
create or replace function public.wc_pick_need(p_link text, p_used text[])
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_left integer;
begin
  if p_link is not null then
    select l.n - (select count(*) from unnest(coalesce(p_used,'{}'::text[])) u where public.wc_head(u) = p_link)
      into v_left from public.wc_letters l where l.letter = p_link;
    if coalesce(v_left, 0) >= 30 then return p_link; end if;
  end if;
  return coalesce((select l.letter from public.wc_letters l where l.n >= 800 order by random() limit 1), 'ก');
end;
$$;

create or replace function public.wc_assert_player(p_player text, p_name text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_player is null or length(btrim(p_player)) < 1 or length(p_player) > 80 then raise exception 'invalid player id'; end if;
  return left(coalesce(nullif(btrim(p_name),''),'ผู้เล่น'), 32);
end;
$$;

create or replace function public.wc_clean_settings(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_sec integer; v_lives integer; v_max integer; v_strict boolean;
begin
  p := coalesce(p, '{}'::jsonb);
  v_sec := coalesce(nullif(p->>'turn_seconds','')::integer, 20);
  if v_sec not in (10,15,20,30,45,60) then raise exception 'เวลาต่อตาไม่ถูกต้อง'; end if;
  v_lives := coalesce(nullif(p->>'lives','')::integer, 3);
  if v_lives < 1 or v_lives > 5 then raise exception 'จำนวนหัวใจต้องอยู่ระหว่าง 1–5'; end if;
  v_max := coalesce(nullif(p->>'max_players','')::integer, 8);
  if v_max < 2 or v_max > 10 then raise exception 'จำนวนผู้เล่นต้องอยู่ระหว่าง 2–10 คน'; end if;
  v_strict := coalesce((p->>'strict')::boolean, true);
  return jsonb_build_object('turn_seconds', v_sec, 'lives', v_lives, 'max_players', v_max, 'strict', v_strict);
end;
$$;

create or replace function public.wc_state(p_room uuid, p_player text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_players jsonb;
  v_chain jsonb;
  v_n integer;
begin
  select * into v from public.wc_rooms where id = p_room;
  if not found then return jsonb_build_object('found', false); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.player_id, 'name', p.name, 'join_order', p.join_order,
    'lives', p.lives, 'words', p.words, 'wins', p.wins,
    'out', p.out_at is not null, 'left', p.left_at is not null,
    'is_host', p.player_id = v.host_id, 'is_turn', p.player_id = v.turn_player and v.status = 'playing',
    'away', p.left_at is null and p.last_seen < now() - interval '25 seconds'
  ) order by p.join_order), '[]'::jsonb) into v_players
  from public.wc_players p where p.room_id = v.id and (p.left_at is null or p.words > 0);
  v_n := coalesce(array_length(v.used, 1), 0);
  select coalesce(jsonb_agg(jsonb_build_object('w', v.used[i], 'by', v.used_by[i]) order by i), '[]'::jsonb) into v_chain
  from generate_series(greatest(1, v_n - 39), v_n) i where v_n > 0;
  return jsonb_build_object(
    'found', true, 'room_id', v.id, 'name', v.name, 'host_id', v.host_id, 'status', v.status,
    'settings', v.settings, 'max_players', (v.settings->>'max_players')::integer,
    'game_no', v.game_no, 'turn_no', v.turn_no, 'turn_player', v.turn_player, 'turn_ends_at', v.turn_ends_at,
    'need', v.need, 'count', v_n, 'chain', v_chain, 'winner_id', v.winner_id, 'solo', v.solo,
    'server_now', now(),
    'is_member', exists (select 1 from public.wc_players p where p.room_id = v.id and p.player_id = p_player and p.left_at is null),
    'is_host', v.host_id = coalesce(p_player,''),
    'players', v_players
  );
end;
$$;

-- ส่งตาให้คนถัดไปที่ยังมีหัวใจ (ตามลำดับเข้าห้อง วนรอบ)
create or replace function public.wc_next_turn(p_room uuid, p_need text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_cur integer;
  v_next text;
begin
  select * into v from public.wc_rooms where id = p_room;
  select join_order into v_cur from public.wc_players where room_id = p_room and player_id = v.turn_player;
  select player_id into v_next from public.wc_players
  where room_id = p_room and left_at is null and out_at is null
  order by (join_order <= coalesce(v_cur, 0)), join_order limit 1;
  update public.wc_rooms set turn_no = turn_no + 1, turn_player = v_next, need = p_need,
    turn_ends_at = now() + make_interval(secs => (v.settings->>'turn_seconds')::integer), updated_at = now()
  where id = p_room;
end;
$$;

-- เหลือคนเดียว (หรือเล่นคนเดียวแล้วหัวใจหมด) -> จบเกม
create or replace function public.wc_check_end(p_room uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_alive integer;
  v_last text;
  v_name text;
begin
  select * into v from public.wc_rooms where id = p_room;
  if v.status <> 'playing' then return false; end if;
  select count(*)::integer, min(player_id) into v_alive, v_last from public.wc_players
  where room_id = p_room and left_at is null and out_at is null;
  if v_alive = 0 or (v_alive = 1 and not v.solo) then
    if v_alive = 1 then
      update public.wc_players set wins = wins + 1 where room_id = p_room and player_id = v_last returning name into v_name;
      insert into public.wc_chat(room_id, kind, body) values (p_room, 'system', '🏆 ' || v_name || ' ชนะ! ต่อกันได้ ' || coalesce(array_length(v.used,1),0) || ' คำ');
    else
      insert into public.wc_chat(room_id, kind, body) values (p_room, 'system', 'จบเกม ต่อได้ ' || coalesce(array_length(v.used,1),0) || ' คำ');
    end if;
    update public.wc_rooms set status = 'ended', winner_id = case when v_alive = 1 then v_last end,
      turn_player = null, turn_ends_at = null, updated_at = now() where id = p_room;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.wc_leave(p_room uuid, p_player text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_name text;
  v_active integer;
  v_host text;
  v_host_name text;
begin
  select * into v from public.wc_rooms where id = p_room for update;
  if not found then return; end if;
  update public.wc_players set left_at = now(), out_at = coalesce(out_at, now())
  where room_id = p_room and player_id = p_player and left_at is null returning name into v_name;
  if v_name is null then return; end if;
  select count(*)::integer into v_active from public.wc_players where room_id = p_room and left_at is null;
  if v_active = 0 then
    update public.wc_rooms set status = 'ended', turn_player = null, updated_at = now() where id = p_room;
    return;
  end if;
  insert into public.wc_chat(room_id, kind, body) values (p_room, 'system', v_name || ' ออกจากห้อง');
  if v.host_id = p_player then
    select player_id, name into v_host, v_host_name from public.wc_players where room_id = p_room and left_at is null order by join_order limit 1;
    update public.wc_rooms set host_id = v_host where id = p_room;
    insert into public.wc_chat(room_id, kind, body) values (p_room, 'system', v_host_name || ' เป็นเจ้าของห้องคนใหม่');
  end if;
  if v.status = 'playing' and not public.wc_check_end(p_room) and v.turn_player = p_player then
    perform public.wc_next_turn(p_room, v.need);
  end if;
  update public.wc_rooms set updated_at = now() where id = p_room;
end;
$$;

-- ---------------------------------------------------------------- RPC ที่เว็บเรียกใช้

create or replace function public.wc_list_rooms(p_player_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_rooms jsonb;
  v_mine uuid;
begin
  perform public.wc_assert_player(p_player_id, null);
  update public.wc_rooms r set status = 'ended', turn_player = null, updated_at = now()
  where r.status <> 'ended' and (
    r.updated_at < now() - interval '12 hours' or (
      r.updated_at < now() - interval '3 minutes'
      and not exists (select 1 from public.wc_players p where p.room_id = r.id and p.left_at is null and p.last_seen > now() - interval '3 minutes')));
  delete from public.wc_rooms where status = 'ended' and updated_at < now() - interval '3 days';

  select r.id into v_mine from public.wc_rooms r
  join public.wc_players p on p.room_id = r.id and p.player_id = p_player_id and p.left_at is null
  where r.status <> 'ended' or r.updated_at > now() - interval '10 minutes'
  order by r.updated_at desc limit 1;

  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into v_rooms from (
    select jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status, 'count_words', coalesce(array_length(r.used,1),0),
      'max_players', (r.settings->>'max_players')::integer, 'settings', r.settings,
      'count', (select count(*) from public.wc_players p where p.room_id = r.id and p.left_at is null),
      'host_name', (select p.name from public.wc_players p where p.room_id = r.id and p.player_id = r.host_id),
      'names', (select coalesce(jsonb_agg(p.name order by p.join_order), '[]'::jsonb) from public.wc_players p where p.room_id = r.id and p.left_at is null),
      'created_at', r.created_at) as x
    from public.wc_rooms r
    where exists (select 1 from public.wc_players p where p.room_id = r.id and p.left_at is null)
      and (r.status <> 'ended' or r.updated_at > now() - interval '10 minutes')
    order by r.created_at desc limit 30) s;
  return jsonb_build_object('rooms', v_rooms, 'my_room_id', v_mine);
end;
$$;

create or replace function public.wc_create_room(p_player_id text, p_name text, p_room_name text, p_settings jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := public.wc_assert_player(p_player_id, p_name);
  v_settings jsonb := public.wc_clean_settings(p_settings);
  v_room uuid;
  v_old record;
begin
  for v_old in select p.room_id from public.wc_players p where p.player_id = p_player_id and p.left_at is null loop
    perform public.wc_leave(v_old.room_id, p_player_id);
  end loop;
  insert into public.wc_rooms(name, host_id, status, settings)
  values (left(coalesce(nullif(btrim(p_room_name),''), 'ห้องของ ' || v_name), 40), p_player_id, 'waiting', v_settings)
  returning id into v_room;
  insert into public.wc_players(room_id, player_id, name, join_order) values (v_room, p_player_id, v_name, 1);
  insert into public.wc_chat(room_id, kind, body) values (v_room, 'system', v_name || ' สร้างห้อง รอเพื่อนแล้วกดเริ่มได้เลย (เล่นคนเดียวก็ได้)');
  return public.wc_state(v_room, p_player_id);
end;
$$;

create or replace function public.wc_join_room(p_player_id text, p_name text, p_room_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := public.wc_assert_player(p_player_id, p_name);
  v public.wc_rooms%rowtype;
  v_old record;
  v_count integer;
  v_order integer;
begin
  select * into v from public.wc_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้แล้ว'; end if;
  if exists (select 1 from public.wc_players where room_id = p_room_id and player_id = p_player_id and left_at is null) then
    update public.wc_players set last_seen = now(), name = v_name where room_id = p_room_id and player_id = p_player_id;
    return public.wc_state(p_room_id, p_player_id);
  end if;
  select count(*)::integer into v_count from public.wc_players where room_id = p_room_id and left_at is null;
  if v.status = 'ended' and v_count = 0 then raise exception 'ห้องนี้ปิดแล้ว'; end if;
  if v_count >= (v.settings->>'max_players')::integer then raise exception 'ห้องเต็มแล้ว'; end if;
  for v_old in select p.room_id from public.wc_players p where p.player_id = p_player_id and p.left_at is null and p.room_id <> p_room_id loop
    perform public.wc_leave(v_old.room_id, p_player_id);
  end loop;
  select coalesce(max(join_order),0) + 1 into v_order from public.wc_players where room_id = p_room_id;
  -- เข้ากลางเกม = ดูไปก่อน ได้เล่นเกมถัดไป
  insert into public.wc_players(room_id, player_id, name, join_order, out_at)
  values (p_room_id, p_player_id, v_name, v_order, case when v.status = 'playing' then now() end)
  on conflict (room_id, player_id) do update set name = excluded.name, left_at = null, last_seen = now(),
    join_order = excluded.join_order, lives = 0, out_at = excluded.out_at;
  insert into public.wc_chat(room_id, kind, body)
  values (p_room_id, 'system', v_name || ' เข้าห้อง' || case when v.status = 'playing' then ' (ดูไปก่อน ได้เล่นเกมหน้า)' else '' end);
  update public.wc_rooms set updated_at = now() where id = p_room_id;
  return public.wc_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.wc_leave_room(p_room_id uuid, p_player_id text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.wc_assert_player(p_player_id, null);
  perform public.wc_leave(p_room_id, p_player_id);
end;
$$;

-- อ่านสถานะ + heartbeat
create or replace function public.wc_get_state(p_room_id uuid, p_player_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.wc_assert_player(p_player_id, null);
  update public.wc_players set last_seen = now() where room_id = p_room_id and player_id = p_player_id and left_at is null;
  return public.wc_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.wc_update_settings(p_room_id uuid, p_player_id text, p_name text, p_settings jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
begin
  select * into v from public.wc_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้แล้ว'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องที่ตั้งค่าได้'; end if;
  if v.status = 'playing' then raise exception 'ตั้งค่าได้ตอนยังไม่เริ่มเกมเท่านั้น'; end if;
  update public.wc_rooms set settings = public.wc_clean_settings(p_settings),
    name = left(coalesce(nullif(btrim(p_name),''), name), 40), updated_at = now() where id = p_room_id;
  insert into public.wc_chat(room_id, kind, body) values (p_room_id, 'system', 'เจ้าของห้องเปลี่ยนการตั้งค่า');
  return public.wc_state(p_room_id, p_player_id);
end;
$$;

-- เริ่มเกม (ห้องรอ หรือเล่นอีกรอบหลังจบ)
create or replace function public.wc_start(p_room_id uuid, p_player_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_count integer;
  v_first text;
  v_need text;
begin
  select * into v from public.wc_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้แล้ว'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องที่เริ่มเกมได้'; end if;
  if v.status = 'playing' then return public.wc_state(p_room_id, p_player_id); end if;
  update public.wc_players set lives = (v.settings->>'lives')::integer, words = 0, out_at = null
  where room_id = p_room_id and left_at is null;
  select count(*)::integer into v_count from public.wc_players where room_id = p_room_id and left_at is null;
  select player_id into v_first from public.wc_players where room_id = p_room_id and left_at is null order by random() limit 1;
  v_need := public.wc_pick_need(null, '{}');
  update public.wc_rooms set status = 'playing', game_no = game_no + 1, turn_no = 1, turn_player = v_first, need = v_need,
    turn_ends_at = now() + make_interval(secs => (v.settings->>'turn_seconds')::integer + 3),
    used = '{}', used_by = '{}', winner_id = null, solo = v_count = 1, updated_at = now()
  where id = p_room_id;
  insert into public.wc_chat(room_id, kind, body) values (p_room_id, 'system', 'เริ่มเกม! คำแรกขึ้นต้นด้วย "' || v_need || '"');
  return public.wc_state(p_room_id, p_player_id);
end;
$$;

-- ส่งคำ: ผิดกติกาไม่เสียหัวใจ แก้แล้วส่งใหม่ได้จนกว่าหมดเวลา
create or replace function public.wc_play(p_room_id uuid, p_player_id text, p_turn_no integer, p_word text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_word text := regexp_replace(coalesce(p_word,''), '[[:space:]]+', '', 'g');
  v_name text;
  v_link text;
  v_need text;
begin
  select * into v from public.wc_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้แล้ว'; end if;
  if v.status <> 'playing' or v.turn_no <> p_turn_no then return jsonb_build_object('ok', false, 'stale', true, 'state', public.wc_state(p_room_id, p_player_id)); end if;
  if v.turn_player <> p_player_id then return jsonb_build_object('ok', false, 'message', 'ยังไม่ถึงตาคุณ'); end if;
  if now() > v.turn_ends_at + interval '1.5 seconds' then return jsonb_build_object('ok', false, 'message', 'หมดเวลาแล้ว', 'expired', true); end if;
  if v_word !~ '^[ก-ฺเ-๎]{2,20}$' then return jsonb_build_object('ok', false, 'message', 'ใช้ตัวอักษรไทย 2–20 ตัว ไม่มีช่องว่างหรือตัวเลข'); end if;
  if public.wc_head(v_word) is distinct from v.need then return jsonb_build_object('ok', false, 'message', 'ต้องขึ้นต้นด้วย "' || v.need || '"'); end if;
  if v_word = any(v.used) then return jsonb_build_object('ok', false, 'message', '"' || v_word || '" ใช้ไปแล้ว'); end if;
  update public.wc_players set words = words + 1, last_seen = now() where room_id = p_room_id and player_id = p_player_id returning name into v_name;
  v_link := public.wc_tail(v_word);
  v_need := public.wc_pick_need(v_link, v.used || v_word);
  update public.wc_rooms set used = used || v_word, used_by = used_by || p_player_id where id = p_room_id;
  insert into public.wc_chat(room_id, player_id, name, kind, body) values (p_room_id, p_player_id, v_name, 'word', v_word);
  if v_need is distinct from v_link then
    insert into public.wc_chat(room_id, kind, body) values (p_room_id, 'system',
      coalesce('คำที่ขึ้นต้นด้วย "' || v_link || '" มีน้อยมาก ', 'หาตัวต่อไม่ได้ ') || 'สุ่มตัวใหม่เป็น "' || v_need || '"');
  end if;
  perform public.wc_next_turn(p_room_id, v_need);
  return jsonb_build_object('ok', true, 'state', public.wc_state(p_room_id, p_player_id));
end;
$$;

-- หมดเวลา (ใครในห้องก็เรียกได้ เมื่อเลยเวลาจริง หรือคนที่ถึงตาหายไปเกิน 25 วิ)
create or replace function public.wc_timeout(p_room_id uuid, p_player_id text, p_turn_no integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
  v_p public.wc_players%rowtype;
begin
  select * into v from public.wc_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้แล้ว'; end if;
  if v.status <> 'playing' or v.turn_no <> p_turn_no then return jsonb_build_object('stale', true, 'state', public.wc_state(p_room_id, p_player_id)); end if;
  if not exists (select 1 from public.wc_players where room_id = p_room_id and player_id = p_player_id and left_at is null) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  select * into v_p from public.wc_players where room_id = p_room_id and player_id = v.turn_player;
  if now() < v.turn_ends_at - interval '0.5 seconds' and not (v_p.left_at is not null or v_p.last_seen < now() - interval '25 seconds') then
    return jsonb_build_object('early', true, 'state', public.wc_state(p_room_id, p_player_id));
  end if;
  update public.wc_players set lives = greatest(lives - 1, 0), out_at = case when lives <= 1 then now() else out_at end
  where room_id = p_room_id and player_id = v.turn_player returning * into v_p;
  insert into public.wc_chat(room_id, kind, body) values (p_room_id, 'system',
    '⏰ ' || v_p.name || ' หมดเวลา' || case when v_p.out_at is not null then ' หัวใจหมด ตกรอบ' else ' เหลือ ' || v_p.lives || ' ❤' end);
  if not public.wc_check_end(p_room_id) then perform public.wc_next_turn(p_room_id, v.need); end if;
  return jsonb_build_object('ok', true, 'state', public.wc_state(p_room_id, p_player_id));
end;
$$;

create or replace function public.wc_end_room(p_room_id uuid, p_player_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.wc_rooms%rowtype;
begin
  select * into v from public.wc_rooms where id = p_room_id for update;
  if not found then raise exception 'ไม่พบห้องนี้แล้ว'; end if;
  if v.host_id <> p_player_id then raise exception 'เฉพาะเจ้าของห้องที่จบเกมได้'; end if;
  if v.status = 'playing' then
    update public.wc_rooms set status = 'ended', turn_player = null, turn_ends_at = null, updated_at = now() where id = p_room_id;
    insert into public.wc_chat(room_id, kind, body) values (p_room_id, 'system', 'เจ้าของห้องจบเกม ต่อได้ ' || coalesce(array_length(v.used,1),0) || ' คำ');
  end if;
  return public.wc_state(p_room_id, p_player_id);
end;
$$;

create or replace function public.wc_send(p_room_id uuid, p_player_id text, p_text text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text;
  v_text text := left(btrim(coalesce(p_text,'')), 160);
begin
  if v_text = '' then return jsonb_build_object('ok', false); end if;
  select name into v_name from public.wc_players where room_id = p_room_id and player_id = p_player_id and left_at is null;
  if v_name is null then raise exception 'คุณไม่ได้อยู่ในห้องนี้'; end if;
  if (select count(*) from public.wc_chat where room_id = p_room_id and player_id = p_player_id and kind = 'chat' and created_at > now() - interval '5 seconds') >= 5 then
    return jsonb_build_object('ok', false, 'throttled', true);
  end if;
  insert into public.wc_chat(room_id, player_id, name, kind, body) values (p_room_id, p_player_id, v_name, 'chat', v_text);
  update public.wc_players set last_seen = now() where room_id = p_room_id and player_id = p_player_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.wc_get_chat(p_room_id uuid, p_player_id text, p_after bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'player_id', c.player_id, 'name', c.name, 'kind', c.kind, 'body', c.body, 'at', c.created_at) order by c.id), '[]'::jsonb)
  from (select * from public.wc_chat where room_id = p_room_id and id > coalesce(p_after, 0) order by id desc limit 150) c;
$$;

-- สิทธิ์: ตัวช่วยภายในห้ามเรียกจากเว็บ, RPC เปิดให้ anon
do $$
declare f text;
begin
  foreach f in array array['wc_head(text)','wc_tail(text)','wc_pick_need(text,text[])','wc_assert_player(text,text)','wc_clean_settings(jsonb)',
    'wc_state(uuid,text)','wc_next_turn(uuid,text)','wc_check_end(uuid)','wc_leave(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['wc_list_rooms(text)','wc_create_room(text,text,text,jsonb)','wc_join_room(text,text,uuid)','wc_leave_room(uuid,text)',
    'wc_get_state(uuid,text)','wc_update_settings(uuid,text,text,jsonb)','wc_start(uuid,text)','wc_play(uuid,text,integer,text)',
    'wc_timeout(uuid,text,integer)','wc_end_room(uuid,text)','wc_send(uuid,text,text)','wc_get_chat(uuid,text,bigint)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
