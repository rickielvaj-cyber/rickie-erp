-- Legenda warna blok kalender: arti yang diberikan pengguna pada tiap warna (mis. merah = "Urgent"), supaya laptop dan HP memakai legenda
-- yang sama. Hanya NAMA yang disimpan (warnanya sendiri tersimpan di Google Calendar). Satu baris per pengguna; `names` adalah objek
-- JSON { "<colorId 1..11>": "<nama pendek>" }. RLS pemilik. Diterapkan per bagian; tiap bagian aman diulang kecuali policy
-- (dibuat tanpa DROP, jalankan sekali). Sebelum tabel ini ada, aplikasi tetap jalan memakai legenda lokal di browser.

create table if not exists public.color_legend (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  names jsonb not null default '{}'::jsonb check (jsonb_typeof(names) = 'object' and char_length(names::text) <= 1500),
  updated_at timestamptz not null default now()
);

alter table public.color_legend enable row level security;

create policy "Owner manages color legend"
  on public.color_legend
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
