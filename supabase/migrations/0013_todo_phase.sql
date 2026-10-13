-- To-do bisa ditautkan ke satu fase proyek (mis. "Data migration" pada Project Nagiya), selain ke proyeknya.
--
-- Hanya menambah satu kolom nullable; tidak ada data atau kolom lama yang diubah. Menghapus fase
-- tidak menghapus to-do (hanya terlepas dari fase, tetap tertaut ke proyek). Aman dijalankan berulang.
--
-- RLS tidak berubah: todos sudah dibatasi per pemilik. Aplikasi memastikan fase yang dipilih
-- memang milik proyek yang dipilih.

alter table public.todos
  add column if not exists phase_id uuid references public.project_phases (id) on delete set null;

create index if not exists todos_phase_id_idx on public.todos (phase_id);
