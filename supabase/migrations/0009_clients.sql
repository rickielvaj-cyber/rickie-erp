-- Master Klien + kolom penautan di Issue Log.
--
-- Tujuan: nama klien di website harus SAMA PERSIS dengan kolom Customer Name di Sheet1
-- (sheet YS_Issue_Tracker, milik Willy), karena KPI per klien di sheet dihitung dari teks.
-- Jadi klien dipilih dari daftar ini, bukan diketik bebas. `canonical_name` = ejaan persis
-- di Sheet1; `aliases` = ejaan lain yang pernah dipakai (dipakai untuk mencocokkan data lama
-- dan impor), BUKAN untuk ditampilkan atau disalin ke sheet.
--
-- Migrasi ini hanya MENAMBAH: tabel baru, kolom nullable baru, dan backfill. Tidak ada
-- kolom/data lama yang diubah atau dihapus (issue_log.client_name tetap ada dan tetap
-- diisi dengan nama kanonik supaya Ringkasan Mingguan dan Export CSV tidak berubah).

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  aliases text[] not null default '{}',
  -- true = ejaan ini sudah dicek sama dengan Sheet1. Klien baru yang ditambah dari website
  -- mulai dengan false sampai Rickie memastikan namanya.
  verified_in_sheet boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Nama kanonik unik per pemilik, tanpa membedakan huruf besar/kecil.
create unique index if not exists clients_user_name_key on public.clients (user_id, lower(canonical_name));
create index if not exists clients_user_id_idx on public.clients (user_id);

alter table public.clients enable row level security;

drop policy if exists "Owner manages clients" on public.clients;
create policy "Owner manages clients"
  on public.clients
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Tautan dari issue ke klien. on delete set null: menghapus klien tidak menghapus issue
-- (client_name tetap menyimpan teksnya).
alter table public.issue_log
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists copied_to_sheet_at timestamptz;

create index if not exists issue_log_client_id_idx on public.issue_log (client_id);

-- Isi awal: 22 klien dari Sheet1 (daftar yang diberikan Rickie, 2026-10-11). Situs ini
-- single-user, jadi dimiliki akun pertama. Kalau belum ada akun, bagian ini dilewati.
do $$
declare
  owner_id uuid := (select id from auth.users order by created_at limit 1);
begin
  if owner_id is null then
    return;
  end if;

  insert into public.clients (user_id, canonical_name, aliases, verified_in_sheet)
  select owner_id, v.name, v.aliases, true
  from (values
    ('PT SEMARAK BERSAMA INDONESIA', '{}'::text[]),
    ('PT ZHISHENG TRADING PACIFIC - MIXUE', '{}'),
    ('PT SHUANGLIN PIPE INDONESIA', '{}'),
    ('PT MCC15', '{}'),
    ('PT PRIMA DHARMA KARSA', '{}'),
    ('PT WANXINDA INDONESIA', '{WanXinDa}'),
    ('PT FEED WELL INDONESIA', '{}'),
    ('CV MAJU BERSAMA', '{}'),
    ('PT TCC INDONESIA', '{}'),
    ('PT BUMI MINERAL SULAWESI', '{}'),
    ('PT SHUANGFEI ELECTRIC INDONESIA', '{"Shuangfei Electric"}'),
    ('PT CNCEC', '{}'),
    ('PT CITEC ENGINEERING INDONESIA', '{}'),
    ('PT FEIHE INDONESIA', '{}'),
    ('PT SELARAS DONLIM', '{}'),
    ('PT INDOSAFETY SENTOSA INDUSTRY', '{}'),
    ('PT ENERGY TIANJIN', '{}'),
    ('PT SLNC', '{"PT Sulawesi Nickel Cobalt (SLNC)"}'),
    ('CV SEJAHTERA ABADI', '{}'),
    ('PT STANLI TRIJAYA MANDIRI', '{}'),
    ('ROEMAH KOFFIE INDONESIA', '{}'),
    ('DUA KELINCI', '{}')
  ) as v(name, aliases)
  on conflict (user_id, lower(canonical_name)) do nothing;
end
$$;

-- Backfill issue lama: cocokkan client_name (tanpa beda huruf/spasi) ke nama kanonik atau alias.
-- Hanya baris yang cocok dan belum tertaut yang disentuh; yang tidak cocok dibiarkan apa adanya.
update public.issue_log il
set client_id = c.id,
    client_name = c.canonical_name
from public.clients c
where il.client_id is null
  and il.user_id = c.user_id
  and il.client_name is not null
  and (
    lower(btrim(il.client_name)) = lower(c.canonical_name)
    or exists (
      select 1 from unnest(c.aliases) as a where lower(btrim(a)) = lower(btrim(il.client_name))
    )
  );
