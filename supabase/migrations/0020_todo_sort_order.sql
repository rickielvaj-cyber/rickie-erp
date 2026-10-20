-- To-do mingguan bisa diseret: urutan dalam satu hari disimpan di `todos.sort_order`.
--
-- Nullable: to-do lama dan to-do baru tanpa urutan tampil setelah yang sudah diurutkan (NULLS LAST), lalu menurut waktu
-- dibuat, jadi tampilan yang ada tidak berubah sampai Anda mulai menyeret. Saat menyeret, aplikasi menomori ulang
-- (1, 2, 3, ...) to-do pada hari tujuan. Hanya menambah satu kolom; RLS tidak berubah. Aman diulang.

alter table public.todos add column if not exists sort_order integer;
