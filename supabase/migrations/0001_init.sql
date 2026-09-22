-- Fase 1 (MVP): todos + issue_log
-- Single-user app: RLS just requires an authenticated session, no per-row ownership column.

create extension if not exists pgcrypto;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.issue_log (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_name text,
  category text,
  description text not null,
  resolution text,
  date_resolved date,
  created_at timestamptz not null default now()
);

create index if not exists todos_status_idx on public.todos (status);
create index if not exists todos_due_date_idx on public.todos (due_date);
create index if not exists issue_log_date_resolved_idx on public.issue_log (date_resolved);
create index if not exists issue_log_client_name_idx on public.issue_log (client_name);
create index if not exists issue_log_category_idx on public.issue_log (category);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

alter table public.todos enable row level security;
alter table public.issue_log enable row level security;

-- Single-user app: any authenticated request is the one owner, so a blanket
-- "authenticated" policy is enough — no per-row user_id ownership check needed.
drop policy if exists "Authenticated users can manage todos" on public.todos;
create policy "Authenticated users can manage todos"
  on public.todos
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can manage issue_log" on public.issue_log;
create policy "Authenticated users can manage issue_log"
  on public.issue_log
  for all
  to authenticated
  using (true)
  with check (true);
