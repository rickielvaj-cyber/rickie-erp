-- Embedding boleh kosong: konten yang sengaja TIDAK dikirim ke penyedia embedding (Issue, yang memuat
-- nama klien) tetap masuk indeks dan bisa dicari lewat kata persis (search_keyword), tapi tidak punya vektor.
--
-- * search_index.embedding: lepas NOT NULL (baris lama tidak berubah).
-- * search_semantic: hanya baris ber-embedding. Tanpa filter ini baris tanpa vektor ikut muncul di
--   urutan terakhir dengan kemiripan kosong.
--
-- Hanya melonggarkan satu kolom dan mengganti satu fungsi (CREATE OR REPLACE mempertahankan izin
-- execute yang sudah diatur di 0014). Aman dijalankan berulang.

alter table public.search_index alter column embedding drop not null;

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
  where s.embedding is not null
  order by s.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50);
$$;
