-- Lampiran (screenshot, PDF, Excel, ...) untuk Issue, entri Knowledge Base, dan Catatan.
-- File disimpan di Supabase Storage (bucket privat `attachments`, jalur `<user_id>/<uuid>.<ext>`); tabel ini menyimpan metadata dan
-- induknya. Satu lampiran tepat satu induk; induk dihapus -> baris lampiran ikut terhapus (cascade), file di Storage dibersihkan
-- oleh aplikasi saat induk dihapus dari situs. File TIDAK pernah dikirim ke Gemini dan tidak ikut pencarian.
-- RLS: hanya pemilik. Diterapkan per bagian. Tabel, indeks, dan bucket aman diulang; policy dibuat tanpa DROP (dijalankan sekali).

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  issue_id uuid references public.issue_log (id) on delete cascade,
  kb_entry_id uuid references public.kb_entries (id) on delete cascade,
  note_id uuid references public.notes (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  check (num_nonnulls(issue_id, kb_entry_id, note_id) = 1)
);

create index if not exists attachments_issue_idx on public.attachments (issue_id) where issue_id is not null;
create index if not exists attachments_kb_entry_idx on public.attachments (kb_entry_id) where kb_entry_id is not null;
create index if not exists attachments_note_idx on public.attachments (note_id) where note_id is not null;
create index if not exists attachments_user_idx on public.attachments (user_id);

alter table public.attachments enable row level security;

create policy "Owner manages attachments"
  on public.attachments
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Bucket privat: 10 MB per file, hanya jenis file yang diizinkan (SVG sengaja tidak termasuk: bisa memuat skrip).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'
  ]
)
on conflict (id) do nothing;

-- Storage: pengguna login hanya boleh menyentuh file di folder bernama id-nya sendiri.
create policy "Owner reads own attachment files"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owner uploads own attachment files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owner deletes own attachment files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
