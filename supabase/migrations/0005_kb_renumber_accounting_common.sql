-- Urutan bab KB direvisi: Accounting Common pindah tepat setelah Master Data.
--
--   Bab 8 Accounting Common    -> Bab 4
--   Bab 4 Purchasing           -> Bab 5
--   Bab 5 Sales                -> Bab 6
--   Bab 6 Inventory Management -> Bab 7
--   Bab 7 Inventory Accounting -> Bab 8
--   (Bab 1-3 dan 9-16 tetap)
--
-- Label bab & urutan alur belajar ada di kode (lib/kb/modules.ts,
-- lib/kb/sequence.ts); migration ini menyesuaikan nomor di judul entri ("8.1 ..." -> "4.1 ...")
-- dan rujukan "Bab N" di konten. Slug modul nggak berubah.
--
-- Idempoten: tiap modul cuma menggeser judul yang masih pakai nomor LAMA
-- modul itu, jadi aman dijalankan ulang atau setelah import konten
-- (scripts/import-kb-content.ts sudah menulis judul dengan nomor baru).

update public.kb_entries
set title = regexp_replace(title, '^8\.', '4.')
where module = 'accounting-common' and title ~ '^8\.';

update public.kb_entries
set title = regexp_replace(title, '^4\.', '5.')
where module = 'purchasing' and title ~ '^4\.';

update public.kb_entries
set title = regexp_replace(title, '^5\.', '6.')
where module = 'sales' and title ~ '^5\.';

update public.kb_entries
set title = regexp_replace(title, '^6\.', '7.')
where module = 'inventory' and title ~ '^6\.';

update public.kb_entries
set title = regexp_replace(title, '^7\.', '8.')
where module = 'inventory-accounting' and title ~ '^7\.';

-- Rujukan bab di dalam konten (hasil import Word, masih nomor lama).
-- Sengaja frasa lengkap per tempat, bukan regex "Bab N" global:
--  - "Bab 15 bagian 4.1", "Bab 9 bagian 9.11", dll. harus tetap;
--  - penggantian nggak boleh berantai (Bab 4 -> 5 -> 6);
--  - idempoten: frasa lama sudah hilang setelah dijalankan sekali.
-- Daftar ini hasil scan semua kb_entries per 2026-10-04 (16 tempat).

update public.kb_entries set content = replace(content,
  '(Detail pemakaiannya di Bab 7.)', '(Detail pemakaiannya di Bab 8.)')
where module = 'accounting-common' and strpos(content, '(Detail pemakaiannya di Bab 7.)') > 0;

update public.kb_entries set content = replace(content,
  'Auxiliary Accounting Item penting (Bab 8)', 'Auxiliary Accounting Item penting (Bab 4)')
where module = 'ap' and strpos(content, 'Auxiliary Accounting Item penting (Bab 8)') > 0;

update public.kb_entries set content = replace(content,
  '(lihat Aging Scheme di Bab 8)', '(lihat Aging Scheme di Bab 4)')
where module = 'ap' and strpos(content, '(lihat Aging Scheme di Bab 8)') > 0;

update public.kb_entries set content = replace(content,
  'payment plan di PO (lihat Bab 4)', 'payment plan di PO (lihat Bab 5)')
where module = 'ap' and strpos(content, 'payment plan di PO (lihat Bab 4)') > 0;

update public.kb_entries set content = replace(content,
  'dibahas juga di Bab 4 (Fixed Asset Purchasing)', 'dibahas juga di Bab 5 (Fixed Asset Purchasing)')
where module = 'fixed-assets' and strpos(content, 'dibahas juga di Bab 4 (Fixed Asset Purchasing)') > 0;

update public.kb_entries set content = replace(content,
  'Account Cross-Reference (dijelaskan di Bab 8)', 'Account Cross-Reference (dijelaskan di Bab 4)')
where module = 'fondasi-erp' and strpos(content, 'Account Cross-Reference (dijelaskan di Bab 8)') > 0;

update public.kb_entries set content = replace(content,
  'objek-objek di Bab 8 harus sudah ada', 'objek-objek di Bab 4 harus sudah ada')
where module = 'gl' and strpos(content, 'objek-objek di Bab 8 harus sudah ada') > 0;

update public.kb_entries set content = replace(content,
  'Cash Flow Item dan Cash Flow Type (Bab 8)', 'Cash Flow Item dan Cash Flow Type (Bab 4)')
where module = 'gl' and strpos(content, 'Cash Flow Item dan Cash Flow Type (Bab 8)') > 0;

update public.kb_entries set content = replace(content,
  'Sisi nilai ada di Bab 7.', 'Sisi nilai ada di Bab 8.')
where module = 'inventory' and strpos(content, 'Sisi nilai ada di Bab 7.') > 0;

update public.kb_entries set content = replace(content,
  'Semua yang dibahas di Bab 6 mengubah', 'Semua yang dibahas di Bab 7 mengubah')
where module = 'inventory-accounting' and strpos(content, 'Semua yang dibahas di Bab 6 mengubah') > 0;

update public.kb_entries set content = replace(content,
  '(Konsep lengkapnya dibahas di Bab 8.)', '(Konsep lengkapnya dibahas di Bab 4.)')
where module = 'inventory-accounting' and strpos(content, '(Konsep lengkapnya dibahas di Bab 8.)') > 0;

update public.kb_entries set content = replace(content,
  'Opening Inventory fisik yang dibahas di Bab 6.', 'Opening Inventory fisik yang dibahas di Bab 7.')
where module = 'inventory-accounting' and strpos(content, 'Opening Inventory fisik yang dibahas di Bab 6.') > 0;

-- Peta Modul: tabel cloud -> bab.
update public.kb_entries set content = replace(content,
  'Inventory Management | Bab 4–6 |', 'Inventory Management | Bab 5–7 |')
where module = 'pengantar' and strpos(content, 'Inventory Management | Bab 4–6 |') > 0;

update public.kb_entries set content = replace(content,
  'Financial Report | Bab 7–12, 14 |', 'Financial Report | Bab 4, 8–12, 14 |')
where module = 'pengantar' and strpos(content, 'Financial Report | Bab 7–12, 14 |') > 0;

update public.kb_entries set content = replace(content,
  'keenam objek di atas ada di Bab 8.', 'keenam objek di atas ada di Bab 4.')
where module = 'studi-kasus' and strpos(content, 'keenam objek di atas ada di Bab 8.') > 0;

-- 4.3 merujuk dirinya sendiri.
update public.kb_entries set content = replace(content,
  'bagian 4.3 di atas', 'bagian 5.3 di atas')
where module = 'purchasing' and strpos(content, 'bagian 4.3 di atas') > 0;
