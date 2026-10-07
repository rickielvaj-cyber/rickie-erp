-- Fase 1 tahap 1: Goals + checklist item.
--
-- Goal itu entitas terpisah dari to-do harian. Goal diselesaikan MANUAL (status 'done'),
-- tidak otomatis dari item atau to-do.
--
-- Catatan desain:
-- * goal_items juga punya user_id (bukan cuma lewat goals) supaya RLS-nya sederhana dan
--   seragam: setiap tabel dicek `auth.uid() = user_id`. Policy goal_items tambahan
--   memastikan goal induknya milik user yang sama.
-- * position dipakai untuk urutan item (dinaikkan/diturunkan lewat tombol, tanpa library drag).

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  description text,
  type text not null default 'learning' check (type in ('learning', 'work')),
  status text not null default 'active' check (status in ('active', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.goal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  title text not null,
  group_name text,
  note text,
  is_done boolean not null default false,
  position integer not null default 0,
  completed_at timestamptz
);

create index if not exists goals_user_status_idx on public.goals (user_id, status);
create index if not exists goal_items_goal_position_idx on public.goal_items (goal_id, position);
create index if not exists goal_items_user_id_idx on public.goal_items (user_id);

-- completed_at mengikuti status/is_done otomatis, jadi kode aplikasi tak perlu mengurusnya.
create or replace function public.set_goal_completed_at()
returns trigger as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' then
      new.completed_at = coalesce(new.completed_at, now());
    elsif old.status is distinct from 'done' then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists goals_set_completed_at on public.goals;
create trigger goals_set_completed_at
  before insert or update on public.goals
  for each row execute function public.set_goal_completed_at();

create or replace function public.set_goal_item_completed_at()
returns trigger as $$
begin
  if new.is_done then
    if tg_op = 'INSERT' then
      new.completed_at = coalesce(new.completed_at, now());
    elsif old.is_done is distinct from true then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists goal_items_set_completed_at on public.goal_items;
create trigger goal_items_set_completed_at
  before insert or update on public.goal_items
  for each row execute function public.set_goal_item_completed_at();

alter table public.goals enable row level security;
alter table public.goal_items enable row level security;

drop policy if exists "Owner manages goals" on public.goals;
create policy "Owner manages goals"
  on public.goals
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owner manages goal_items" on public.goal_items;
create policy "Owner manages goal_items"
  on public.goal_items
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
      where g.id = goal_id and g.user_id = auth.uid()
    )
  );
