-- Hardening: kunci search_path pada 5 fungsi yang ditandai Supabase Security Advisor
-- ("Function Search Path Mutable", lint 0011).
--
-- Tanpa search_path tetap, nama objek di dalam fungsi dicari lewat search_path milik pemanggil,
-- sehingga pemanggil yang bisa membuat objek bernama sama di skema yang lebih dulu dicari
-- dapat membelokkan fungsi. Dengan search_path kosong, hanya objek bawaan (pg_catalog) dan nama
-- yang ditulis lengkap (schema.objek) yang dipakai.
--
-- Aman tanpa mengubah isi fungsi (diperiksa terhadap definisi di produksi, 2026-10-12):
-- * set_updated_at, set_goal_completed_at, set_goal_item_completed_at, set_todo_completed_at
--   hanya memakai now() (pg_catalog) dan NEW/OLD.
-- * kb_search sudah menulis public.kb_entries lengkap dan hanya memakai fungsi bawaan
--   (ts_headline, ts_rank, websearch_to_tsquery) dan konfigurasi bawaan 'indonesian'.
--
-- ALTER FUNCTION hanya mengubah pengaturan fungsi; tidak mengubah isi, pemilik, atau data.
-- Aman dijalankan berulang.

alter function public.set_updated_at() set search_path = '';
alter function public.set_goal_completed_at() set search_path = '';
alter function public.set_goal_item_completed_at() set search_path = '';
alter function public.set_todo_completed_at() set search_path = '';
alter function public.kb_search(text) set search_path = '';
