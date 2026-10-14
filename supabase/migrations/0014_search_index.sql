-- Fase 4: indeks pencarian semantik (pgvector) untuk semua jenis konten.
--
-- `search_index` menyimpan satu baris per konten (entri KB, proyek, issue, goal): judul, potongan
-- teks, vektor embedding, dan path halaman tujuan. Tabel sumber TIDAK diubah; indeks hanya dibaca
-- dari mereka oleh script/route reindex (lib/search/reindex.ts).
--
-- Menyimpang sedikit dari rancangan awal, dengan alasan:
-- * `user_id` + RLS per pemilik, sama seperti semua tabel lain. Tanpa itu judul dan potongan isi
--   issue klien bisa dibaca lewat API publik Supabase.
-- * `content_hash`: reindex hanya meng-embed konten yang berubah (dan menghapus baris yatim).
--   Cara ini jalan untuk proyek yang tidak punya `updated_at`, dan tidak butuh mengubah tabel sumber.
--
-- Hanya menambah (ekstensi, satu tabel, dua fungsi). Aman dijalankan berulang.

create extension if not exists vector with schema extensions;

create table if not exists public.search_index (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  source_type text not null check (source_type in ('kb_entry', 'project', 'issue', 'goal')),
  source_id uuid not null,
  title text not null,
  -- Judul + ringkasan isi (dipotong), persis teks yang di-embed.
  content_excerpt text not null default '',
  -- Hash teks yang di-embed (+ nama model): berubah => perlu embed ulang.
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  url_path text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

-- HNSW: tidak butuh data awal untuk "dilatih" (IVFFlat butuh), jadi paling simpel disetup.
create index if not exists search_index_embedding_idx
  on public.search_index using hnsw (embedding extensions.vector_cosine_ops);

drop trigger if exists search_index_set_updated_at on public.search_index;
create trigger search_index_set_updated_at
  before update on public.search_index
  for each row execute function public.set_updated_at();

alter table public.search_index enable row level security;

drop policy if exists "Owner manages search_index" on public.search_index;
create policy "Owner manages search_index"
  on public.search_index
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Pencarian semantik: kemiripan kosinus (1 = identik). security invoker => RLS berlaku.
create or replace function public.search_semantic(
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
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.source_type, s.source_id, s.title, s.content_excerpt, s.url_path,
         (1 - (s.embedding operator(extensions.<=>) query_embedding))::double precision
  from public.search_index s
  order by s.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

-- Pencarian kata kunci: potongan persis (ILIKE, mis. kode akun/nama klien) + full-text 'simple'
-- (tanpa stemming, aman untuk campuran Indonesia/Inggris). Judul bernilai lebih dari isi.
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
      '%' || replace(replace(replace(search_text, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select s.id, s.source_type, s.source_id, s.title, s.content_excerpt, s.url_path,
         (
           (case when s.title ilike q.pat then 2.0 else 0.0 end)
           + (case when s.content_excerpt ilike q.pat then 1.0 else 0.0 end)
           + ts_rank(to_tsvector('simple', s.title || ' ' || s.content_excerpt), q.tsq)
         )::double precision as score
  from public.search_index s, q
  where s.title ilike q.pat
     or s.content_excerpt ilike q.pat
     or to_tsvector('simple', s.title || ' ' || s.content_excerpt) @@ q.tsq
  order by score desc
  limit least(greatest(match_count, 1), 50);
$$;

revoke execute on function public.search_semantic(extensions.vector, integer) from public, anon;
revoke execute on function public.search_keyword(text, integer) from public, anon;
grant execute on function public.search_semantic(extensions.vector, integer) to authenticated;
grant execute on function public.search_keyword(text, integer) to authenticated;
