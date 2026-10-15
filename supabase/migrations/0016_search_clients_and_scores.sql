-- Penyetelan pencarian setelah dipakai dengan data asli (Gemini).
--
-- Masalah yang terukur di produksi: kemiripan kosinus antar-dokumen di indeks ini rata-rata 0,73 (sd 0,04),
-- dan sebagian dokumen adalah "hub" (rata-rata kemiripannya ke dokumen lain 0,62–0,77). Hub itu dekat ke
-- query APA PUN: mencari "edot" atau ketikan acak menampilkan entri yang sama ("1.6 Urutan Setup
-- Implementasi", "9.1 Master Data AP", …). Ambang skor absolut tidak bisa memisahkan ini.
--
-- Perbaikan:
-- 1. `hub` = rata-rata kemiripan sebuah dokumen ke dokumen lain (dihitung ulang oleh search_refresh_hub()
--    di akhir reindex). search_semantic_v2 mengurangi hub dari skor ("adjusted"), lalu mengembalikan rata-rata
--    dan simpangan baku skor tersesuaikan SELURUH baris untuk query itu; aplikasi menilai tiap hasil
--    sebagai z-score dan hanya menerima yang benar-benar mencolok.
-- 2. Jenis hasil baru 'client' (klien dan partner). Mereka masuk indeks TANPA vektor (nama klien tidak
--    dikirim ke penyedia embedding) dan ditemukan lewat kata persis, jadi mencari "Edot" langsung
--    menampilkan partner Edot.
--
-- Tidak mengubah data selain kolom baru `hub` (kosong sampai reindex). Tipe kembalian search_semantic berubah,
-- yang di Postgres butuh DROP; `drop function` itu menggantung berulang lewat jalur penerapan ke produksi, jadi
-- fungsi baru dibuat dengan nama lain (search_semantic_v2) dan yang lama dibiarkan tanpa dipakai. Izin execute
-- diatur di bawah. Aman dijalankan berulang.

alter table public.search_index drop constraint if exists search_index_source_type_check;
alter table public.search_index
  add constraint search_index_source_type_check
  check (source_type in ('kb_entry', 'project', 'issue', 'goal', 'client'));

alter table public.search_index add column if not exists hub double precision;

-- Hitung ulang `hub` semua baris ber-vektor milik pemilik yang sama. Skala data pribadi (ratusan baris):
-- n² kemiripan, sepersekian detik. Mengembalikan jumlah baris yang diperbarui.
create or replace function public.search_refresh_hub()
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  with h as (
    select a.id, avg(1 - (a.embedding operator(extensions.<=>) b.embedding)) as hub
    from public.search_index a
    join public.search_index b on b.user_id = a.user_id and b.id <> a.id and b.embedding is not null
    where a.embedding is not null
    group by a.id
  ),
  u as (
    update public.search_index s set hub = h.hub from h where s.id = h.id returning 1
  )
  select count(*)::integer from u;
$$;

create or replace function public.search_semantic_v2(
  query_embedding extensions.vector(1536),
  match_count integer default 15
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  title text,
  content_excerpt text,
  url_path text,
  similarity double precision,
  adjusted double precision,
  mean_adj double precision,
  sd_adj double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with scored as (
    select s.id, s.source_type, s.source_id, s.title, s.content_excerpt, s.url_path, s.hub,
           (1 - (s.embedding operator(extensions.<=>) query_embedding))::double precision as sim
    from public.search_index s
    where s.embedding is not null
  ),
  adj as (
    -- Baris tanpa hub (belum di-refresh) dianggap hub rata-rata, jadi tidak diuntungkan/dirugikan.
    select scored.*, scored.sim - coalesce(scored.hub, avg(scored.hub) over (), 0) as a
    from scored
  )
  select id, source_type, source_id, title, content_excerpt, url_path, sim, a,
         avg(a) over ()::double precision,
         stddev_samp(a) over ()::double precision
  from adj
  order by a desc
  limit least(greatest(match_count, 1), 50);
$$;

revoke execute on function public.search_refresh_hub() from public, anon;
grant execute on function public.search_refresh_hub() to authenticated;
revoke execute on function public.search_semantic_v2(extensions.vector, integer) from public, anon;
grant execute on function public.search_semantic_v2(extensions.vector, integer) to authenticated;

-- search_semantic (versi lama, tanpa koreksi hub) tidak lagi dipakai aplikasi. Boleh dihapus kapan saja dengan:
--   drop function public.search_semantic(extensions.vector, integer);
