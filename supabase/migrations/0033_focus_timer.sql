-- Timer fokus yang sedang BERJALAN dibagi antar perangkat: satu baris per pengguna berisi status timernya (fokus atau istirahat), supaya mulai di
-- laptop terlihat di HP dan sebaliknya. Hanya timer yang berjalan; sesi yang SELESAI tetap di tabel focus_sessions (0028). Baris dihapus saat timer
-- dihentikan atau selesai. `state` = objek JSON { phase, startedAt, endsAt, minutes, label? } (waktu dalam milidetik epoch); bentuk dan batasnya
-- divalidasi di server aplikasi, di sini hanya dijaga berupa objek kecil. RLS pemilik. Diterapkan per bagian; tiap bagian aman diulang kecuali
-- policy (dibuat tanpa DROP, jalankan sekali). Sebelum tabel ini ada, aplikasi tetap jalan: timer hanya di browser seperti sebelumnya.

create table if not exists public.focus_timer (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  state jsonb not null check (jsonb_typeof(state) = 'object' and char_length(state::text) <= 600),
  updated_at timestamptz not null default now()
);

alter table public.focus_timer enable row level security;

create policy "Owner manages focus timer"
  on public.focus_timer
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
