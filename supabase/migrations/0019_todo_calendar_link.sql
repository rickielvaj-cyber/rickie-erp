-- Google Calendar langkah 3b: to-do bisa ditautkan ke satu acara di Google Calendar ("Block time").
--
-- * calendar_event_id: id acara Google (teks). Satu acara hanya boleh tertaut ke satu to-do (indeks unik parsial).
-- * scheduled_start / scheduled_end: jam blok yang terakhir diketahui, supaya baris to-do bisa menampilkan jamnya
--   tanpa memanggil Google setiap kali. Diperbarui saat blok dibuat/digeser dari situs, dan disamakan dengan Google
--   saat bagian Calendar dibuka (to-do mengikuti acaranya; acara yang dihapus di Google melepas tautannya).
--
-- Hanya menambah kolom nullable (to-do lama tidak berubah) dan satu indeks. RLS todos tidak berubah. Aman diulang.

alter table public.todos add column if not exists calendar_event_id text;
alter table public.todos add column if not exists scheduled_start timestamptz;
alter table public.todos add column if not exists scheduled_end timestamptz;

create unique index if not exists todos_calendar_event_unique
  on public.todos (user_id, calendar_event_id)
  where calendar_event_id is not null;
