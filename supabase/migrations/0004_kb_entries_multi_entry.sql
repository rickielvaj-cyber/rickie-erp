-- Fase 2 revisi: kb_entries jadi many-entries-per-module (bukan satu per
-- modul), dan daftar modul berubah dari 16 slug ke 18 slug yang baru.
--
-- Constraint lama (unique(user_id, module) dan CHECK 16 slug) dibuat tanpa
-- nama eksplisit di 0003, jadi Postgres kasih nama otomatis yang nggak bisa
-- dipastikan dari sini tanpa akses live ke project — makanya di-drop lewat
-- lookup ke pg_constraint (apa pun namanya), bukan nama yang di-assume.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.kb_entries'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.kb_entries drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.kb_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%module%'
  loop
    execute format('alter table public.kb_entries drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.kb_entries
  add constraint kb_entries_module_check check (module in (
    'pengantar', 'fondasi-erp', 'digital-modeling', 'master-data',
    'purchasing', 'sales', 'inventory', 'inventory-accounting',
    'accounting-common', 'ap', 'ar', 'gl',
    'fixed-assets', 'expense-service', 'enterprise-report',
    'troubleshooting', 'studi-kasus', 'lampiran'
  ));

-- kb_search(): same reasoning as 0003 — websearch_to_tsquery instead of the
-- literal to_tsquery from the brief, since to_tsquery throws on ordinary
-- multi-word search input (expects lexeme operators, not free text). Kept
-- as a Postgres function (RPC) rather than inline SQL in the API route,
-- since that's the only way for supabase-js to run ts_headline/ts_rank in
-- one round trip. Functionally unchanged from 0003; recreated here for
-- clarity since the module list it searches over has changed.
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
  where e.user_id = auth.uid()
    and e.search_vector @@ websearch_to_tsquery('indonesian', search_query)
  order by rank desc
  limit 30;
$$;
