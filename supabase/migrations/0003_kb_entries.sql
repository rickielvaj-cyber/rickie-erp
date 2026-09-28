-- Fase 2: Knowledge Base
--
-- Deviations from the originally sketched schema, called out explicitly:
-- 1. Added a CHECK constraint enumerating the 16 valid module slugs (matches
--    lib/kb/modules.ts) so a typo can't create an orphan, unnavigable module.
-- 2. Added `unique (user_id, module)` — /kb/[module] and /kb/[module]/edit are
--    both singular routes (no entry id, edit is a single textarea), so the
--    app enforces exactly one entry per module. The import step upserts by
--    (user_id, module), merging multiple matched docx sections into one row.
-- 3. Added explicit `with check` on the RLS policy alongside `using` (Postgres
--    reuses `using` for it by default when omitted, but explicit is clearer).
-- 4. Added `kb_search()` RPC: supabase-js can't call `ts_headline`/
--    `websearch_to_tsquery` inline via `.select()`, so full-text search with
--    highlighted snippets is exposed as a Postgres function instead. Uses
--    `websearch_to_tsquery` rather than the literal `to_tsquery` mentioned in
--    the brief — `to_tsquery` throws on ordinary multi-word input (it expects
--    lexeme operators like `foo & bar`, not free text), which would break the
--    search bar on the first real query.

create table if not exists public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  module text not null check (module in (
    'digital-modeling', 'master-data', 'aact-coa', 'purchasing',
    'inventory', 'inventory-accounting', 'sales', 'ap', 'ar', 'fa', 'gl',
    'expense-service', 'enterprise-report', 'issue-log', 'studi-kasus', 'referensi'
  )),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module)
);

alter table public.kb_entries
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('indonesian', title || ' ' || content)) stored;

create index if not exists kb_entries_search_idx on public.kb_entries using gin (search_vector);
create index if not exists kb_entries_module_idx on public.kb_entries (module);

drop trigger if exists kb_entries_set_updated_at on public.kb_entries;
create trigger kb_entries_set_updated_at
  before update on public.kb_entries
  for each row execute function public.set_updated_at();

alter table public.kb_entries enable row level security;

drop policy if exists "Users manage own kb" on public.kb_entries;
create policy "Users manage own kb"
  on public.kb_entries
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage bucket for the raw uploaded .docx files. Private: only the
-- authenticated (single) user can read/write, same posture as the tables.
insert into storage.buckets (id, name, public)
values ('kb-documents', 'kb-documents', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated can manage kb-documents" on storage.objects;
create policy "Authenticated can manage kb-documents"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'kb-documents')
  with check (bucket_id = 'kb-documents');

-- Full-text search with highlighted snippets, ranked by relevance.
create or replace function public.kb_search(search_query text)
returns table (
  id uuid,
  module text,
  title text,
  snippet text,
  rank real,
  updated_at timestamptz
)
language sql
stable
security invoker
as $$
  select
    e.id,
    e.module,
    e.title,
    ts_headline(
      'indonesian',
      e.content,
      websearch_to_tsquery('indonesian', search_query),
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=5, MaxWords=15'
    ) as snippet,
    ts_rank(e.search_vector, websearch_to_tsquery('indonesian', search_query)) as rank,
    e.updated_at
  from public.kb_entries e
  where e.search_vector @@ websearch_to_tsquery('indonesian', search_query)
  order by rank desc
  limit 30;
$$;
