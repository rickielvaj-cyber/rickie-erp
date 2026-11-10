-- Performa RLS: lima policy pemilik memanggil auth.uid() langsung, sehingga Postgres mengevaluasinya ULANG untuk setiap baris (peringatan linter
-- Supabase "auth_rls_initplan"). Membungkusnya sebagai (select auth.uid()) membuatnya dievaluasi sekali per kueri. ARTINYA TIDAK BERUBAH: baris
-- tetap hanya bisa dibaca/ditulis pemiliknya (user_id = pengguna login); peran (authenticated) dan perintah (ALL) tetap. Hanya cara penulisan.
-- Memakai ALTER POLICY (tanpa DROP; policy tidak pernah hilang sesaat). Setiap pernyataan berdiri sendiri dan aman diulang.

alter policy "Owner manages todos" on public.todos
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Owner manages goals" on public.goals
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Owner manages issue_log" on public.issue_log
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own kb" on public.kb_entries
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- goal_items: with check juga memastikan goal induknya milik pengguna yang sama (tidak diubah, hanya dibungkus).
alter policy "Owner manages goal_items" on public.goal_items
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.goals g where g.id = goal_items.goal_id and g.user_id = (select auth.uid()))
  );
