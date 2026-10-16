-- Fase 4: konten panjang dipecah jadi beberapa potongan (chunk) di indeks pencarian.
--
-- Sebelumnya satu konten = satu baris = 1.500 karakter pertama, jadi isi entri KB yang panjang tidak
-- ikut dicari. Sekarang satu konten bisa punya beberapa baris dengan (source_type, source_id) yang sama dan
-- `chunk_index` berbeda (0 = potongan pertama). Hasil pencarian tetap satu per konten: kedua fungsi
-- pencarian hanya mengembalikan potongan terbaik tiap konten.
--
-- Baris yang sudah ada otomatis jadi chunk 0 (default 0) dan hash-nya tetap cocok untuk konten yang muat
-- dalam satu potongan, jadi tidak perlu embed ulang. Tidak ada data yang dihapus.
-- Tidak mengubah RLS (policy "Owner manages search_index" tetap) dan tidak mengubah tabel sumber.
--
-- Diterapkan per bagian (tiap bagian aman diulang). Urutan: kolom -> unique baru -> unique lama dihapus -> fungsi.

alter table public.search_index add column if not exists chunk_index integer not null default 0;

-- Unique baru dibuat dulu supaya upsert (on conflict user_id,source_type,source_id,chunk_index) selalu punya target.
alter table public.search_index
  add constraint search_index_user_source_chunk_key unique (user_id, source_type, source_id, chunk_index);

alter table public.search_index drop constraint if exists search_index_user_id_source_type_source_id_key;

-- Hub = rata-rata kemiripan ke konten LAIN. Potongan dari konten yang sama sangat mirip satu sama lain,
-- jadi tidak boleh ikut dihitung (kalau ikut, konten panjang tampak seperti hub).
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
    join public.search_index b
      on b.user_id = a.user_id
     and not (b.source_type = a.source_type and b.source_id = a.source_id)
     and b.embedding is not null
    where a.embedding is not null
    group by a.id
  ),
  u as (
    update public.search_index s set hub = h.hub from h where s.id = h.id returning 1
  )
  select count(*)::integer from u;
$$;

-- Sama seperti sebelumnya, tetapi satu hasil per konten (potongan dengan skor tersesuaikan tertinggi).
-- Rata-rata dan simpangan baku tetap dihitung dari SEMUA baris ber-vektor (dasar z-score tidak berubah arti).
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
    select scored.*, scored.sim - coalesce(scored.hub, avg(scored.hub) over (), 0) as a
    from scored
  ),
  stats as (
    select avg(a)::double precision as m, stddev_samp(a)::double precision as sd from adj
  ),
  best as (
    select distinct on (adj.source_type, adj.source_id) adj.*
    from adj
    order by adj.source_type, adj.source_id, adj.a desc
  )
  select b.id, b.source_type, b.source_id, b.title, b.content_excerpt, b.url_path, b.sim, b.a, st.m, st.sd
  from best b cross join stats st
  order by b.a desc
  limit least(greatest(match_count, 1), 50);
$$;

-- Satu hasil per konten (potongan dengan skor tertinggi). Pencocokan substring (ILIKE) menangkap kode
-- error, nama klien, dan teks Mandarin; full-text 'simple' tidak memecah kata Mandarin (satu rangkaian
-- karakter = satu token), jadi ILIKE yang menjadi andalan untuk itu. Query dengan beberapa kata (dipisah
-- spasi) juga cocok bila SEMUA kata ada di judul/isi, tidak harus bersebelahan ("报销 发票").
create or replace function public.search_keyword(
  search_text text,
  match_count integer default 15
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  title text,
  content_excerpt text,
  url_path text,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      websearch_to_tsquery('simple', search_text) as tsq,
      '%' || replace(replace(replace(search_text, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
      array(
        select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        from unnest(regexp_split_to_array(btrim(search_text), '\s+')) as t
        where t <> ''
      ) as pats
  ),
  hits as (
    select s.id, s.source_type, s.source_id, s.title, s.content_excerpt, s.url_path,
           (
             (case when s.title ilike q.pat then 2.0 else 0.0 end)
             + (case when s.content_excerpt ilike q.pat then 1.0 else 0.0 end)
             + (case when cardinality(q.pats) > 1 and allterms then 0.5 else 0.0 end)
             + ts_rank(to_tsvector('simple', s.title || ' ' || s.content_excerpt), q.tsq)
           )::double precision as score
    from public.search_index s
    cross join q
    cross join lateral (
      select cardinality(q.pats) > 0
             and not exists (select 1 from unnest(q.pats) as p where not ((s.title || ' ' || s.content_excerpt) ilike p)) as allterms
    ) as t
    where s.title ilike q.pat
       or s.content_excerpt ilike q.pat
       or (cardinality(q.pats) > 1 and t.allterms)
       or to_tsvector('simple', s.title || ' ' || s.content_excerpt) @@ q.tsq
  ),
  best as (
    select distinct on (hits.source_type, hits.source_id) hits.*
    from hits
    order by hits.source_type, hits.source_id, hits.score desc
  )
  select b.id, b.source_type, b.source_id, b.title, b.content_excerpt, b.url_path, b.score
  from best b
  order by b.score desc
  limit least(greatest(match_count, 1), 50);
$$;

-- create or replace mempertahankan izin execute yang sudah ada; diulang di sini supaya migrasi ini lengkap.
revoke execute on function public.search_refresh_hub() from public, anon;
grant execute on function public.search_refresh_hub() to authenticated;
revoke execute on function public.search_semantic_v2(extensions.vector, integer) from public, anon;
grant execute on function public.search_semantic_v2(extensions.vector, integer) to authenticated;
revoke execute on function public.search_keyword(text, integer) from public, anon;
grant execute on function public.search_keyword(text, integer) to authenticated;
