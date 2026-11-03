-- Pomodoro: satu baris per sesi fokus yang SELESAI (timer yang sedang berjalan hanya ada di browser). Poin = 10 per sesi selesai
-- (kolom points menyimpan nilai saat dicatat, supaya mengubah aturan nanti tidak mengubah riwayat). Unik per (pengguna, started_at)
-- supaya sesi yang sama tidak tercatat dua kali bila dua tab/perangkat membukanya. RLS: hanya pemilik.
-- Diterapkan per bagian; tiap bagian aman diulang kecuali policy (dibuat tanpa DROP, jalankan sekali).

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  started_at timestamptz not null,
  minutes integer not null check (minutes between 5 and 120),
  label text not null default '' check (char_length(label) <= 80),
  points integer not null default 10 check (points between 0 and 1000),
  created_at timestamptz not null default now(),
  unique (user_id, started_at)
);

create index if not exists focus_sessions_user_started_idx on public.focus_sessions (user_id, started_at desc);

alter table public.focus_sessions enable row level security;

create policy "Owner manages focus sessions"
  on public.focus_sessions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
