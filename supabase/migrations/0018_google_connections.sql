-- Google Calendar: satu baris per pengguna berisi refresh token Google (TERENKRIPSI di aplikasi, AES-256-GCM).
--
-- Tabel ini sengaja TIDAK bisa diakses dari browser: RLS aktif TANPA policy apa pun, dan hak tabel dicabut dari
-- anon/authenticated. Hanya kode server dengan service role (yang melewati RLS) yang membaca/menulisnya. Dengan
-- begitu token tidak bisa dibaca lewat API publik Supabase walau JWT pengguna bocor.
-- Isi acara kalender TIDAK disimpan di database; diambil langsung dari Google saat halaman dibuka.
--
-- Hanya menambah satu tabel. Aman dijalankan berulang.

create table if not exists public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_enc text not null,
  scope text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;
revoke all on table public.google_connections from anon, authenticated;

drop trigger if exists google_connections_set_updated_at on public.google_connections;
create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function public.set_updated_at();
