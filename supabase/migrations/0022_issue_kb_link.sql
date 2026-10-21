-- Issue -> Knowledge Base: simpan entri KB yang dibuat dari sebuah issue, supaya tombol "Add to KB" tidak
-- membuat duplikat dan issue bisa menunjuk balik ke entrinya. Nullable; hapus entri KB = tautan hilang (issue tetap).
-- Tidak mengubah RLS: kolom ini mengikuti policy issue_log yang sudah ada.

alter table public.issue_log
  add column if not exists kb_entry_id uuid references public.kb_entries (id) on delete set null;
