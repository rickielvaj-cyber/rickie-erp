-- Riwayat Weekly Summary: salinan summary dan plan yang disimpan pengguna per minggu (kunci = hari Senin minggu itu),
-- supaya laporan minggu lalu tidak berubah walau data sumbernya (to-do, issue) kemudian diubah, dan bisa dibuka lagi untuk
-- rekap bulanan atau evaluasi. Hanya teks yang disimpan; tidak diindeks dan tidak dikirim ke Gemini. RLS: hanya pemilik.
-- Diterapkan per bagian. Policy dibuat tanpa DROP (jalankan sekali).

create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  week_start date not null,
  summary_text text not null default '' check (char_length(summary_text) <= 50000),
  plan_text text not null default '' check (char_length(plan_text) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  check (extract(isodow from week_start) = 1)
);

create index if not exists weekly_summaries_user_week_idx on public.weekly_summaries (user_id, week_start desc);

create trigger weekly_summaries_set_updated_at
  before update on public.weekly_summaries
  for each row execute function public.set_updated_at();

alter table public.weekly_summaries enable row level security;

create policy "Owner manages weekly summaries"
  on public.weekly_summaries
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
