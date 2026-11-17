-- «План работы» — схема Supabase
-- Выполнить целиком в Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

-- ───────── Профили ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  invite_code text unique not null default upper(substr(encode(gen_random_bytes(6),'hex'),1,6)),
  partner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Создаём профиль при регистрации
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Взаимная связь: оба профиля указывают друг на друга
create or replace function public.is_partner(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles a join profiles b on a.partner_id = b.id
    where a.id = auth.uid() and b.id = other and b.partner_id = a.id
  );
$$;

create or replace function public.can_access(owner uuid) returns boolean
language sql stable as $$ select owner = auth.uid() or public.is_partner(owner); $$;

-- Привязка по коду приглашения
create or replace function public.link_partner(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select id into other from profiles where invite_code = upper(trim(code));
  if other is null then raise exception 'Код не найден'; end if;
  if other = me then raise exception 'Это ваш собственный код'; end if;
  if exists (select 1 from profiles where id in (me, other) and partner_id is not null and partner_id <> me and partner_id <> other) then
    raise exception 'Один из аккаунтов уже связан с другим человеком';
  end if;
  update profiles set partner_id = other where id = me;
  update profiles set partner_id = me where id = other;
  return other;
end $$;

create or replace function public.unlink_partner() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid;
begin
  select partner_id into other from profiles where id = me;
  update profiles set partner_id = null where id = me;
  if other is not null then update profiles set partner_id = null where id = other and partner_id = me; end if;
end $$;

alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (id = auth.uid() or public.is_partner(id));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid());
-- partner_id и invite_code меняются только через функции выше
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- ───────── Задачи ─────────
create table if not exists public.tasks (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  shared boolean not null default false,
  assignee_id uuid references public.profiles(id) on delete set null,  -- для общих: null = вместе
  title text not null,
  date date,                    -- null = «Позже»
  time text,                    -- 'HH:MM' или null
  done boolean not null default false,
  done_at timestamptz,
  done_dates text[] not null default '{}',  -- для повторяющихся
  repeat text,                  -- null | 'daily' | 'weekly' | 'days:1,3,5' (1=Пн)
  goal_id uuid,
  position double precision not null default 0,
  deleted boolean not null default false,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_owner_idx on public.tasks(owner_id);

create table if not exists public.goals (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  progress int not null default 0 check (progress between 0 and 100),
  position double precision not null default 0,
  deleted boolean not null default false,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  position double precision not null default 0,
  deleted boolean not null default false,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Автор изменения всегда берётся с сервера, клиенту не доверяем
create or replace function public.stamp_row() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := coalesce(new.created_at, now());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.owner_id := old.owner_id; -- владельца плана сменить нельзя
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['tasks','goals','ideas'] loop
    execute format('drop trigger if exists stamp on public.%I', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.stamp_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "access" on public.%I', t);
    execute format('create policy "access" on public.%I for all using (public.can_access(owner_id)) with check (public.can_access(owner_id))', t);
  end loop;
end $$;

-- ───────── История и уведомления ─────────
create table if not exists public.activity (
  id bigserial primary key,
  plan_owner uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,      -- added | completed | uncompleted | edited | deleted | moved
  title text not null,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.activity enable row level security;
drop policy if exists "activity read" on public.activity;
create policy "activity read" on public.activity for select using (public.can_access(plan_owner));

create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,        -- added | completed | edited | moved | deleted
  title text not null,
  date date,
  time text,
  shared boolean not null default false,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "notif own" on public.notifications;
create policy "notif own" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notif update" on public.notifications;
create policy "notif update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.log_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  act text;
  partner uuid;
  target uuid;
begin
  if actor is null then return new; end if;
  if tg_op = 'INSERT' then act := 'added';
  elsif new.deleted and not old.deleted then act := 'deleted';
  elsif new.done and not old.done then act := 'completed';
  elsif not new.done and old.done then act := 'uncompleted';
  elsif coalesce(cardinality(new.done_dates),0) > coalesce(cardinality(old.done_dates),0) then act := 'completed';
  elsif new.date is distinct from old.date or new.time is distinct from old.time then act := 'moved';
  elsif new.title is distinct from old.title or new.repeat is distinct from old.repeat or new.assignee_id is distinct from old.assignee_id then act := 'edited';
  else return new; -- перестановка порядка и т.п. — не логируем
  end if;

  insert into activity(plan_owner, actor_id, action, title, shared)
  values (new.owner_id, actor, act, new.title, new.shared);

  -- Кому сообщить
  select partner_id into partner from profiles where id = actor;
  if new.shared then target := partner;            -- общие дела: партнёру
  elsif new.owner_id <> actor then target := new.owner_id;  -- правка чужого плана: владельцу
  elsif act = 'completed' and new.created_by is not null and new.created_by <> actor then target := new.created_by; -- выполнили задачу, которую ты добавил
  else target := null;
  end if;

  if target is not null and act <> 'uncompleted' then
    insert into notifications(user_id, actor_id, kind, title, date, time, shared)
    values (target, actor, act, new.title, new.date, new.time, new.shared);
  end if;
  return new;
end $$;
drop trigger if exists log_change on public.tasks;
create trigger log_change after insert or update on public.tasks
  for each row execute function public.log_task_change();

-- ───────── Web Push подписки ─────────
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────── Realtime ─────────
do $$ declare t text; begin
  foreach t in array array['tasks','goals','ideas','notifications','activity','profiles'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
