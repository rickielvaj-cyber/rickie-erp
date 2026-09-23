# Personal Workspace — ERP Implementation Consultant (Fase 1: MVP)

<!-- Trigger Vercel preview deployment untuk branch ini. -->

Workspace pribadi (single-user) buat ERP Implementation Consultant (YonSuite/Yonyou).
Fase 1 mencakup 3 modul: **To-Do List**, **Issue Log**, dan **Ringkasan Mingguan**.

Knowledge Base lama (situs statis) dipindahkan ke [`legacy-kb/`](./legacy-kb) —
belum diintegrasikan ke app ini, jadi bahan migrasi Fase 2.

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

### 2. Jalankan migration

File migration ada di `supabase/migrations/0001_init.sql` — bikin tabel `todos` dan
`issue_log` beserta Row Level Security policy (akses dibatasi ke user yang sudah login).

Jalankan lewat **SQL Editor** di Supabase Dashboard (copy-paste isi file), atau via
[Supabase CLI](https://supabase.com/docs/guides/cli) kalau sudah link project:

```bash
supabase db push
```

### 3. Environment variables

Copy `.env.local.example` jadi `.env.local`, isi dengan kredensial dari langkah 1:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4. Install dependencies & jalankan

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) — akan redirect ke `/login`.

## Struktur

```
app/login/                halaman login (Supabase Auth, email/password)
app/(dashboard)/          shell dengan sidebar, halaman-halaman di belakang login
app/(dashboard)/todos/    modul To-Do List
app/(dashboard)/issues/   modul Issue Log
app/(dashboard)/summary/  modul Ringkasan Mingguan
lib/supabase/             Supabase client (browser, server, middleware)
supabase/migrations/      SQL migration
legacy-kb/                arsip situs KB lama (belum dipakai di app ini)
```

## Desain

Warna aksen (heading, tombol utama, nav aktif) pakai CSS variable `--brand-red` di
`app/globals.css` — sekarang masih **placeholder** (`#C8102E`), belum diverifikasi ke
brand guideline Yonyou/用友 resmi. Tinggal ganti nilai variable itu begitu kode warna
yang benar sudah ada.

## Yang belum ada di Fase 1

Knowledge Base, project tracking client, search AI, time block, AI meeting notes, AI
work report generator, notes cepat, pomodoro timer, dan integrasi Notion/Google —
semua masuk fase-fase berikutnya.
