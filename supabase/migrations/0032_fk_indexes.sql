-- Merapikan peringatan advisor Supabase "unindexed_foreign_keys" (level INFO): empat kolom foreign key belum punya index.
-- Hanya MENAMBAH index (tanpa DROP, tanpa menyentuh data); `if not exists` membuatnya aman diulang. Manfaat: join/pencarian lewat kolom ini
-- dan pemeriksaan foreign key saat baris induk dihapus tidak perlu memindai seluruh tabel (juga membantu filter RLS `user_id`).
-- Tabelnya kecil (ratusan baris), jadi pembuatan indeks selesai seketika dan kuncinya singkat.

create index if not exists issue_log_kb_entry_id_idx on public.issue_log (kb_entry_id);
create index if not exists kb_entries_user_id_idx on public.kb_entries (user_id);
create index if not exists project_partners_user_id_idx on public.project_partners (user_id);
create index if not exists project_phases_user_id_idx on public.project_phases (user_id);
