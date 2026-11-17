-- «План работы» v1.2: подпункты, ссылки, видео, настройки приложения.
-- Можно выполнять повторно — ничего не сломается.

-- 1. Гибкое поле для подпунктов, ссылок, вложений и будущих функций
alter table public.tasks add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.goals add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.ideas add column if not exists extra jsonb not null default '{}'::jsonb;

-- 2. Уведомление, когда партнёр прикрепил видео/фото
create or replace function public.log_task_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  act text;
  partner uuid;
  target uuid;
  old_files int := 0;
  new_files int := 0;
begin
  if actor is null then return new; end if;
  new_files := coalesce(jsonb_array_length(case when jsonb_typeof(new.extra->'files') = 'array' then new.extra->'files' end), 0);
  if tg_op = 'INSERT' then act := 'added';
  else
    old_files := coalesce(jsonb_array_length(case when jsonb_typeof(old.extra->'files') = 'array' then old.extra->'files' end), 0);
    if new.deleted and not old.deleted then act := 'deleted';
    elsif new.done and not old.done then act := 'completed';
    elsif not new.done and old.done then act := 'uncompleted';
    elsif coalesce(cardinality(new.done_dates),0) > coalesce(cardinality(old.done_dates),0) then act := 'completed';
    elsif new_files > old_files then act := 'attached';
    elsif new.date is distinct from old.date or new.time is distinct from old.time then act := 'moved';
    elsif new.title is distinct from old.title or new.repeat is distinct from old.repeat or new.assignee_id is distinct from old.assignee_id then act := 'edited';
    else return new; -- порядок, подпункты, ссылки — без уведомлений
    end if;
  end if;

  insert into activity(plan_owner, actor_id, action, title, shared)
  values (new.owner_id, actor, act, new.title, new.shared);

  select partner_id into partner from profiles where id = actor;
  if new.shared then target := partner;
  elsif new.owner_id <> actor then target := new.owner_id;
  elsif act = 'completed' and new.created_by is not null and new.created_by <> actor then target := new.created_by;
  else target := null;
  end if;

  if target is not null and act <> 'uncompleted' then
    insert into notifications(user_id, actor_id, kind, title, date, time, shared)
    values (target, actor, act, new.title, new.date, new.time, new.shared);
  end if;
  return new;
end $$;

-- 3. Хранилище видео и фото (приватное: доступ только владельцу плана и партнёру)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create or replace function public.can_access_path(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  begin owner := split_part(p, '/', 1)::uuid; exception when others then return false; end;
  return public.can_access(owner);
end $$;

drop policy if exists "attachments read" on storage.objects;
create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_access_path(name));
drop policy if exists "attachments insert" on storage.objects;
create policy "attachments insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_access_path(name));
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_access_path(name));

-- 4. Настройки приложения (адрес обновлений и т.п.) — меняются без пересборки
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;
drop policy if exists "config read" on public.app_config;
create policy "config read" on public.app_config for select to authenticated using (true);

-- 5. Версия схемы — приложение по ней понимает, что миграция выполнена
insert into public.app_config(key, value) values ('schema_version', '2')
on conflict (key) do update set value = excluded.value;
