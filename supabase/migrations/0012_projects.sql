-- Fase 3: Project Tracking Klien.
--
-- Satu klien bisa punya proyek; satu proyek punya beberapa fase (Blueprint, Configuration, UAT, ...)
-- dan bisa melibatkan satu atau lebih partner (mis. Edot pada Project Nagiya). To-do dan issue
-- bisa ditautkan ke proyek supaya satu halaman proyek menampilkan semuanya.
--
-- Proyek sengaja TERPISAH dari Goals: Goals = target pribadi dengan checklist; proyek = pekerjaan
-- untuk klien dengan fase, tanggal, dan partner. Goals tidak diubah.
--
-- Hanya menambah: tiga tabel baru dan dua kolom nullable (todos.project_id, issue_log.project_id).
-- Tidak ada data atau kolom lama yang diubah. Aman dijalankan berulang.
--
-- Pola RLS sama dengan goal_items (migrasi 0007): setiap tabel punya user_id dan dicek
-- auth.uid() = user_id; tabel anak juga memastikan induknya milik user yang sama.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- Klien pemilik proyek (jenis 'client'; partner dicatat di project_partners). restrict: klien yang
  -- masih punya proyek tidak boleh terhapus diam-diam (di aplikasi klien memang hanya dinonaktifkan).
  client_id uuid not null references public.clients (id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  status text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done')),
  start_date date,
  target_date date,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  start_date date,
  target_date date,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.project_partners (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  partner_id uuid not null references public.clients (id) on delete restrict,
  primary key (project_id, partner_id)
);

create index if not exists projects_user_status_idx on public.projects (user_id, status);
create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists project_phases_project_position_idx on public.project_phases (project_id, position);
create index if not exists project_partners_partner_idx on public.project_partners (partner_id);

alter table public.projects enable row level security;
alter table public.project_phases enable row level security;
alter table public.project_partners enable row level security;

drop policy if exists "Owner manages projects" on public.projects;
create policy "Owner manages projects"
  on public.projects
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "Owner manages project_phases" on public.project_phases;
create policy "Owner manages project_phases"
  on public.project_phases
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

drop policy if exists "Owner manages project_partners" on public.project_partners;
create policy "Owner manages project_partners"
  on public.project_partners
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
    and exists (select 1 from public.clients c where c.id = partner_id and c.user_id = (select auth.uid()))
  );

-- Tautan opsional dari to-do dan issue ke proyek. Menghapus proyek tidak menghapus to-do/issue.
alter table public.todos
  add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.issue_log
  add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists todos_project_id_idx on public.todos (project_id);
create index if not exists issue_log_project_id_idx on public.issue_log (project_id);
