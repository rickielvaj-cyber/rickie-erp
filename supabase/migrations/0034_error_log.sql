-- Log galat milik situs sendiri (log runtime Vercel paket gratis hanya menyimpan 1 jam). Satu baris per GALAT YANG SAMA (`fingerprint` unik:
-- sumber + rute + jenis + isi pesan yang sudah dinormalkan); galat berulang hanya menaikkan `occurrences` dan `last_seen`, bukan menumpuk baris.
-- Yang disimpan hanya rute (pola, tanpa query dan id), jenis dan pesan galat (sudah disamarkan: token, email, deretan karakter panjang, query URL),
-- jejak tumpukan (dipotong), digest Next.js, dan versi rilis. TIDAK ada isi request, header, cookie, atau data pengguna.
-- RLS menyala TANPA policy (sengaja, seperti google_connections): hanya kode server dengan service role yang bisa menulis dan membaca,
-- tidak ada akses dari browser. Penulisan lewat fungsi `log_error` (upsert + pembersihan otomatis: > 30 hari dan di atas 500 baris dibuang).
-- Diterapkan per bagian; tiap bagian aman diulang. Tanpa DROP. Sebelum migrasi ini diterapkan aplikasi tetap jalan (pencatatan diam).

create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (char_length(fingerprint) <= 300),
  source text not null check (source in ('server', 'client')),
  route text not null default '' check (char_length(route) <= 300),
  method text not null default '' check (char_length(method) <= 12),
  name text not null default '' check (char_length(name) <= 120),
  message text not null default '' check (char_length(message) <= 1200),
  stack text not null default '' check (char_length(stack) <= 4200),
  digest text check (digest is null or char_length(digest) <= 80),
  release text not null default '' check (char_length(release) <= 40),
  occurrences integer not null default 1 check (occurrences >= 1),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists error_log_last_seen_idx on public.error_log (last_seen desc);

alter table public.error_log enable row level security;

create or replace function public.log_error(
  p_fingerprint text,
  p_source text,
  p_route text,
  p_method text,
  p_name text,
  p_message text,
  p_stack text,
  p_digest text,
  p_release text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.error_log (fingerprint, source, route, method, name, message, stack, digest, release)
  values (
    left(p_fingerprint, 300), p_source, left(coalesce(p_route, ''), 300), left(coalesce(p_method, ''), 12), left(coalesce(p_name, ''), 120),
    left(coalesce(p_message, ''), 1200), left(coalesce(p_stack, ''), 4200), left(p_digest, 80), left(coalesce(p_release, ''), 40)
  )
  on conflict (fingerprint) do update set
    occurrences = public.error_log.occurrences + 1,
    last_seen = now(),
    message = excluded.message,
    stack = excluded.stack,
    digest = excluded.digest,
    release = excluded.release;

  -- Pembersihan ringan (kira-kira tiap 10 pencatatan): buang yang lebih dari 30 hari, dan simpan paling banyak 500 baris terbaru.
  if random() < 0.1 then
    delete from public.error_log where last_seen < now() - interval '30 days';
    delete from public.error_log where id in (select id from public.error_log order by last_seen desc offset 500);
  end if;
end;
$$;

-- Hanya service role yang boleh memanggilnya (bukan anon, bukan pengguna login).
revoke all on function public.log_error(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.log_error(text, text, text, text, text, text, text, text, text) to service_role;
