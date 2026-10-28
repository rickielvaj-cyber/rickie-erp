-- AI notes: penanda per catatan "jangan pernah kirim ke AI". Server menolak mengirim catatan yang ditandai, apa pun yang diminta
-- browser. Hanya menambah satu kolom; data lain tidak berubah. Aman diulang.

alter table public.notes add column if not exists ai_blocked boolean not null default false;
