-- /summary filters todos by status='done' AND updated_at range, but only
-- status had an index — add one for updated_at too.

create index if not exists todos_updated_at_idx on public.todos (updated_at);
