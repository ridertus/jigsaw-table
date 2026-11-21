-- ร้านเครื่องดื่ม (Cafe) — ร้านเดียวที่ทุกคนในห้องนั่งเล่นช่วยกันทำ
-- รันใน Supabase SQL Editor (รันซ้ำได้) ตารางและฟังก์ชันขึ้นต้นด้วย cafe_ ไม่แตะของเกมอื่น
-- ลูกค้า (เวลามา/เวลากลับ/เมนู) สร้างฝั่งเซิร์ฟเวอร์ตอนเปิดร้าน ทุกเครื่องเห็นลูกค้าคนเดียวกัน
-- การให้คะแนน/แต้ม/ซื้อของทำฝั่งเซิร์ฟเวอร์ ยกเว้นความแม่นของการปั่น (มาจากเครื่องคนเล่น)
-- ผู้เล่นเป็น guest (player_id จาก localStorage) เหมือนเกมอื่น เพื่อนที่ตั้งใจโกงเรียก RPC ตรงได้

-- ---------------------------------------------------------------- ข้อมูลของในร้าน
-- cat: base (ฐานเครื่องดื่ม เลือก 1), mix (ไซรัป/นม ใส่ได้ 1–3), top (ท็อปปิ้ง 1–2), machine, upgrade
-- price = ราคาที่ลูกค้าจ่ายต่อหน่วย, cost = แต้มที่ต้องใช้ปลดล็อก (0 = มีตั้งแต่แรก), upgrade ใช้ costs ต่อเลเวล
create table if not exists public.cafe_items (
  id text primary key,
  cat text not null check (cat in ('base','mix','top','machine','upgrade')),
  price integer not null default 0,
  cost integer not null default 0,
  costs integer[] not null default '{}',
  sort integer not null default 0
);
insert into public.cafe_items(id, cat, price, cost, costs, sort) values
  ('thai','base',25,0,'{}',1), ('green','base',25,0,'{}',2), ('milk','base',20,0,'{}',3),
  ('coffee','base',30,150,'{}',4), ('cocoa','base',30,150,'{}',5), ('lemon','base',25,200,'{}',6),
  ('pink','base',30,250,'{}',7), ('peach','base',35,350,'{}',8),
  ('sugar','mix',3,0,'{}',10), ('condensed','mix',5,120,'{}',11), ('honey','mix',5,100,'{}',12),
  ('caramel','mix',6,150,'{}',13), ('vanilla','mix',6,150,'{}',14),
  ('pearl','top',8,0,'{}',20), ('whip','top',8,0,'{}',21), ('jelly','top',8,120,'{}',22),
  ('sprinkle','top',6,150,'{}',23), ('choc','top',6,150,'{}',24), ('cheese','top',12,250,'{}',25),
  ('blender','machine',15,400,'{}',30),
  ('sign','upgrade',0,0,'{300,600,1000}',40), ('bench','upgrade',0,0,'{250,500,800}',41), ('jar','upgrade',0,0,'{200,400,700}',42)
on conflict (id) do update set cat = excluded.cat, price = excluded.price, cost = excluded.cost, costs = excluded.costs, sort = excluded.sort;

create table if not exists public.cafe_shop (
  id text primary key default 'main',
  open boolean not null default false,
  day integer not null default 0,
  opened_at timestamptz,
  closed_at timestamptz,
  coins integer not null default 0,
  unlocked text[] not null default '{}',
  upgrades jsonb not null default '{}'::jsonb,
  last_day jsonb,
  best_day integer not null default 0,
  total_served integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.cafe_shop(id) values ('main') on conflict do nothing;

create table if not exists public.cafe_customers (
  day integer not null,
  idx integer not null,
  arrive_at timestamptz not null,
  leave_at timestamptz not null,
  look integer not null,
  ord jsonb not null,
  price integer not null,
  served_by text,
  served_name text,
  served_at timestamptz,
  score integer,
  coins integer,
  primary key (day, idx)
);

create table if not exists public.cafe_workers (
  player_id text primary key,
  name text not null,
  last_seen timestamptz not null default now()
);

alter table public.cafe_items enable row level security;
alter table public.cafe_shop enable row level security;
alter table public.cafe_customers enable row level security;
alter table public.cafe_workers enable row level security;
revoke all on public.cafe_items, public.cafe_shop, public.cafe_customers, public.cafe_workers from anon, authenticated;

-- ---------------------------------------------------------------- ตัวช่วยภายใน

create or replace function public.cafe_lvl(p_up jsonb, p_key text)
returns integer language sql immutable set search_path = '' as $$
  select least(3, greatest(0, coalesce((p_up->>p_key)::integer, 0)));
$$;

-- สุ่มลูกค้า p_count คน ต่อจากคนสุดท้ายของวัน (เมนูจากของที่ปลดล็อกแล้วเท่านั้น)
create or replace function public.cafe_gen(p_count integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.cafe_shop%rowtype;
  v_idx integer;
  v_at timestamptz;
  v_bases text[]; v_mix text[]; v_top text[];
  v_blender boolean;
  v_base text; v_items jsonb; v_ice integer; v_blend integer; v_price integer; v_n integer; v_pick text; v_k integer; v_easy integer;
  v_gap double precision; v_pat double precision;
begin
  select * into s from public.cafe_shop where id = 'main';
  select coalesce(max(idx), 0), coalesce(max(arrive_at), s.opened_at + interval '1 second') into v_idx, v_at from public.cafe_customers where day = s.day;
  select array_agg(id order by sort) filter (where cat = 'base'), array_agg(id order by sort) filter (where cat = 'mix'), array_agg(id order by sort) filter (where cat = 'top')
    into v_bases, v_mix, v_top
  from public.cafe_items where cat in ('base','mix','top') and (cost = 0 or id = any(s.unlocked));
  v_blender := 'blender' = any(s.unlocked);
  for i in 1..p_count loop
    v_idx := v_idx + 1;
    v_easy := case when v_idx <= 3 then 1 else 0 end;   -- 3 คนแรกของวันสั่งง่าย ๆ
    v_base := v_bases[1 + floor(random() * array_length(v_bases, 1))::integer];
    v_blend := case when v_blender and v_easy = 0 and random() < 0.35 then 1 else 0 end;
    v_ice := case when v_blend = 1 or random() < 0.75 then 1 else 0 end;
    v_items := '{}'::jsonb;
    v_n := case when v_easy = 1 then floor(random() * 2)::integer else floor(random() * 3)::integer end;
    for k in 1..v_n loop
      v_pick := v_mix[1 + floor(random() * array_length(v_mix, 1))::integer];
      v_items := v_items || jsonb_build_object(v_pick, least(3, coalesce((v_items->>v_pick)::integer, 0) + 1 + floor(random() * 2)::integer));
    end loop;
    v_n := case when v_easy = 1 then 1 else floor(random() * 3)::integer end;
    for k in 1..v_n loop
      v_pick := v_top[1 + floor(random() * array_length(v_top, 1))::integer];
      v_items := v_items || jsonb_build_object(v_pick, least(2, coalesce((v_items->>v_pick)::integer, 0) + 1));
    end loop;
    select coalesce(sum(it.price * (v_items->>it.id)::integer), 0)::integer into v_price from public.cafe_items it where v_items ? it.id;
    v_price := v_price + (select price from public.cafe_items where id = v_base) + v_blend * (select price from public.cafe_items where id = 'blender');
    select count(*)::integer into v_k from jsonb_object_keys(v_items);
    v_gap := (case when v_idx = 1 then 2 else 9 + random() * 9 end) * (1 - 0.15 * public.cafe_lvl(s.upgrades, 'sign'));
    v_pat := 60 + 15 * public.cafe_lvl(s.upgrades, 'bench') + 6 * v_k + 8 * v_blend;
    v_at := v_at + make_interval(secs => v_gap);
    insert into public.cafe_customers(day, idx, arrive_at, leave_at, look, ord, price)
    values (s.day, v_idx, v_at, v_at + make_interval(secs => v_pat), floor(random() * 100000)::integer,
      jsonb_build_object('base', v_base, 'ice', v_ice, 'blend', v_blend, 'items', v_items), v_price);
  end loop;
end;
$$;

-- ปิดร้าน + สรุปวัน
create or replace function public.cafe_do_close(p_at timestamptz)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.cafe_shop%rowtype;
  v_sum jsonb;
  v_earned integer;
begin
  select * into s from public.cafe_shop where id = 'main' for update;
  if not s.open then return; end if;
  p_at := greatest(coalesce(p_at, now()), s.opened_at);
  select jsonb_build_object('day', s.day,
      'served', count(*) filter (where served_at is not null),
      'perfect', count(*) filter (where score = 100),
      'missed', count(*) filter (where served_at is null and leave_at < p_at),
      'earned', coalesce(sum(coins), 0),
      'minutes', round(extract(epoch from p_at - s.opened_at) / 60)),
    coalesce(sum(coins), 0)::integer
    into v_sum, v_earned
  from public.cafe_customers where day = s.day and arrive_at < p_at;
  update public.cafe_shop set open = false, closed_at = p_at, last_day = v_sum, best_day = greatest(best_day, v_earned), updated_at = now() where id = 'main';
  delete from public.cafe_customers where day < s.day - 3;
end;
$$;

-- ไม่มีใครอยู่ในร้านเกิน 90 วิ -> ปิดเอง
create or replace function public.cafe_auto_close()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_last timestamptz;
begin
  if not (select open from public.cafe_shop where id = 'main') then return; end if;
  select max(last_seen) into v_last from public.cafe_workers;
  if v_last is null or v_last < now() - interval '90 seconds' then perform public.cafe_do_close(coalesce(v_last, now())); end if;
end;
$$;

create or replace function public.cafe_state(p_player text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.cafe_shop%rowtype;
begin
  select * into s from public.cafe_shop where id = 'main';
  return jsonb_build_object(
    'open', s.open, 'day', s.day, 'opened_at', s.opened_at, 'closed_at', s.closed_at, 'coins', s.coins,
    'unlocked', to_jsonb(s.unlocked), 'upgrades', s.upgrades, 'last_day', s.last_day, 'best_day', s.best_day, 'total_served', s.total_served,
    'server_now', now(),
    'items', (select jsonb_agg(jsonb_build_object('id', id, 'cat', cat, 'price', price, 'cost', cost, 'costs', to_jsonb(costs)) order by sort) from public.cafe_items),
    'customers', case when s.open then (select coalesce(jsonb_agg(jsonb_build_object(
        'idx', c.idx, 'arrive_at', c.arrive_at, 'leave_at', c.leave_at, 'look', c.look, 'ord', c.ord, 'price', c.price,
        'served_by', c.served_by, 'served_name', c.served_name, 'served_at', c.served_at, 'score', c.score, 'coins', c.coins) order by c.idx), '[]'::jsonb)
      from public.cafe_customers c where c.day = s.day and c.arrive_at < now() + interval '75 seconds'
        and (c.leave_at > now() - interval '8 seconds' or c.served_at > now() - interval '8 seconds')) else '[]'::jsonb end,
    'today', case when s.open then (select jsonb_build_object('served', count(*) filter (where served_at is not null), 'perfect', count(*) filter (where score = 100),
        'missed', count(*) filter (where served_at is null and leave_at < now()), 'earned', coalesce(sum(coins), 0))
      from public.cafe_customers where day = s.day and arrive_at < now()) end,
    'workers', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'name', name) order by name), '[]'::jsonb)
      from public.cafe_workers where last_seen > now() - interval '30 seconds')
  );
end;
$$;

create or replace function public.cafe_assert(p_player text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_player is null or length(btrim(p_player)) < 1 or length(p_player) > 80 then raise exception 'invalid player id'; end if;
end;
$$;

-- ---------------------------------------------------------------- RPC ที่เว็บเรียกใช้

-- อ่านสถานะ; p_here = เปิดหน้าร้านอยู่ (นับเป็นคนในร้าน กันร้านปิดเอง)
create or replace function public.cafe_get_state(p_player_id text, p_name text, p_here boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.cafe_shop%rowtype;
begin
  perform public.cafe_assert(p_player_id);
  if p_here then
    insert into public.cafe_workers(player_id, name, last_seen) values (p_player_id, left(coalesce(nullif(btrim(p_name),''),'ผู้เล่น'), 32), now())
    on conflict (player_id) do update set name = excluded.name, last_seen = now();
  end if;
  perform public.cafe_auto_close();
  select * into s from public.cafe_shop where id = 'main';
  if s.open and (select coalesce(max(arrive_at), now()) from public.cafe_customers where day = s.day) < now() + interval '100 seconds' then
    perform public.cafe_gen(20);
  end if;
  delete from public.cafe_workers where last_seen < now() - interval '1 day';
  return public.cafe_state(p_player_id);
end;
$$;

create or replace function public.cafe_open(p_player_id text, p_name text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.cafe_assert(p_player_id);
  insert into public.cafe_workers(player_id, name, last_seen) values (p_player_id, left(coalesce(nullif(btrim(p_name),''),'ผู้เล่น'), 32), now())
  on conflict (player_id) do update set name = excluded.name, last_seen = now();
  perform 1 from public.cafe_shop where id = 'main' for update;
  if not (select open from public.cafe_shop where id = 'main') then
    update public.cafe_shop set open = true, day = day + 1, opened_at = now(), closed_at = null, updated_at = now() where id = 'main';
    perform public.cafe_gen(30);
  end if;
  return public.cafe_state(p_player_id);
end;
$$;

create or replace function public.cafe_close(p_player_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.cafe_assert(p_player_id);
  perform public.cafe_do_close(now());
  return public.cafe_state(p_player_id);
end;
$$;

-- ซื้อของ/อัปเกรด (ตอนร้านปิดเท่านั้น จะได้ไม่เปลี่ยนเมนูกลางวัน)
create or replace function public.cafe_buy(p_player_id text, p_item text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.cafe_shop%rowtype;
  it public.cafe_items%rowtype;
  v_cost integer;
  v_lvl integer;
begin
  perform public.cafe_assert(p_player_id);
  select * into s from public.cafe_shop where id = 'main' for update;
  select * into it from public.cafe_items where id = p_item;
  if not found then raise exception 'ไม่มีของชิ้นนี้'; end if;
  if s.open then raise exception 'ปิดร้านก่อนแล้วค่อยซื้อของ'; end if;
  if it.cat = 'upgrade' then
    v_lvl := public.cafe_lvl(s.upgrades, it.id);
    if v_lvl >= 3 then raise exception 'อัปเกรดเต็มแล้ว'; end if;
    v_cost := it.costs[v_lvl + 1];
  else
    if it.cost = 0 or it.id = any(s.unlocked) then raise exception 'มีอยู่แล้ว'; end if;
    v_cost := it.cost;
  end if;
  if s.coins < v_cost then raise exception 'แต้มไม่พอ (ขาดอีก %)', v_cost - s.coins; end if;
  update public.cafe_shop set coins = coins - v_cost,
    unlocked = case when it.cat = 'upgrade' then unlocked else unlocked || it.id end,
    upgrades = case when it.cat = 'upgrade' then upgrades || jsonb_build_object(it.id, v_lvl + 1) else upgrades end,
    updated_at = now() where id = 'main';
  return public.cafe_state(p_player_id);
end;
$$;

-- เสิร์ฟ: p_drink = {"base":"thai","ice":1,"blend":1,"items":{"sugar":2,"pearl":1}}, p_blend_q = ความแม่นตอนปั่น 0–100
create or replace function public.cafe_serve(p_player_id text, p_name text, p_day integer, p_idx integer, p_drink jsonb, p_blend_q integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.cafe_shop%rowtype;
  c public.cafe_customers%rowtype;
  o jsonb; d jsonb;
  v_build numeric; v_top numeric; v_blend numeric; v_score integer;
  v_mo integer; v_md integer; v_mm integer; v_to integer; v_td integer; v_tm integer;
  v_coins integer; v_tip integer := 0; v_fast boolean;
begin
  perform public.cafe_assert(p_player_id);
  select * into s from public.cafe_shop where id = 'main';
  if not s.open or s.day <> p_day then return jsonb_build_object('ok', false, 'message', 'ร้านปิดแล้ว', 'state', public.cafe_state(p_player_id)); end if;
  select * into c from public.cafe_customers where day = p_day and idx = p_idx for update;
  if not found then return jsonb_build_object('ok', false, 'message', 'ไม่พบลูกค้าคนนี้'); end if;
  if c.served_at is not null then return jsonb_build_object('ok', false, 'message', coalesce(c.served_name, 'เพื่อน') || ' เสิร์ฟคนนี้ไปแล้ว', 'state', public.cafe_state(p_player_id)); end if;
  if c.arrive_at > now() + interval '2 seconds' then return jsonb_build_object('ok', false, 'message', 'ลูกค้ายังไม่มา'); end if;
  if c.leave_at < now() - interval '2 seconds' then return jsonb_build_object('ok', false, 'message', 'ลูกค้ากลับไปแล้ว 😢', 'state', public.cafe_state(p_player_id)); end if;

  o := c.ord; d := coalesce(p_drink, '{}'::jsonb);
  -- จำนวนหน่วยที่ตรงกัน แยก mix กับ top: matched = sum(min(สั่ง, ใส่)), เต็ม = max(sum สั่ง, sum ใส่)
  select coalesce(sum(coalesce((o->'items'->>k)::integer, 0)) filter (where it.cat = 'mix'), 0),
         coalesce(sum(least(3, greatest(0, coalesce((d->'items'->>k)::integer, 0)))) filter (where it.cat = 'mix'), 0),
         coalesce(sum(least(coalesce((o->'items'->>k)::integer, 0), least(3, greatest(0, coalesce((d->'items'->>k)::integer, 0))))) filter (where it.cat = 'mix'), 0),
         coalesce(sum(coalesce((o->'items'->>k)::integer, 0)) filter (where it.cat = 'top'), 0),
         coalesce(sum(least(3, greatest(0, coalesce((d->'items'->>k)::integer, 0)))) filter (where it.cat = 'top'), 0),
         coalesce(sum(least(coalesce((o->'items'->>k)::integer, 0), least(3, greatest(0, coalesce((d->'items'->>k)::integer, 0))))) filter (where it.cat = 'top'), 0)
    into v_mo, v_md, v_mm, v_to, v_td, v_tm
  from (select jsonb_object_keys(coalesce(o->'items','{}'::jsonb)) k union select jsonb_object_keys(case when jsonb_typeof(d->'items') = 'object' then d->'items' else '{}'::jsonb end)) keys
  join public.cafe_items it on it.id = keys.k;

  v_build := (case when d->>'base' = o->>'base' then 55 else 0 end)
           + (case when coalesce((d->>'ice')::integer, 0) = (o->>'ice')::integer then 15 else 0 end)
           + 30 * (case when greatest(v_mo, v_md) = 0 then 1 else v_mm::numeric / greatest(v_mo, v_md) end);
  v_top := 100 * (case when greatest(v_to, v_td) = 0 then 1 else v_tm::numeric / greatest(v_to, v_td) end);
  v_blend := case when (o->>'blend')::integer = 1 then
      case when coalesce((d->>'blend')::integer, 0) = 1 then least(100, greatest(0, coalesce(p_blend_q, 0))) else 0 end
    else case when coalesce((d->>'blend')::integer, 0) = 1 then 0 else 100 end end;
  v_score := round(v_build * 0.55 + v_top * 0.30 + v_blend * 0.15);

  v_fast := now() < c.arrive_at + (c.leave_at - c.arrive_at) / 2;
  v_coins := case when v_score < 50 then 0 else round(c.price * v_score / 100.0) end;   -- ผิดเกินครึ่ง ลูกค้าไม่จ่าย
  if v_score >= 80 and v_fast then v_tip := round(c.price * (0.2 + 0.1 * public.cafe_lvl(s.upgrades, 'jar'))); end if;
  if v_score = 100 then v_tip := v_tip + 5; end if;

  update public.cafe_customers set served_by = p_player_id, served_name = left(coalesce(nullif(btrim(p_name),''),'ผู้เล่น'), 32),
    served_at = now(), score = v_score, coins = v_coins + v_tip where day = p_day and idx = p_idx;
  update public.cafe_shop set coins = coins + v_coins + v_tip, total_served = total_served + 1, updated_at = now() where id = 'main';
  update public.cafe_workers set last_seen = now() where player_id = p_player_id;
  return jsonb_build_object('ok', true, 'score', v_score, 'build', round(v_build), 'top', round(v_top), 'blend', round(v_blend),
    'coins', v_coins, 'tip', v_tip, 'state', public.cafe_state(p_player_id));
end;
$$;

-- สิทธิ์: ตัวช่วยภายในห้ามเรียกจากเว็บ, RPC เปิดให้ anon
do $$
declare f text;
begin
  foreach f in array array['cafe_lvl(jsonb,text)','cafe_gen(integer)','cafe_do_close(timestamptz)','cafe_auto_close()','cafe_state(text)','cafe_assert(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['cafe_get_state(text,text,boolean)','cafe_open(text,text)','cafe_close(text)','cafe_buy(text,text)','cafe_serve(text,text,integer,integer,jsonb,integer)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
