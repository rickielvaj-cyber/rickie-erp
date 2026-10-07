-- Fase 1 tahap 1: kepemilikan baris (user_id) + RLS per-pemilik untuk todos & issue_log.
--
-- Sebelumnya (0001) RLS cuma "siapa pun yang login boleh semuanya". Sekarang tiap baris
-- punya user_id dan policy-nya `auth.uid() = user_id`, sama seperti kb_entries.
--
-- Aman dijalankan ke database yang sudah berisi data:
-- * user_id default auth.uid(), jadi kode aplikasi yang sudah ada (insert tanpa user_id)
--   tetap jalan tanpa perubahan.
-- * Baris lama diisi dengan id akun Anda, tapi HANYA kalau auth.users berisi tepat satu
--   akun (app ini single-user). Kalau tidak, migrasi berhenti dengan pesan jelas dan tidak
--   mengubah apa pun — jangan dipaksa, karena baris tanpa pemilik akan jadi tak terlihat
--   setelah RLS diketatkan.

alter table public.todos
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid();
alter table public.issue_log
  add column if not exists user_id uuid references auth.users (id) on delete cascade default auth.uid();

do $$
declare
  account_count integer;
  owner_id uuid;
  orphan_count integer;
begin
  select count(*) into account_count from auth.users;

  if account_count = 1 then
    select id into owner_id from auth.users;
    update public.todos set user_id = owner_id where user_id is null;
    update public.issue_log set user_id = owner_id where user_id is null;
  end if;

  select
    (select count(*) from public.todos where user_id is null) +
    (select count(*) from public.issue_log where user_id is null)
  into orphan_count;

  if orphan_count > 0 then
    raise exception
      'Migrasi dihentikan: % baris todos/issue_log belum punya user_id dan auth.users berisi % akun (harus tepat 1). Tidak ada perubahan yang disimpan.',
      orphan_count, account_count;
  end if;
end $$;

alter table public.todos alter column user_id set not null;
alter table public.issue_log alter column user_id set not null;

create index if not exists todos_user_id_idx on public.todos (user_id);
create index if not exists issue_log_user_id_idx on public.issue_log (user_id);

-- Ganti policy "semua yang login" dengan policy per-pemilik.
drop policy if exists "Authenticated users can manage todos" on public.todos;
drop policy if exists "Owner manages todos" on public.todos;
create policy "Owner manages todos"
  on public.todos
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can manage issue_log" on public.issue_log;
drop policy if exists "Owner manages issue_log" on public.issue_log;
create policy "Owner manages issue_log"
  on public.issue_log
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
