-- Kalender Google tambahan (hanya baca): ID kalender yang ditempel pengguna (mis. kalender kantor atau proyek) supaya acaranya
-- tampil di grid minggu dan tampilan bulan di samping kalender utama. Situs hanya MEMBACA acara kalender ini dan tidak
-- menulis, menyinkronkan to-do, atau menyimpan acaranya. ID kalender bukan rahasia akses (izin tetap di Google), tetapi
-- tetap RLS pemilik. Maksimal 3 per pengguna dijaga aplikasi. Diterapkan per bagian; tiap bagian aman diulang kecuali policy
-- (dibuat tanpa DROP, jalankan sekali).

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  calendar_id text not null check (char_length(calendar_id) between 3 and 200),
  label text not null default '' check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  unique (user_id, calendar_id)
);

create index if not exists calendar_sources_user_idx on public.calendar_sources (user_id, created_at);

alter table public.calendar_sources enable row level security;

create policy "Owner manages calendar sources"
  on public.calendar_sources
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
