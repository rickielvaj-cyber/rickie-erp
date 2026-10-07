# Personal Workspace — ERP Implementation Consultant

Workspace pribadi (single-user) buat ERP Implementation Consultant (YonSuite/Yonyou).

- **Fase 1**: **To-Do List**, **Goals**, **Issue Log**, **Ringkasan Mingguan**, **Export**.
- **Fase 2**: **Knowledge Base** — 18 modul (lihat `lib/kb/modules.ts`), tiap modul bisa
  berisi banyak entri, full-text search, edit inline.

Knowledge Base lama (situs statis) dipindahkan ke [`legacy-kb/`](./legacy-kb) — arsip,
sudah diganti sama modul KB di Fase 2.

## Tech Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + Auth) sebagai backend
- Hosting target: Vercel

## Setup

### 1. Bikin project Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Di **Settings → API**, catat **Project URL** dan **anon public key**.
3. Di **Authentication → Providers**, pastikan Email provider aktif, lalu buat 1 user
   (email/password) lewat **Authentication → Users → Add user** — app ini single-user,
   jadi cukup satu akun.

### 2. Environment variables

Copy `.env.local.example` jadi `.env.local`, isi dengan kredensial dari langkah 1:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

`SUPABASE_SERVICE_ROLE_KEY` dan `SEED_USER_ID` di file yang sama cuma dipakai buat
seed script di langkah 4 — isi nanti pas butuh, bukan sekarang.

### 3. Jalankan migration

Migration ada di `supabase/migrations/`, urut sesuai nomornya (`0001` → `0005`).
Jalankan lewat **SQL Editor** di Supabase Dashboard (copy-paste isi tiap file berurutan),
atau via [Supabase CLI](https://supabase.com/docs/guides/cli) kalau sudah link project:

```bash
supabase db push
```

- `0001_init.sql` — tabel `todos` + `issue_log`, RLS.
- `0002_todos_updated_at_index.sql` — index tambahan.
- `0003_kb_entries.sql` — tabel `kb_entries` (versi awal, 16 modul, satu entri per modul).
- `0004_kb_entries_multi_entry.sql` — revisi ke 18 modul, banyak entri per modul (desain
  final).
- `0005_kb_renumber_accounting_common.sql` — Accounting Common jadi Bab 4 (setelah Master
  Data); Purchasing–Inventory Accounting bergeser jadi Bab 5–8. Nomor di judul entri ikut. Kalau baru setup dari nol, tetap jalankan `0003` dulu baru `0004` — `0004`
  cuma ALTER di atas tabel yang dibuat `0003`, bukan pengganti berdiri sendiri.
- `0006_user_id_and_owner_rls.sql` — **Fase 1**: `todos` & `issue_log` dapat `user_id`; RLS jadi
  `auth.uid() = user_id` (sebelumnya "siapa pun yang login"). Baris lama otomatis dimiliki akun
  Anda **asal `auth.users` berisi tepat 1 akun**; kalau tidak, migrasi berhenti dengan pesan jelas
  dan tidak mengubah apa pun. Kode aplikasi tidak perlu diubah (user_id default `auth.uid()`).
- `0007_goals.sql` — tabel `goals` + `goal_items` (checklist), RLS per pemilik.
- `0008_todos_goal_issue_fields.sql` — `todos.goal_id` + `completed_at` (terisi otomatis lewat
  trigger), `issue_log.module` + `root_cause`, dan kategori issue dibatasi 10 pilihan (hanya untuk
  data baru; kategori lama tidak diubah).

Jalankan `0006` → `0007` → `0008` berurutan, masing-masing aman diulang. **Backup dulu** (Supabase
Dashboard → Database → Backups) sebelum menjalankan `0006`, karena itu yang menyentuh data lama.

### 3b. Matikan sign-up publik (wajib)

App ini single-user, jadi tidak boleh ada orang lain yang bisa mendaftar. Ini setelan Supabase,
bukan kode: **Authentication → Sign In / Providers (atau Settings) → matikan "Allow new users to
sign up"** (di beberapa versi dashboard namanya "Disable sign-ups"). Akun Anda sendiri tetap bisa
login.

### 3c. Verifikasi RLS

Setelah migrasi, pastikan tanpa login tidak ada data yang bisa dibaca:

```bash
bash scripts/verify-rls.sh
```

Semua baris harus `OK` (atau `SKIP` kalau tabelnya belum ada). `BOCOR` berarti policy RLS belum
benar. Skrip hanya membaca, tidak menulis apa pun.

### 4. Seed Knowledge Base (opsional, sekali jalan)

Isi awal KB di-seed dari file JSON lokal, bukan lewat UI — lihat `data/README.md` buat
format filenya. Setelah `data/kb_seed_phase2.json` ada dan `.env.local` punya
`SUPABASE_SERVICE_ROLE_KEY` + `SEED_USER_ID` terisi:

```bash
npx tsx scripts/seed-kb.ts
```

Jalankan ini **lokal aja**, jangan pernah di Vercel/CI — `service_role` key bypass RLS,
jangan sampai ke-commit atau ke-set sebagai env var publik.

### 5. Install dependencies & jalankan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) — akan redirect ke `/login`.

## Fitur Fase 1

- **To-Do** (`/todos`): panel Hari ini + pelacak mingguan. Tiap tugas bisa dikaitkan ke satu
  **Goal** (dropdown di form, filter Goal). Tugas **Terlewat** punya tombol "Pindah ke hari ini".
  Hapus memakai toast **Urungkan** (6 detik). Mencentang tugas **tidak** mengubah Goal.
- **Goals** (`/goals`): target jangka panjang dengan checklist. Item punya grup (`group_name`
  jadi judul), catatan, dan urutan (↑↓ dalam grup). Progres = item selesai / total. Goal
  **diselesaikan manual** lewat checkbox, tidak otomatis dari item atau to-do, dan tidak muncul
  di daftar to-do harian.
- **Issue Log** (`/issues`): tanggal (default hari ini), klien, modul, kategori (10 pilihan di
  `lib/issues.ts`), deskripsi, akar masalah, resolusi. Klien & modul = teks bebas dengan
  autocomplete dari nilai yang pernah dipakai. Filter klien/modul/kategori/bulan, plus hitungan
  per bulan, kategori, dan klien (mengikuti filter) sebagai dasar KPI bulanan.
- **Ringkasan Mingguan** (`/summary`): pilih minggu (Senin–Jumat). Menghasilkan "Summary of This
  Week" (tugas selesai per Goal + issue per klien) dan "Next Week Plan" (tugas belum selesai,
  termasuk yang terlewat, sampai Jumat minggu depan). Kedua kolom bisa diedit lalu disalin ke
  YonWork. Hasil edit tidak disimpan.
- **Export**: menu akun (avatar) → "Export semua data (JSON)" dan "Export issue log (CSV)";
  halaman Issue Log punya tombol Export CSV yang mengikuti filter. CSV memakai BOM UTF-8 dan
  menetralkan sel yang diawali `= + - @` (dengan awalan `'`) supaya tidak jadi rumus di Excel/Sheets.
- **Zona waktu**: semua logika tanggal/minggu memakai Asia/Jakarta (`lib/date.ts`). Waktu selesai
  (`completed_at`) diisi trigger database, bukan kode aplikasi.

## Deploy ke Vercel

1. Import repo ini di Vercel (Framework: Next.js, Root Directory: root repo).
2. **Settings → Environment Variables** (Production dan Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Jangan** pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` / `SEED_USER_ID` di Vercel.
4. Migrasi database dijalankan di Supabase (Setup #3), bukan oleh Vercel.
5. Cek setelah deploy: login, buka `/todos`, `/goals`, `/issues`, `/summary`, dan unduh Export.

## Struktur

```
app/page.tsx              Home publik (hero + kartu fitur; angka ringkas cuma kalau sudah login)
app/login/                halaman login (Supabase Auth, email/password)
components/TopNav.tsx     menu atas sticky (di root layout, ada di semua halaman)
app/(dashboard)/          penjaga login untuk halaman-halaman privat di bawahnya
app/(dashboard)/todos/    modul To-Do List (panel Hari ini + pelacak mingguan, terhubung ke Goals)
app/(dashboard)/goals/    modul Goals: daftar + detail checklist (grup, urutan, centang)
app/(dashboard)/issues/   modul Issue Log
app/(dashboard)/summary/  modul Ringkasan Mingguan (format YonWork, bisa diedit + Copy)
app/api/export/           Export: JSON semua data (/api/export), CSV issue log (/api/export/issues)
lib/summary.ts            template teks ringkasan (murni, tanpa AI)
lib/export.ts             ambil semua baris (batas 1000/permintaan) + builder CSV aman
lib/issues.ts             daftar 10 kategori issue + hitung per kelompok
app/(dashboard)/knowledge-base/  modul Knowledge Base (flow diagram + grid bab, satu halaman per bab + edit)
app/api/knowledge-base/          API routes KB (list/get/update entri, search-index)
lib/supabase/             Supabase client (browser, server, middleware)
lib/kb/modules.ts         daftar 18 modul KB (slug + label)
lib/kb/sequence.ts        urutan baca (Mulai di sini, langkah + bab paralel, referensi)
lib/kb/chapter.ts         satu-satunya jalur render konten KB (dipakai halaman bab & indeks search)
lib/kb/search-index.ts    indeks search di browser (MiniSearch), lazy, di-reset tiap simpan
lib/kb/highlight.ts       highlight frasa hasil search di halaman bab
supabase/migrations/      SQL migration
scripts/seed-kb.ts        seed data awal KB, jalan lokal aja (lihat Setup #4)
scripts/verify-rls.sh     cek baca-saja: tanpa login tidak ada data yang terbaca (Setup #3c)
data/                     taruh kb_seed_phase2.json di sini (gitignored)
legacy-kb/                arsip situs KB lama, sudah diganti modul KB di atas
```

## Desain

Gaya hitam-putih ala Apple: menu atas sticky, konten di tengah, banyak ruang kosong.
Warna aksen (tombol utama, nav aktif) = CSS variable `--accent` (hitam) di
`app/globals.css`. Merah (`--danger`) cuma buat pesan error dan aksi hapus.

Home (`/`) satu-satunya halaman yang bisa dibuka tanpa login (lihat `PUBLIC_EXACT_PATHS` di
`lib/supabase/middleware.ts`); Home nggak memuat data apa pun kalau belum login.

To-Do (`/todos`): panel "Hari ini" + pelacak mingguan 7 kolom (Senin–Minggu). Minggu dipilih
lewat `?week=YYYY-MM-DD`; tugas ditempatkan ke hari lewat kolom `due_date` yang sudah ada
(nggak perlu migration). "Hari ini" dihitung di zona Asia/Jakarta (`lib/date.ts`).

## Performa

- **Wilayah fungsi Vercel = Singapura (`sin1`)**, lihat `vercel.json`, sekawasan dengan database
  Supabase (`ap-southeast-1`). Kalau database pindah wilayah, ubah juga `regions` di sana.
- **Login dicek lokal**: `getAuthUser()` (`lib/supabase/auth.ts`) memakai `getClaims()` yang
  memverifikasi JWT tanpa panggilan jaringan (proyek memakai kunci asimetris ES256) dan dipakai
  bersama per permintaan. Jangan kembali ke `auth.getUser()` di jalur render — itu satu
  bolak-balik jaringan per panggilan. Akses data tetap dijaga RLS lewat JWT yang sama.
- Hasil render bab KB di-cache di memori server per bab (`lib/kb/data.ts`), kedaluwarsa otomatis
  saat entri disimpan (trigger `updated_at`).
- `npm run dev` lambat di klik pertama karena kompilasi per halaman; ukur kecepatan dengan
  `npm run build && npm start`.

## Yang belum ada

Project tracking client, time block, AI meeting notes, AI work report generator, notes
cepat, pomodoro timer, dan integrasi Notion/Google — semua masuk fase-fase berikutnya.
