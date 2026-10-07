# Personal Workspace — ERP Implementation Consultant

Workspace pribadi (single-user) buat ERP Implementation Consultant (YonSuite/Yonyou).

- **Fase 1**: **To-Do List**, **Issue Log**, **Ringkasan Mingguan**.
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

## Struktur

```
app/page.tsx              Home publik (hero + kartu fitur; angka ringkas cuma kalau sudah login)
app/login/                halaman login (Supabase Auth, email/password)
components/TopNav.tsx     menu atas sticky (di root layout, ada di semua halaman)
app/(dashboard)/          penjaga login untuk halaman-halaman privat di bawahnya
app/(dashboard)/todos/    modul To-Do List
app/(dashboard)/issues/   modul Issue Log
app/(dashboard)/summary/  modul Ringkasan Mingguan
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
