# Personal Workspace — ERP Implementation Consultant

Workspace pribadi (single-user) buat ERP Implementation Consultant (YonSuite/Yonyou).

- **Fase 1**: **To-Do List**, **Goals**, **Issue Log**, **Ringkasan Mingguan**, **Export**.
- **Fase 3**: **Projects** — proyek per klien dengan fase, partner, dan to-do/issue tertaut
  (`/projects`).
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

Fase 4 (search) menambah satu variabel:

| Variabel | Untuk apa | Di mana |
|---|---|---|
| `GEMINI_API_KEY` | membuat embedding (model `gemini-embedding-001`, dimensi 1536) untuk indeks dan query | Vercel (Production) **dan** `.env.local` |

Cara mendapatkan `GEMINI_API_KEY` (gratis, tanpa kartu kredit): buka
[aistudio.google.com/apikey](https://aistudio.google.com/apikey), login dengan akun Google, **Create API key**,
salin kuncinya. Tanpa kunci ini website tetap jalan, tapi pencarian terpadu **tidak menemukan apa pun**
(indeks hanya terisi lewat reindex yang butuh kunci); pencarian di dalam halaman Knowledge Base tetap berfungsi.

Catatan tier gratis (periksa syarat terbaru di [ai.google.dev/terms](https://ai.google.dev/terms)):
- Google boleh memakai isi yang dikirim untuk memperbaiki produknya dan pengulas manusia boleh membacanya;
  mereka menyarankan tidak mengirim data sensitif. Karena itu **Issue tidak dikirim** (lihat 4b).
- Kunci dari project yang akun penagihan (billing)-nya aktif dihitung sebagai tier berbayar; buat kunci
  dari project tanpa billing bila ingin tetap gratis.
- Kuota gratis kecil: terkonfirmasi dari galat Google, **100 permintaan per menit** dan tiap teks dihitung satu
  (angkanya bisa berubah). Reindex menunggu sendiri sesuai petunjuk Google ("retry in …s") selama masih muat
  dalam batas waktu ±40 detik, dan bila tidak muat ia berhenti dan bisa dilanjutkan; lihat 4b.

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
- `0009_clients.sql` / `0010_client_kind.sql` — master klien dan partner (nama persis seperti
  Sheet1), tautan `issue_log.client_id`, jenis `client`/`partner`.
- `0011_function_search_path.sql` — mengunci `search_path` pada 5 fungsi (Security Advisor).
- `0012_projects.sql` — **Fase 3**: `projects`, `project_phases`, `project_partners`, serta
  `todos.project_id` dan `issue_log.project_id` (nullable). **Jalankan sebelum kode Fase 3 live**:
  form To-Do dan Issue selalu mengirim `project_id`, jadi tanpa kolomnya penyimpanan gagal.
- `0013_todo_phase.sql` — `todos.phase_id` (nullable): to-do bisa ditautkan ke fase proyek. **Jalankan sebelum
  kodenya live**: form To-Do selalu mengirim `phase_id`.
- `0014_search_index.sql` — **Fase 4**: ekstensi `pgvector`, tabel `search_index` (indeks HNSW, RLS per
  pemilik), fungsi `search_semantic` dan `search_keyword`. Tidak mengubah tabel lain.
- `0016_search_clients_and_scores.sql` — jenis hasil `client`, kolom `hub`, fungsi `search_refresh_hub()`, dan
  `search_semantic` yang mengembalikan skor tersesuaikan hub. **Jalankan sebelum kode ini live** (kode memanggil
  fungsi baru dan menulis baris `client`), lalu tekan Reindex Search sekali supaya `hub` terisi.
- `0023_notes.sql` — tabel `notes` (isi, judul turunan, klien opsional, pin; RLS pemilik; trigger `updated_at`; isi maks. 100.000
  karakter) dan jenis hasil pencarian baru `note` pada constraint `search_index`. Tidak mengubah data lain. Aman diulang.
  **Jalankan sebelum kode ini live.**
- `0022_issue_kb_link.sql` — kolom `issue_log.kb_entry_id` (nullable, FK ke `kb_entries`, `on delete set null`) untuk tombol
  "Add to KB" di Issue Log. Tidak mengubah data atau RLS. Aman diulang. **Jalankan sebelum kode ini live.**
- `0021_phase_status_auto.sql` — trigger di `todos` yang menghitung ulang status fase proyek: semua to-do-nya selesai -> Done,
  sebagian selesai atau ada yang In progress -> In progress, fase tanpa to-do tidak disentuh, fase Done yang mendapat
  to-do terbuka -> In progress. Fungsi `security invoker` (RLS berlaku). Tidak mengubah data saat dijalankan (tanpa backfill).
  Aman diulang.
- `0020_todo_sort_order.sql` — kolom `todos.sort_order` (nullable) untuk urutan to-do dalam satu hari hasil seret. Tidak mengubah
  data yang ada; RLS tidak berubah. **Jalankan sebelum kode ini live** (halaman To-Do mengurutkan dengan kolom itu). Aman diulang.
- `0019_todo_calendar_link.sql` — kolom `todos.calendar_event_id`, `scheduled_start`, `scheduled_end` (semua nullable) dan satu indeks
  unik parsial: tautan to-do ke blok Google Calendar ("Block time"). To-do lama tidak berubah; RLS tidak berubah. **Jalankan
  sebelum kode ini live** (kode membaca kolom itu di halaman To-Do). Aman diulang.
- `0018_google_connections.sql` — tabel `google_connections` untuk token Google Calendar (RLS aktif tanpa policy: hanya
  service role). Hanya menambah satu tabel; aman diulang. **Jalankan sebelum memakai Connect Google Calendar.**
- `0017_search_chunks.sql` — **konten panjang dipecah** jadi beberapa potongan di `search_index` (kolom
  `chunk_index`, unique baru, hub tidak menghitung potongan dari konten yang sama), dan kedua fungsi pencarian
  mengembalikan satu hasil per konten. Pencarian kata kunci juga cocok bila semua kata ada (tidak harus
  bersebelahan), jadi berguna untuk teks Mandarin. Baris lama otomatis jadi potongan 0 dan tidak perlu embed ulang
  bila isinya muat satu potongan. **Jalankan sebelum kode ini live**: reindex menulis `chunk_index`. Dijalankan
  per bagian (kolom → unique baru → unique lama dihapus → fungsi); tiap bagian aman diulang kecuali
  `add constraint` (cek dulu bahwa `search_index_user_source_chunk_key` belum ada).
- `0015_search_embedding_optional.sql` — kolom `embedding` boleh kosong (Issue masuk indeks tanpa vektor) dan
  `search_semantic` hanya mengambil baris ber-vektor. **Jalankan sebelum kode Fase 4b live**: reindex menulis
  baris tanpa vektor untuk Issue, dan tanpa migrasi ini penulisannya gagal.

Jalankan `0006` → `0007` → `0008` berurutan, masing-masing aman diulang. **Backup dulu** (free tier tidak punya backup otomatis; lihat
[docs/BACKUP.md](docs/BACKUP.md): jalankan workflow *Backup database* secara manual, atau unduh Export JSON)
sebelum menjalankan `0006`, karena itu yang menyentuh data lama.

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

### 4b. Search semantik (Fase 4)

Kolom pencarian di menu atas (atau tekan `/`) mencari **semua** konten sekaligus: Knowledge Base,
Projects, Issues, dan Goals. Hasil digabung dari dua cara: **arti** (embedding Gemini + kemiripan
kosinus pgvector) dan **kata persis** (kode akun, nama klien, dsb), lalu dikelompokkan per jenis.
Tabel sumber hanya dibaca, tidak diubah.

**Issue sengaja tidak dikirim ke Google**: deskripsinya memuat nama klien. Issue tetap bisa dicari lewat
kata persis, dengan dua pelengkap tanpa Gemini (`lib/search/issues.ts`): issue dicari **langsung di tabel `issue_log`**
(selalu mutakhir, tidak menunggu indeks), dan kalimat panjang ("gagal closing karena belum mapping") cukup cocok
sebagian: kata penghubung dibuang, satu-dua kata harus semuanya ada, tiga kata atau lebih cukup 60%. Hasil issue
diselipkan bergantian dengan hasil kata persis lain supaya tidak tergeser ratusan entri KB. Halaman `/search` punya
chip filter jenis (All, Knowledge Base, Issues, Projects, Goals, Clients & Partners); chip Issues hanya mencari issue
dan tidak memanggil Gemini sama sekali. Tanpa migrasi. Daftar jenis yang di-embed ada di `EMBEDDED_TYPES`
(`lib/search/types.ts`). Catatan: nama klien dan catatan **Projects** ikut terkirim; hapus `project` dari
daftar itu bila tidak diinginkan.

**Reindex pertama kali setelah deploy** (indeks kosong sampai ini dijalankan):

1. Jalankan migrasi `0014_search_index.sql` dan `0015_search_embedding_optional.sql` (langkah 3).
2. Set `GEMINI_API_KEY` di Vercel → **Settings → Environment Variables** (Production), lalu **Redeploy**.
3. Login → menu akun (avatar) → **Settings** → tekan **Reindex Search**. Pesannya berbentuk
   "Indexed N new or changed … (M sent for embedding) …". Bila ada kalimat "N still waiting", kuota gratis
   atau batas waktu tercapai: **tunggu semenit lalu tekan lagi**; yang sudah tersimpan tidak diulang.
   Angka per jenis di kartu itu harus akhirnya cocok dengan isi website.
4. Coba cari sesuatu yang maknanya mirip tapi katanya beda.

Setelah itu:

- **Otomatis harian** (Vercel Cron, 02:30 UTC, `/api/cron/reindex-search`): hanya konten yang berubah
  (dibandingkan lewat hash isi) yang di-embed ulang, dan baris milik konten yang sudah dihapus dibersihkan.
  Hari tanpa perubahan tidak memakai kuota. Route ini butuh **`CRON_SECRET`** dan
  **`SUPABASE_SERVICE_ROLE_KEY`** sebagai env var Production di Vercel, karena cron tidak punya sesi login.
  Service role melewati RLS: simpan hanya di Vercel (terenkripsi), jangan di repo. Tanpa kedua variabel itu
  cron menjawab 503 dan auto-reindex mati; tombol manual di Settings tetap berfungsi.
- **Langsung setelah menyimpan**: mengubah entri KB, proyek (termasuk fase/partner), goal (termasuk item), issue
  atau klien memicu pembaruan indeks di latar belakang (setelah respons terkirim, jadi menyimpan tidak jadi
  lambat). Hanya konten yang berubah yang di-embed. Kalau kuota Gemini habis atau jaringan gagal, penyimpanan
  tetap berhasil dan sisanya diselesaikan cron harian atau tombol di Settings.
- **Konten panjang** dipecah jadi potongan ±1.500 karakter (dengan tumpang tindih 150 karakter, maksimal 8
  potongan per konten, tiap potongan diawali judul). Satu konten tetap tampil sebagai satu hasil. Kuota
  gratis Gemini (±100 teks/menit, 1.000/hari) berarti reindex awal setelah migrasi ini bisa butuh beberapa kali
  tekan tombol.
- **Manual**: tombol Reindex Search (ceklis "Re-embed everything" untuk memaksa semuanya ulang), atau dari
  terminal dengan `.env.local` berisi `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`:
  `npm run reindex` (tambahkan `-- --force` untuk embed ulang semua).
- **Relevansi hasil arti** (`SEMANTIC_MIN_Z` = 3 dan `SEMANTIC_MIN_SIMILARITY` = 0,61 di `lib/search/text.ts`).
  Sebuah hasil arti diterima hanya bila lolos DUA syarat. (1) Kemiripan mentah >= 0,61: query yang relevan
  memberi 0,63–0,73, ketikan acak hanya 0,52–0,58. (2) Z-score >= 3 terhadap seluruh indeks, setelah skor
  tiap dokumen dikurangi hub-nya (rata-rata kemiripannya ke dokumen lain, dihitung ulang di akhir reindex
  oleh `search_refresh_hub()`); ini membuang dokumen yang hanya "sama-sama topik ERP" (indeks rapat: rata-rata
  antar-dokumen 0,73). Z saja tidak cukup: ketikan acak membuat sebaran skor sangat sempit sehingga selisih
  kecil tampak mencolok (z 6,3 untuk goal yang kemiripannya hanya 0,55). Angka ini disetel dari tiga query nyata
  (`how to set up fixed asset`, `费用报销`, `asdfgh qwerty zxcv`), jadi masih awal. Untuk menyetelnya, buka
  `/search?q=kata+yang+dicari&debug=1`: kotak "Debug" menampilkan 8 kandidat teratas dengan similarity dan z
  sebelum disaring (✓ = diterima). Bandingkan query yang relevan dan yang ngawur, lalu ubah kedua angka itu.
- **Clients & Partners** ikut dicari (nama persis seperti di halaman Clients). Mereka masuk indeks tanpa
  vektor, jadi dicari hanya lewat kata persis dan tidak dikirim ke Google. Judul yang sama persis dengan query
  (mis. "Edot") selalu di urutan teratas, dan urutan kelompok hasil mengikuti hasil terbaiknya.
- **Ganti model/penyedia** mengubah isi vektor: jalankan Reindex dengan "Re-embed everything".

### 4c. Google Calendar (To-Do → Calendar)

Menampilkan kalender Google minggu terpilih di bawah To-Do (grid **24 jam penuh**, 00:00–24:00, dalam area yang bisa digulir;
saat dibuka tampil mulai 07:00, atau satu jam sebelum acara paling awal minggu itu; header hari tetap terlihat saat menggulir), dengan **time blocking**: klik atau seret di slot kosong
untuk membuat blok (kelipatan 15 menit; satu klik = 30 menit), klik blok untuk mengubah atau menghapusnya, atau tombol
**+ New block**. Semuanya langsung ditulis ke kalender utama Google Anda, dan perubahan yang dibuat di Google (mis. dari ponsel)
tampil saat halaman dibuka lagi. Acara seharian dan acara yang melewati tengah malam ditampilkan tetapi diubah di Google
Calendar. Mengubah atau menghapus acara berulang hanya memengaruhi kejadian yang dipilih.

**Menggeser dan tautan to-do.** Seret blok untuk memindahkannya (ke hari lain juga), tarik tepi bawahnya untuk mengubah
durasi (mouse; di layar sentuh ketuk blok lalu ubah di dialog). Tombol **Block time** (atau "+time" di kartu minggu) pada
sebuah to-do membuat blok dengan judul to-do itu dan menautkannya: to-do mencatat acara Google-nya dan menampilkan jamnya.
Tautan berlaku dua arah, dengan **acara sebagai sumber kebenaran untuk tanggal dan jam**: menggeser blok di situs atau di
Google (mis. dari ponsel) membuat tanggal dan jam to-do ikut saat bagian Calendar dibuka; tanggal to-do yang tertaut tidak
bisa diubah dari form (geser bloknya); acara yang dihapus di Google melepas tautannya (to-do tetap ada); menghapus blok di
situs juga melepas tautan. Menghapus to-do atau menandainya selesai tidak menghapus acaranya. Penulisan memakai
`sendUpdates=none`, jadi peserta acara tidak dikirimi email. Gratis.

**Pengingat (reminder)**: dialog blok punya pilihan *Reminder* (Calendar default, No reminder, At start, 5/10/15/30 menit, 1 jam,
2 jam, 1 hari sebelum). Situs hanya mengisi bidang `reminders` pada acara di Google (popup); **notifikasinya dikirim aplikasi
Google Calendar di HP**, jadi notifikasi aplikasi itu harus aktif di perangkatmu. Blok baru memakai "Calendar default" (sama
seperti sebelumnya: pengaturan bawaan kalendermu). Saat mengubah blok, pilihan menampilkan pengingat yang sudah ada;
pengingat yang diatur di Google dengan cara lain (email, atau beberapa sekaligus) tampil sebagai "Custom (set in Google)" dan
tidak diubah kecuali kamu memilih nilai lain. Menggeser atau mengubah ukuran blok tidak menyentuh pengingat. To-do tanpa
blok tidak punya pengingat. Tanpa migrasi, tanpa scope Google baru.

1. **Google Cloud Console** → proyek baru → *APIs & Services → Library* → **Google Calendar API → Enable**.
2. *OAuth consent screen*: tipe **External**, isi nama aplikasi dan email. Di **Test users** tambahkan email Google Anda. Setelah
   semuanya jalan, ubah *Publishing status* ke **In production** supaya login tidak kedaluwarsa tiap 7 hari (aplikasi
   pribadi tidak perlu verifikasi Google; hanya muncul peringatan "belum diverifikasi" yang bisa dilewati).
3. *Credentials → Create credentials → OAuth client ID → Web application*. **Authorized redirect URI**:
   `https://<domain-produksi>/api/google/callback`.
4. Di **Vercel → Settings → Environment Variables (Production)**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan
   `GOOGLE_TOKEN_SECRET` (hasil `openssl rand -base64 32`; tandai Sensitive). `SUPABASE_SERVICE_ROLE_KEY` juga wajib
   (sudah ada bila cron reindex dipakai). Redeploy.
5. Jalankan migrasi `0018_google_connections.sql` di Supabase, lalu buka **To-Do → Calendar → Connect Google Calendar**.

Keamanan: izin yang diminta hanya `calendar.events` (baca/tulis acara, bukan email atau file). Refresh token disimpan
**terenkripsi** (AES-256-GCM, kunci `GOOGLE_TOKEN_SECRET` hanya di server) di tabel `google_connections`, yang tidak bisa
dibaca dari browser (RLS aktif tanpa policy; hanya service role). Acara kalender **tidak disimpan** di database dan tidak
dikirim ke penyedia embedding; diambil langsung dari Google saat halaman dibuka. Tombol **Disconnect** mencabut akses di
Google dan menghapus token. Backup sengaja tidak menyertakan isi tabel ini.

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
  **Seret dan lepas** di pelacak mingguan: seret tugas ke hari lain, atau ubah urutannya dalam satu hari (urutan tersimpan
  di `sort_order`). Mouse: seret langsung; layar sentuh: tekan-tahan sebentar lalu seret; keyboard: fokus ke pegangan ⋮⋮, Spasi
  untuk mengambil, panah untuk memindahkan, Spasi untuk menaruh. Tugas yang tertaut ke blok Google Calendar ikut memindahkan
  bloknya ke hari tujuan (jam tetap). Panel "Hari ini" di atas tidak bisa diseret, tapi mengikuti urutan yang sama.
- **Goals** (`/goals`): target jangka panjang dengan checklist. Item punya grup (`group_name`
  jadi judul), catatan, dan urutan (↑↓ dalam grup). Progres = item selesai / total. Goal
  **diselesaikan manual** lewat checkbox, tidak otomatis dari item atau to-do, dan tidak muncul
  di daftar to-do harian.
- **Issue Log** (`/issues`): tanggal (default hari ini), klien, modul, kategori (10 pilihan di
  `lib/issues.ts`), deskripsi, akar masalah, resolusi. Klien & modul = teks bebas dengan
  autocomplete dari nilai yang pernah dipakai. Filter klien/modul/kategori/bulan, plus hitungan
  per bulan, kategori, dan klien (mengikuti filter) sebagai dasar KPI bulanan.
  **Add to KB**: issue yang sudah punya akar masalah atau resolusi bisa dijadikan entri Knowledge Base
  (`lib/issue-kb.ts`). Formulir menyarankan bab dari kolom Module (yang tidak jelas masuk Bab 15
  Troubleshooting), draf berisi Masalah/Penyebab/Solusi **tanpa nama klien dan proyek** (KB ikut dikirim
  ke Gemini untuk search, issue tidak), dan bisa diedit dulu. Satu issue satu entri; setelah itu tombolnya
  berubah jadi "In KB".
- **Beranda / Dashboard** (`/`, setelah login; sebelum login tetap halaman sambutan): "Today" (terlewat, jatuh tempo hari ini
  dengan jam blok kalender, tanpa tanggal; kotak tambah tugas cepat), "This week" (tugas selesai, jatuh tempo sisa minggu,
  jam terblokir, issue ditangani), "Needs attention" (issue belum ditandai masuk sheet; issue yang bisa dijadikan entri
  KB) dan "Running projects" (fase berjalan, progres fase, target; yang lewat target di atas). Semua dari database sendiri
  (`components/Dashboard.tsx`, `lib/dashboard.ts`); tidak memanggil Google, jadi jam blok = jam tersimpan terakhir.
  Issue tidak punya status "terbuka" (semua issue adalah catatan yang sudah diselesaikan), jadi yang ditampilkan adalah
  yang menunggu tindakan di sisi pencatatan. Tanpa migrasi.
- **Notes** (`/notes`): catatan cepat ala Notes iPhone. Satu kotak teks; baris pertama jadi judul; simpan otomatis 0,7 detik
  setelah berhenti mengetik (juga saat fokus pindah atau tab disembunyikan). Catatan baru dibuat pada simpan pertama, jadi
  catatan kosong tidak tersimpan. Bisa disematkan (Pin), ditautkan ke satu klien, dan dicari (kotak cari di daftar, atau
  pencarian global dengan chip Notes). Kalau catatan yang sama diubah dari perangkat lain, simpan otomatis berhenti dan muncul
  peringatan + tombol Reload (tulisan di perangkat lain tidak tertimpa). Catatan masuk indeks pencarian **kata persis** langsung
  saat disimpan (`lib/search/note-index.ts`), **tidak di-embed dan tidak dikirim ke Gemini**. Ikut Export JSON.
  **Sinkron antar-perangkat** (`components/AutoRefresh.tsx`, polling, bukan push real time): daftar Notes diperbarui tiap 8 detik dan
  dashboard tiap 15 detik selama tab terlihat (plus saat tab difokuskan lagi); editor yang terbuka memeriksa perubahan dari
  perangkat lain tiap 4 detik dan menampilkannya sendiri ("Updated from another device") selama di layar itu tidak ada
  ketikan yang belum tersimpan. Tab yang tersembunyi tidak memanggil server. Halaman lain (To-Do, Issue Log, KB, dst.) belum
  memakai ini: di sana perubahan dari perangkat lain muncul setelah dimuat ulang.
- **Pasang di HP (PWA)**: situs punya manifest dan ikon, jadi bisa dipasang ke layar utama dan dibuka layar penuh. iPhone: Safari →
  Share → **Add to Home Screen**; Android: menu Chrome → **Install app / Add to Home screen**. Jalan pintas "New note" dan "To-Do
  List" muncul saat ikon ditekan lama (Android). Tidak ada service worker: situs tetap butuh koneksi (tidak ada mode offline).
- **Ringkasan Mingguan** (`/summary`): pilih minggu (Senin–Jumat). Menghasilkan "Summary of This
  Week" (tugas selesai per Goal + issue per klien) dan "Next Week Plan" (tugas belum selesai,
  termasuk yang terlewat, sampai Jumat minggu depan). Kedua kolom bisa diedit lalu disalin ke
  YonWork. Hasil edit tidak disimpan. Bila Google Calendar tersambung, "Summary of This Week"
  punya bagian **Time blocked**: total jam blok kalender (Senin–Jumat) yang tertaut ke to-do, per
  Proyek/Goal/Other (`lib/google/summary-blocks.ts`). Jam diambil langsung dari Google (to-do
  disinkronkan dulu); bila Google tidak terbaca dipakai jam tersimpan terakhir, dengan catatan di
  halaman. Acara yang TIDAK tertaut ke to-do (rapat, pribadi) tidak ikut kecuali kamu klik
  "Include them" (`?calendar=all`). "Next Week Plan" menambahkan jam blok pada to-do yang tertaut,
  mis. `(due 22 Oct 2026 13:00–14:30)`. Tanpa migrasi database.
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
app/(dashboard)/clients/  master klien dan partner
app/(dashboard)/projects/ modul Projects: daftar per klien + detail (fase masing-masing dengan daftar to-do sendiri, partner, issue)
docs/BACKUP.md            backup mingguan terenkripsi dan cara restore
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

Ukuran: di layar >= 1024px skala dasar 14px (bukan 16px) supaya tidak terasa penuh; semua teks dan jarak memakai rem
jadi mengecil serempak, dan lebar kolom (`--container-*`) dikalikan 16/14 supaya lebarnya dalam piksel tetap. Ponsel dan
tablet tetap 16px. Mengubah ukuran desktop = satu angka (`font-size` di blok `@media (min-width: 1024px)`).

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

Time block, AI meeting notes, AI work report generator, notes
cepat, pomodoro timer, dan integrasi Notion/Google — semua masuk fase-fase berikutnya.
