-- Notes cepat (ala Notes iPhone): satu kolom isi; judul = baris pertama yang tidak kosong (dihitung aplikasi saat simpan).
-- Opsional tertaut ke satu klien (mis. catatan meeting). Catatan ikut pencarian terpadu lewat KATA PERSIS saja: tidak di-embed
-- dan tidak dikirim ke Gemini (isinya sering memuat nama klien). RLS: hanya pemilik.
-- Diterapkan per bagian; tiap bagian aman diulang.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default '',
  body text not null default '' check (char_length(body) <= 100000),
  client_id uuid references public.clients (id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_list_idx on public.notes (user_id, pinned desc, updated_at desc);
create index if not exists notes_client_id_idx on public.notes (client_id);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "Owner manages notes" on public.notes;
create policy "Owner manages notes"
  on public.notes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Jenis hasil pencarian baru: 'note'.
alter table public.search_index drop constraint if exists search_index_source_type_check;
alter table public.search_index
  add constraint search_index_source_type_check
  check (source_type in ('kb_entry', 'project', 'issue', 'goal', 'client', 'note'));
