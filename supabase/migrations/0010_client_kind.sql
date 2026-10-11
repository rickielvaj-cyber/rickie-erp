-- Jenis entri di master klien: 'client' (pelanggan, 22 nama dari Sheet1) atau 'partner'
-- (mitra implementasi/teknologi seperti Weefer, Metrodata, Edot). Di sheet YS_Issue_Tracker
-- keduanya mengisi kolom Client yang sama (mis. baris "Weefer Partner"), jadi tetap satu tabel;
-- kolom `kind` hanya dipakai untuk pengelompokan di website, tidak pernah disalin ke sheet.
--
-- Hanya menambah: satu kolom dengan default 'client' (22 klien yang ada tidak berubah) dan
-- lima partner baru. Ejaan partner di bawah SEMENTARA: ejaan persis di sheet belum
-- dikonfirmasi, jadi semuanya mulai sebagai verified_in_sheet = false (Copy for Sheet akan
-- memberi peringatan). Perbaiki lewat halaman Clients > Edit; ganti nama ikut memperbarui
-- nama di issue terkait.

alter table public.clients
  add column if not exists kind text not null default 'client'
  check (kind in ('client', 'partner'));

do $$
declare
  owner_id uuid := (select id from auth.users order by created_at limit 1);
begin
  if owner_id is null then
    return;
  end if;

  insert into public.clients (user_id, canonical_name, aliases, kind, verified_in_sheet)
  select owner_id, v.name, v.aliases, 'partner', false
  from (values
    ('Eclectic', '{}'::text[]),
    ('Weefer Partner', '{Weefer}'),
    ('WCS', '{}'),
    ('Metrodata', '{}'),
    ('Edot', '{}')
  ) as v(name, aliases)
  on conflict (user_id, lower(canonical_name)) do nothing;

  -- Issue lama yang memakai ejaan "Weefer Partner" / "Weefer" ikut tertaut.
  update public.issue_log il
  set client_id = c.id,
      client_name = c.canonical_name
  from public.clients c
  where il.client_id is null
    and il.user_id = c.user_id
    and il.client_name is not null
    and c.kind = 'partner'
    and (
      lower(btrim(il.client_name)) = lower(c.canonical_name)
      or exists (
        select 1 from unnest(c.aliases) as a where lower(btrim(a)) = lower(btrim(il.client_name))
      )
    );
end
$$;
