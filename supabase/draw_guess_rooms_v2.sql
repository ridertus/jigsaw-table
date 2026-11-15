-- Draw & Guess Room Flow v2
-- Run once after deploying the matching client source locally for testing.
-- Changes: finite room rounds, shared participant controls, automatic final standings.
-- Existing puzzle/whiteboard tables are not modified.

-- The state RPC now exposes the finite round count. Older sessions without
-- settings.total_rounds are treated as five-round rooms.
create or replace function public.dg_internal_state(p_session_id uuid, p_player_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.draw_guess_sessions%rowtype;
  v_word public.draw_guess_words%rowtype;
  v_players jsonb;
  v_strokes jsonb;
  v_is_drawer boolean;
  v_total_rounds integer;
begin
  select * into v_session
  from public.draw_guess_sessions
  where id = p_session_id;

  if not found then
    return jsonb_build_object('active', false);
  end if;

  select * into v_word
  from public.draw_guess_words
  where id = v_session.word_id;

  v_is_drawer := coalesce(p_player_id, '') = v_session.drawer_id;
  v_total_rounds := case
    when coalesce(v_session.settings->>'total_rounds', '') ~ '^[0-9]+$'
      then greatest(1, (v_session.settings->>'total_rounds')::integer)
    else 5
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'player_id', p.player_id,
    'name', p.display_name,
    'score', p.score,
    'join_order', p.join_order,
    'solved', p.solved_at is not null,
    'solved_at', p.solved_at,
    'is_drawer', p.player_id = v_session.drawer_id
  ) order by p.join_order), '[]'::jsonb)
  into v_players
  from public.draw_guess_players p
  where p.session_id = v_session.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'drawer_id', s.drawer_id,
    'stroke', s.stroke
  ) order by s.created_at, s.id), '[]'::jsonb)
  into v_strokes
  from public.draw_guess_strokes s
  where s.session_id = v_session.id and s.round_no = v_session.round_no;

  return jsonb_build_object(
    'active', v_session.status <> 'ended',
    'session_id', v_session.id,
    'status', v_session.status,
    'controller_id', v_session.controller_id,
    'settings', v_session.settings,
    'total_rounds', v_total_rounds,
    'round_no', v_session.round_no,
    'drawer_id', v_session.drawer_id,
    'category', v_session.category,
    'started_at', v_session.started_at,
    'ends_at', v_session.ends_at,
    'revealed_at', v_session.revealed_at,
    'secret_word', case when v_is_drawer and v_session.status = 'drawing' then v_word.answer else null end,
    'answer', case when v_session.status in ('reveal','ended') then v_word.answer else null end,
    'is_participant', exists (
      select 1 from public.draw_guess_players p
      where p.session_id = v_session.id and p.player_id = p_player_id
    ),
    'players', v_players,
    'strokes', v_strokes
  );
end;
$$;

-- Create a room with a fixed number of rounds (1-30).
-- The creator is recorded for history only; they receive no exclusive controls.
create or replace function public.dg_start_room(
  p_creator_id text,
  p_players jsonb,
  p_categories text[],
  p_difficulty text,
  p_duration_seconds integer,
  p_total_rounds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_word public.draw_guess_words%rowtype;
  v_count integer;
  v_categories text[];
  v_roster jsonb;
  v_drawer_id text;
  v_duration integer;
begin
  if p_creator_id is null or length(p_creator_id) < 1 or length(p_creator_id) > 80 then
    raise exception 'invalid room creator';
  end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'invalid player list';
  end if;
  v_count := jsonb_array_length(p_players);
  if v_count < 2 or v_count > 4 then
    raise exception 'ต้องมีผู้เล่น 2–4 คน';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_players) x
    where x->>'id' = p_creator_id
  ) then
    raise exception 'creator must be in the player list';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_players) x
    where coalesce(trim(x->>'id'),'') = '' or length(trim(x->>'id')) > 80
  ) then
    raise exception 'invalid player id in roster';
  end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_players) x) <> v_count then
    raise exception 'duplicate player id';
  end if;

  v_categories := array(
    select distinct c
    from unnest(coalesce(p_categories, '{}'::text[])) c
    where c = any(array['animals','food','objects','occupations','places','nature','vehicles','thai_culture','fantasy']::text[])
  );
  if coalesce(array_length(v_categories, 1), 0) = 0 then
    raise exception 'เลือกอย่างน้อยหนึ่งหมวดหมู่';
  end if;
  if p_difficulty is null or p_difficulty not in ('easy','normal','hard') then
    raise exception 'invalid difficulty';
  end if;
  if coalesce(p_duration_seconds, 90) not in (0,60,90,120) then
    raise exception 'invalid duration';
  end if;
  if p_total_rounds is null or p_total_rounds < 1 or p_total_rounds > 30 then
    raise exception 'จำนวนรอบต้องอยู่ระหว่าง 1–30 รอบ';
  end if;
  v_duration := coalesce(p_duration_seconds, 90);

  -- A room abandoned for a full day must not block everyone forever.
  update public.draw_guess_sessions
  set status='ended',updated_at=now()
  where lobby_id='main' and status in ('drawing','reveal')
    and updated_at < now() - interval '24 hours';

  if exists (
    select 1 from public.draw_guess_sessions s
    where s.lobby_id = 'main' and s.status in ('drawing','reveal')
  ) then
    raise exception 'มีห้อง Draw & Guess กำลังเล่นอยู่แล้ว';
  end if;

  select x->>'id' into v_drawer_id
  from jsonb_array_elements(p_players) with ordinality a(x, n)
  order by n limit 1;

  select * into v_word
  from public.draw_guess_words w
  where w.enabled and w.category = any(v_categories) and w.difficulty = p_difficulty
  order by random()
  limit 1;
  if not found then
    raise exception 'ไม่พบคำในหมวดหมู่และระดับนี้';
  end if;

  v_roster := (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', left(trim(x->>'id'),80),
      'name', left(coalesce(nullif(trim(x->>'name'),''),'ผู้เล่น'),32)
    ) order by n), '[]'::jsonb)
    from jsonb_array_elements(p_players) with ordinality a(x,n)
  );

  insert into public.draw_guess_sessions (
    lobby_id,status,controller_id,settings,roster,round_no,drawer_id,word_id,category,recent_word_ids,started_at,ends_at
  ) values (
    'main','drawing',p_creator_id,
    jsonb_build_object(
      'categories',to_jsonb(v_categories),
      'difficulty',p_difficulty,
      'duration_seconds',v_duration,
      'total_rounds',p_total_rounds
    ),
    v_roster,1,v_drawer_id,v_word.id,v_word.category,array[v_word.id],now(),
    case when v_duration=0 then null else now()+make_interval(secs=>v_duration) end
  ) returning id into v_session_id;

  insert into public.draw_guess_players(session_id,player_id,display_name,join_order)
  select v_session_id, x->>'id', coalesce(nullif(x->>'name',''),'ผู้เล่น'), n::integer
  from jsonb_array_elements(v_roster) with ordinality a(x,n);

  return public.dg_internal_state(v_session_id,p_creator_id);
end;
$$;

-- Any player in the room may skip the current round.
create or replace function public.dg_finish_round_room(
  p_session_id uuid,
  p_round_no integer,
  p_requester_id text,
  p_reason text default 'timeout'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.draw_guess_sessions%rowtype;
  v_guessers integer;
  v_solved integer;
  v_finished_by_all boolean;
begin
  select * into v_session
  from public.draw_guess_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'stale',true);
  end if;
  if v_session.status in ('reveal','ended') then
    return jsonb_build_object('ok',true,'state',public.dg_internal_state(p_session_id,p_requester_id));
  end if;
  if v_session.status <> 'drawing' or v_session.round_no <> p_round_no then
    return jsonb_build_object('ok',false,'stale',true,'state',public.dg_internal_state(p_session_id,p_requester_id));
  end if;
  if not exists (
    select 1 from public.draw_guess_players p
    where p.session_id = p_session_id and p.player_id = p_requester_id
  ) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  if p_reason is null or p_reason not in ('timeout','skipped','all_solved') then
    raise exception 'invalid finish reason';
  end if;
  if p_reason = 'timeout' and (v_session.ends_at is null or now() < v_session.ends_at) then
    return jsonb_build_object('ok',false,'not_expired',true);
  end if;

  select count(*)::integer into v_guessers
  from public.draw_guess_players
  where session_id=p_session_id and player_id<>v_session.drawer_id;
  select count(*)::integer into v_solved
  from public.draw_guess_players
  where session_id=p_session_id and player_id<>v_session.drawer_id and solved_at is not null;
  v_finished_by_all := v_guessers > 0 and v_guessers = v_solved;
  if p_reason = 'all_solved' and not v_finished_by_all then
    return jsonb_build_object('ok',false,'not_all_solved',true);
  end if;
  if v_finished_by_all and p_reason <> 'all_solved' then
    update public.draw_guess_players set score=score+2
    where session_id=p_session_id and player_id=v_session.drawer_id;
  end if;

  update public.draw_guess_sessions
  set status='reveal',revealed_at=now(),updated_at=now()
  where id=p_session_id and status='drawing';

  return jsonb_build_object('ok',true,'state',public.dg_internal_state(p_session_id,p_requester_id));
end;
$$;

-- Any room participant may advance the game. Row locking makes simultaneous
-- clicks/auto-advance calls idempotent. The last configured round ends the room.
create or replace function public.dg_advance_round(
  p_session_id uuid,
  p_requester_id text,
  p_round_no integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.draw_guess_sessions%rowtype;
  v_word public.draw_guess_words%rowtype;
  v_next_drawer text;
  v_next_order integer;
  v_duration integer;
  v_total_rounds integer;
  v_recent bigint[];
begin
  select * into v_session
  from public.draw_guess_sessions
  where id=p_session_id
  for update;

  if not found then
    raise exception 'ไม่พบห้องนี้';
  end if;
  if v_session.status = 'ended' then
    return public.dg_internal_state(p_session_id,p_requester_id);
  end if;
  if not exists (
    select 1 from public.draw_guess_players p
    where p.session_id=p_session_id and p.player_id=p_requester_id
  ) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  -- A concurrent player may already have advanced this round. Return the
  -- latest state instead of failing or incrementing twice.
  if v_session.round_no <> p_round_no then
    return public.dg_internal_state(p_session_id,p_requester_id);
  end if;
  if v_session.status <> 'reveal' then
    raise exception 'รอบนี้ยังไม่พร้อมสำหรับรอบถัดไป';
  end if;

  v_total_rounds := case
    when coalesce(v_session.settings->>'total_rounds', '') ~ '^[0-9]+$'
      then greatest(1, (v_session.settings->>'total_rounds')::integer)
    else 5
  end;
  if v_session.round_no >= v_total_rounds then
    update public.draw_guess_sessions
    set status='ended',updated_at=now()
    where id=p_session_id and status='reveal';
    return public.dg_internal_state(p_session_id,p_requester_id);
  end if;

  select p.join_order into v_next_order
  from public.draw_guess_players p
  where p.session_id=p_session_id and p.player_id=v_session.drawer_id;

  select p.player_id into v_next_drawer
  from public.draw_guess_players p
  where p.session_id=p_session_id and p.join_order > coalesce(v_next_order,0)
  order by p.join_order limit 1;
  if v_next_drawer is null then
    select p.player_id into v_next_drawer
    from public.draw_guess_players p
    where p.session_id=p_session_id
    order by p.join_order limit 1;
  end if;

  v_recent := coalesce(v_session.recent_word_ids,'{}'::bigint[]);
  if not (v_session.word_id = any(v_recent)) then
    v_recent := v_recent || v_session.word_id;
  end if;

  select * into v_word
  from public.draw_guess_words w
  where w.enabled
    and w.category = any(array(select jsonb_array_elements_text(v_session.settings->'categories')))
    and w.difficulty = v_session.settings->>'difficulty'
    and not (w.id = any(v_recent))
  order by random() limit 1;
  if not found then
    select * into v_word
    from public.draw_guess_words w
    where w.enabled
      and w.category = any(array(select jsonb_array_elements_text(v_session.settings->'categories')))
      and w.difficulty = v_session.settings->>'difficulty'
    order by random() limit 1;
  end if;
  if not found then
    raise exception 'ไม่พบคำสำหรับรอบถัดไป';
  end if;

  v_duration := coalesce((v_session.settings->>'duration_seconds')::integer,90);
  update public.draw_guess_players set solved_at=null where session_id=p_session_id;
  update public.draw_guess_sessions set
    status='drawing',
    round_no=round_no+1,
    drawer_id=v_next_drawer,
    word_id=v_word.id,
    category=v_word.category,
    recent_word_ids=(v_recent[greatest(1,array_length(v_recent,1)-14):array_length(v_recent,1)]),
    started_at=now(),
    ends_at=case when v_duration=0 then null else now()+make_interval(secs=>v_duration) end,
    revealed_at=null,
    updated_at=now()
  where id=p_session_id and status='reveal';

  return public.dg_internal_state(p_session_id,p_requester_id);
end;
$$;

-- Any participant may end a room early, with confirmation in the client.
create or replace function public.dg_close_room(
  p_session_id uuid,
  p_requester_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.draw_guess_sessions%rowtype;
begin
  select * into v_session
  from public.draw_guess_sessions
  where id=p_session_id
  for update;
  if not found then
    return jsonb_build_object('ok',false);
  end if;
  if v_session.status='ended' then
    return jsonb_build_object('ok',true,'state',public.dg_internal_state(p_session_id,p_requester_id));
  end if;
  if not exists (
    select 1 from public.draw_guess_players p
    where p.session_id=p_session_id and p.player_id=p_requester_id
  ) then
    raise exception 'คุณไม่ได้อยู่ในห้องนี้';
  end if;
  update public.draw_guess_sessions
  set status='ended',updated_at=now()
  where id=p_session_id;
  return jsonb_build_object('ok',true,'state',public.dg_internal_state(p_session_id,p_requester_id));
end;
$$;

-- Retire the old controller-only entry points so the old, unlimited-round
-- client cannot create or control rooms after this migration.
revoke all on function public.dg_start_session(text,jsonb,text[],text,integer) from public, anon, authenticated;
revoke all on function public.dg_finish_round(uuid,integer,text,text) from public, anon, authenticated;
revoke all on function public.dg_next_round(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.dg_end_session(uuid,text) from public, anon, authenticated;

revoke all on function public.dg_start_room(text,jsonb,text[],text,integer,integer) from public, anon, authenticated;
revoke all on function public.dg_finish_round_room(uuid,integer,text,text) from public, anon, authenticated;
revoke all on function public.dg_advance_round(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.dg_close_room(uuid,text) from public, anon, authenticated;

grant execute on function public.dg_start_room(text,jsonb,text[],text,integer,integer) to anon, authenticated;
grant execute on function public.dg_finish_round_room(uuid,integer,text,text) to anon, authenticated;
grant execute on function public.dg_advance_round(uuid,text,integer) to anon, authenticated;
grant execute on function public.dg_close_room(uuid,text) to anon, authenticated;

-- End legacy endless sessions (such as round 200+) so a fresh room can be made.
-- The records and scores are retained. Their room status is closed and the historical round count is recorded for the final summary.
update public.draw_guess_sessions
set status='ended',
    settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{total_rounds}',to_jsonb(round_no),true),
    updated_at=now()
where status in ('drawing','reveal')
  and round_no > case
    when coalesce(settings->>'total_rounds','') ~ '^[0-9]+$'
      then greatest(1, least(30, (settings->>'total_rounds')::integer))
    else 5
  end;

comment on function public.dg_start_room(text,jsonb,text[],text,integer,integer)
  is 'Creates a finite-round Draw & Guess room; creator has no exclusive gameplay permissions.';
comment on function public.dg_advance_round(uuid,text,integer)
  is 'Any participant can advance; last configured round automatically ends the room.';
comment on function public.dg_close_room(uuid,text)
  is 'Any participant can end the room early.';
