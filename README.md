# Personal Workspace — ERP Implementation Consultant

Workspace pribadi (single-user) buat ERP Implementation Consultant (YonSuite/Yonyou).

Yang ada sekarang (rincian tiap fitur di bagian "Fitur Fase 1" di bawah):

- **Beranda** (dashboard setelah login), **To-Do List** (panel Hari ini, papan mingguan seret-lepas, Upcoming, ubah massal),
  **Kalender** Google (time blocking, warna dan legenda, tampilan bulan, kalender tambahan hanya-baca).
- **Knowledge Base** — 18 modul (lihat `lib/kb/modules.ts`), banyak entri per modul, full-text search, edit inline.
- **Issue Log**, **Projects** (fase, partner, to-do/issue tertaut), **Clients**, **Goals**, **Notes** (catatan cepat + AI atas
  perintahmu sendiri), **Ringkasan Mingguan** (riwayat + rekap bulanan), **Export**.
- **Focus** (Pomodoro dengan poin, tombol melayang), **Pencarian** (semantik + kata persis), **server MCP** untuk Claude.ai.
- Situs bisa dipasang di HP (PWA), data dibackup mingguan (terenkripsi), dan setiap PR diperiksa otomatis (lihat "Pemeriksaan otomatis").

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
- `0030_drop_old_search_semantic.sql` — menghapus fungsi lama `search_semantic(vector, integer)` (sejak 0016/0017 aplikasi memakai `search_semantic_v2`
  dan `search_keyword`; fungsi lama tidak dipanggil kode mana pun dan tidak punya dependen). Hanya satu fungsi, tanpa menyentuh tabel atau data.
  Aman dijalankan kapan saja (`if exists`); kode tidak bergantung padanya.
- `0031_rls_initplan.sql` — performa RLS: membungkus `auth.uid()` menjadi `(select auth.uid())` di lima policy pemilik (`todos`, `goals`, `goal_items`,
  `issue_log`, `kb_entries`) supaya dievaluasi sekali per kueri, bukan per baris (peringatan linter `auth_rls_initplan`). Hanya `alter policy`, tanpa DROP;
  artinya akses tidak berubah (tetap hanya pemilik). Aman dijalankan kapan saja dan diulang; kode tidak bergantung padanya.
- `0032_fk_indexes.sql` — menambah empat index untuk foreign key yang belum punya (`issue_log.kb_entry_id`, `kb_entries.user_id`, `project_partners.user_id`,
  `project_phases.user_id`); merapikan peringatan advisor `unindexed_foreign_keys`. Hanya `create index if not exists`, tanpa DROP dan tanpa menyentuh data;
  aman diulang. Tabelnya kecil, jadi manfaat nyatanya kecil; kode tidak bergantung padanya.
- `0033_focus_timer.sql` — tabel `focus_timer` (satu baris per pengguna: `state` = objek JSON timer fokus/istirahat yang sedang BERJALAN, dibatasi objek <= 600 karakter,
  RLS pemilik) supaya timer dibagi antar perangkat. Hanya menambah tabel (tanpa DROP). Diterapkan per bagian; tabel aman diulang, policy dibuat sekali. Sebelum
  tabel ini ada aplikasi tetap jalan: timer hanya di browser seperti sebelumnya.
- `0029_color_legend.sql` — tabel `color_legend` (satu baris per pengguna: `names` = objek JSON colorId Google "1".."11" -> nama pendek buatan
  pengguna untuk legenda warna blok kalender; RLS pemilik; `names` harus objek JSON dan maks. 1500 karakter). Hanya nama, tidak mengubah data lain.
  Policy dibuat tanpa DROP (jalankan sekali). **Aman bila kode live lebih dulu**: sebelum tabel ada, kalender tetap jalan dengan legenda lokal di
  browser; sinkron antar perangkat baru aktif setelah migrasi diterapkan.
- `0028_focus_sessions.sql` — tabel `focus_sessions` (satu baris per sesi fokus yang selesai: waktu mulai, menit, label, poin; unik per
  pengguna dan waktu mulai; RLS pemilik; menit 5–120, label maks. 80). Tidak mengubah data lain. Policy dibuat tanpa DROP (jalankan sekali).
  **Jalankan sebelum kode ini live** (halaman Focus membaca tabelnya).
- `0027_calendar_sources.sql` — tabel `calendar_sources` (ID kalender Google tambahan yang ditempel pengguna + label; RLS pemilik; unik per
  pengguna dan ID; maks. 3 per pengguna dijaga aplikasi). Tidak mengubah data lain. Policy dibuat tanpa DROP (jalankan sekali).
  **Jalankan sebelum kode ini live** (halaman Settings, minggu, dan bulan membaca tabelnya).
- `0026_notes_ai_blocked.sql` — kolom `notes.ai_blocked` (boolean, bawaan false) untuk catatan yang tidak boleh dikirim ke AI. Hanya
  menambah satu kolom. Aman diulang. **Jalankan sebelum kode ini live.**
- `0025_weekly_summaries.sql` — tabel `weekly_summaries` (teks Summary dan Plan per minggu; satu baris per pengguna per Senin; maks.
  50.000 karakter per kolom; RLS pemilik; trigger `updated_at`). Tidak mengubah data lain. Aman diulang. **Jalankan sebelum kode ini live.**
- `0024_attachments.sql` — tabel `attachments` (metadata; tepat satu induk: issue, entri KB, atau catatan; cascade), bucket Storage privat
  `attachments` (10 MB per file, hanya jenis file yang diizinkan, tanpa SVG) dan policy Storage per folder pengguna. Tidak mengubah data
  lain. Policy dibuat tanpa DROP (jalankan sekali). **Jalankan sebelum kode ini live.**
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

**Focus / Pomodoro** (`/focus`, menu akun → Focus timer; `lib/focus.ts`, `components/focus/*`): timer bebas (tidak terikat to-do) dengan
pilihan 15/25/45/60 menit dan label opsional. **Poin: 10 per sesi fokus yang SELESAI**; menghentikan di tengah = tidak ada poin. Setelah sesi
selesai ada istirahat 5 menit (15 menit setiap sesi ke-4 pada hari yang sama) yang bisa dilewati; istirahat tidak dicatat. Timer yang sedang
berjalan disimpan di browser (localStorage, cache instan, jadi tetap jalan saat pindah halaman atau memuat ulang) **dan dibagi antar perangkat lewat tabel
`focus_timer`** (migrasi `0033`): mulai di laptop, timernya muncul di HP (dan sebaliknya), dan menghentikannya di satu perangkat menghentikannya di semua.
Sesi yang SELESAI tetap di `focus_sessions`, jadi poin dan riwayat sama di PC dan HP. **Tombol melayang** (`components/focus/FocusFab.tsx`, ala "assistive touch"): lingkaran navy di tepi kanan bawah di semua halaman (kecuali
`/focus`, yang punya timer besar sendiri). Bisa diseret ke mana saja dan menempel ke sisi kiri/kanan terdekat; posisinya diingat di
localStorage (`focus-fab-v1`). Klik membuka panel kecil untuk memulai (pilih menit, label opsional), menghentikan, atau memulai/melewati
istirahat tanpa pindah halaman; saat berjalan ia menjadi pil berisi hitung mundur. `FocusBadge` di menu atas tidak lagi menampilkan apa pun, tetapi
menjadi satu-satunya yang mencatat sesi saat timer habis (tidak dobel); aturan awal timer ada di `components/focus/store.ts`. Aturan antikecurangan sederhana, ditegakkan
di server (`parseFocusInput`): lama harus salah satu pilihan, sesi harus sudah benar-benar lewat, selesainya tidak lebih dari 15 menit lalu
(buka situs lagi setelah itu = tidak dihitung), dan poinnya ditentukan server (bukan dikirim browser); sesi yang sama dicatat dua kali (dua tab)
tetap satu baris. Halaman menampilkan poin hari ini/minggu ini/total, sesi per hari 7 hari terakhir, dan 10 sesi terakhir (bisa dihapus; poinnya
ikut hilang). Bunyi dua nada saat selesai (bisa diblokir browser bila halaman belum pernah disentuh) dan hitung mundur di judul tab. Perlu migrasi `0028`.

**Sinkronisasi timer** (`lib/focus-sync.ts`, `components/focus/{store.ts,sync.ts,FocusSync.tsx}`, `app/(dashboard)/focus/timer-actions.ts`): `writeTimer` adalah
satu-satunya pintu perubahan dan juga mengirimnya ke server (timer berjalan = simpan/ganti baris; berhenti atau selesai = hapus baris). `FocusSync` (tanpa
tampilan, di menu atas) mencocokkan perangkat ini dengan server saat halaman dibuka, tiap 20 detik selama tab terlihat, dan saat tab difokuskan lagi
(tab tersembunyi tidak memanggil server). Aturannya murni dan diuji (`reconcileTimer`): timer yang MULAI lebih baru menang; timer yang sudah pernah ada di
server lalu hilang berarti dihentikan atau selesai di perangkat lain; penghapusan yang gagal (jaringan putus) dicatat (`focus-sync-v1`) dan diulang, dan
**hanya menghapus baris yang tidak lebih baru dari timer yang dihentikan** (timer baru dari perangkat lain tidak ikut terhapus); sisa baris lama yang
lewat masa tenggang 15 menit dibersihkan, bukan dihidupkan lagi. Mencatat sesi selesai tetap oleh `FocusBadge` di perangkat yang membukanya lebih dulu;
bila dua perangkat sama-sama mencatat, constraint unik `(user_id, started_at)` membuatnya satu baris (diuji di Postgres). Selisih jam antar perangkat
membuat hitung mundur bisa berbeda beberapa detik (waktu selesai disimpan sebagai jam perangkat yang memulai). Tabel belum ada atau server galat =
sinkronisasi diam, timer tetap jalan di browser.

**Kalender tambahan** (Settings → Other calendars; `lib/google/calendar-sources.ts`, `lib/google/extra-calendars.ts`): sampai 3 kalender
Google lain (mis. kantor atau proyek) ikut tampil di grid minggu dan tampilan bulan, **hanya baca** dan bergaris putus-putus. Cara
menambah: tempel **Calendar ID** (Google Calendar → Settings → pilih kalender → *Integrate calendar* → *Calendar ID*; bentuknya
`nama@gmail.com` atau `abc123@group.calendar.google.com`); akun Google yang tersambung harus sudah punya akses ke kalender itu (dibagikan
kepadamu). Sebelum disimpan, ID diuji dengan membaca satu hari acaranya, jadi ID salah (404) atau tanpa akses (403) langsung ditolak dengan
pesan jelas. **Tanpa izin Google baru:** izin `calendar.events` yang sudah ada cukup untuk membaca acara kalender lain bila ID-nya diketahui
(itu sebabnya ID ditempel, bukan dipilih dari daftar, karena daftar kalender butuh izin tambahan). Situs tidak pernah menulis ke kalender
ini, tidak menautkan to-do ke acaranya, dan tidak menyimpan acaranya; sinkronisasi to-do dan Ringkasan Mingguan hanya memakai kalender
utama. Acara yang sama di dua kalender (iCalUID sama) tampil sekali, sebagai acara kalender utama. Kalender yang gagal dibaca (ID salah,
akses dicabut) jadi satu catatan singkat dan tidak mengganggu yang lain. Tiap kalender tambahan = satu permintaan Google lagi per muat
halaman. Perlu migrasi `0027`.

**Tampilan bulan** (`/todos/month`, tombol **Month view** di bagian Calendar): grid Senin–Minggu untuk satu bulan, berisi acara Google
(seharian hitam, berjam abu-abu dengan jam WIB; acara lintas hari tampil di tiap harinya) dan to-do jatuh tempo (berbingkai; yang
selesai dicoret). Tiap hari menampilkan 3 item pertama dan "+N more"; di layar HP hanya jumlah. Klik satu hari membuka minggunya di
halaman To-Do. To-do yang tertaut ke acara yang terbaca ditampilkan sekali, sebagai acaranya. Hanya membaca: tidak menyinkronkan
to-do dengan Google (itu terjadi saat bagian Calendar minggu dibuka). Bila Google tidak tersambung atau gagal dibaca, halaman tetap
tampil dengan to-do saja plus catatan. Logika di `lib/month-grid.ts`; tanpa migrasi dan tanpa izin Google baru.

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
- **Lampiran** (issue, entri KB, catatan; `components/AttachmentPanel.tsx`, `lib/attachments.ts`): klik untuk memilih file, seret-lepas,
  atau **tempel screenshot dari clipboard** (Ctrl/Cmd+V; di editor catatan dan form edit issue tempelan diterima di mana pun di
  halaman; di panel lain, klik dulu kotak lampirannya). Jenis: gambar (PNG/JPG/WebP/GIF), PDF, Excel, Word, CSV, teks; SVG dan file
  program ditolak. Maks. 10 MB per file dan 10 lampiran per item. Gambar besar dikecilkan di browser sebelum diunggah (sisi terpanjang
  2000 px, JPEG). File diunggah langsung dari browser ke Supabase Storage (jalur `<id pengguna>/<uuid>.<ext>`, dijaga policy Storage)
  lalu didaftarkan lewat server action yang memeriksa ulang jenis (dari ekstensi), ukuran (dari Storage), jalur, induk, dan batas jumlah.
  Tampil lewat tautan bertanda tangan yang berlaku ±1 jam. **Tidak pernah dikirim ke Gemini dan tidak ikut pencarian.** Menghapus issue
  atau catatan membersihkan file-nya dari Storage. **Catatan backup:** file lampiran ikut backup mingguan terenkripsi sebagai job terpisah (`scripts/backup-attachments.sh`, butuh rahasia GitHub `SUPABASE_SERVICE_ROLE_KEY`; lihat `docs/BACKUP.md`); sebelum rahasia itu dipasang, file lampiran tidak ikut backup (daftarnya di tabel `attachments` selalu ikut).
- **Notes** (`/notes`): catatan cepat ala Notes iPhone. Satu kotak teks; baris pertama jadi judul; simpan otomatis 0,7 detik
  setelah berhenti mengetik (juga saat fokus pindah atau tab disembunyikan). Catatan baru dibuat pada simpan pertama, jadi
  catatan kosong tidak tersimpan. Bisa disematkan (Pin), ditautkan ke satu klien, dan dicari (kotak cari di daftar, atau
  pencarian global dengan chip Notes). Kalau catatan yang sama diubah dari perangkat lain, simpan otomatis berhenti dan muncul
  peringatan + tombol Reload (tulisan di perangkat lain tidak tertimpa). Catatan masuk indeks pencarian **kata persis** langsung
  saat disimpan (`lib/search/note-index.ts`), **tidak di-embed dan tidak pernah dikirim ke Gemini oleh pencarian**. Satu-satunya jalan
  catatan ke Gemini adalah tombol **AI** yang kamu tekan sendiri (bagian AI notes di bawah). Ikut Export JSON.
  **Sinkron antar-perangkat** (`components/AutoRefresh.tsx`, polling, bukan push real time; halaman **To-Do** ikut, tiap 20 detik, lebih jarang karena halaman itu juga membaca Google Calendar). Refresh otomatis **menunggu** selama kamu mengerjakan sesuatu (`lib/auto-refresh.ts`): kolom teks sedang fokus, form New/Edit terbuka, ada dialog atau seleksi batch, atau mouse/jari sedang menyeret: daftar Notes diperbarui tiap 8 detik dan
  dashboard tiap 15 detik selama tab terlihat (plus saat tab difokuskan lagi); editor yang terbuka memeriksa perubahan dari
  perangkat lain tiap 4 detik dan menampilkannya sendiri ("Updated from another device") selama di layar itu tidak ada
  ketikan yang belum tersimpan. Tab yang tersembunyi tidak memanggil server. Halaman lain (To-Do, Issue Log, KB, dst.) belum
  memakai ini: di sana perubahan dari perangkat lain muncul setelah dimuat ulang.
- **Pasang di HP (PWA)**: situs punya manifest dan ikon, jadi bisa dipasang ke layar utama dan dibuka layar penuh. iPhone: Safari →
  Share → **Add to Home Screen**; Android: menu Chrome → **Install app / Add to Home screen**. Jalan pintas "New note" dan "To-Do
  List" muncul saat ikon ditekan lama (Android). Tidak ada service worker: situs tetap butuh koneksi (tidak ada mode offline).
- **Kalender: blok bertumpuk dan jam kerja** (`components/CalendarGrid.tsx`, `lib/google/work-hours.ts`): tiap blok menyisakan lajur kosong 16 px di tepi kanan kolom hari; mengklik atau menyeret di lajur itu membuat blok baru **di atas** blok yang sudah ada (mis. blok "Work" 8 jam), dan blok yang saling tumpang tindih dibagi ke kolom berdampingan tanpa saling menutupi judul. Blok panjang (>= 3 jam, `BACKDROP_MIN` di `lib/google/layout.ts`) yang memuat blok lain, mis. "Working Hour", menjadi **latar** selebar penuh yang tenang: blok di dalamnya berbagi kolom sesama mereka (digeser 12 px ke kanan), dan judul latar dipindah ke bagian yang tidak tertutup. Klik nama hari di header untuk **tampilan satu hari** yang lebar (klik lagi untuk kembali ke seminggu), berguna saat satu hari padat. **Work hours** (tombol di atas grid; bawaan 09:00-17:00 Senin-Jumat) adalah latar, bukan acara: jam di luar jam kerja dan hari yang tidak dipilih diberi warna abu, sehingga di dalam jam kerja Anda bebas menaruh blok pekerjaan. Pengaturannya disimpan di browser perangkat itu saja (localStorage `work-hours-v1`, tanpa migrasi).
- **Warna blok kalender** (`lib/google/color.ts`): dialog blok punya pilihan 11 warna = `colorId` acara Google Calendar (Tomato, Flamingo, Tangerine, Banana, Basil, Sage, Peacock, Blueberry, Lavender, Grape, Graphite) plus "default" (biru navy situs). Karena memakai warna Google sendiri, pilihan di sini tampil sama di aplikasi Google Calendar dan sebaliknya (warna yang diatur di Google tampil di sini); tanpa tabel atau migrasi. Menyeret/mengubah durasi blok tidak mengubah warnanya; memilih "default" menghapus warnanya di Google. Maknanya diberi sendiri lewat tombol **Color legend** di atas grid (`lib/google/legend.ts`): satu nama pendek per warna (maks. 24 karakter; mis. merah = Urgent, hijau = Learning), ada tombol "Use suggestions" sebagai titik awal. Nama muncul sebagai baris legenda di atas kalender, di tooltip blok, dan di pilihan warna pada dialog. Warna blok juga tampil di **tampilan bulan** (`/todos/month`): acara berjam dengan latar tipis dan garis kiri berwarna, acara seharian berwarna penuh dengan teks yang menyesuaikan (gelap di atas kuning), dan baris legenda di bawahnya; kalender tambahan tetap abu-abu putus-putus. Nama legenda **tersinkron antar perangkat** lewat tabel `color_legend` (migrasi `0029`, satu baris per pengguna, RLS pemilik; hanya nama, warnanya tetap di Google). Database adalah acuan; localStorage (`color-legend-v1`) hanya cache supaya tampil seketika dan tetap jalan bila server atau tabelnya tidak tersedia (komponen `LegendSync` menyamakan keduanya tiap halaman dimuat; legenda lokal yang dibuat sebelum sinkron ada diunggah sekali bila database belum punya baris). Bila penyimpanan ke server gagal, muncul catatan "Saved on this device only".
- **Ukuran kotak bisa ditarik**: kotak kalender dan papan Senin-Minggu punya pegangan di bawahnya (`components/ui/ResizeHandle.tsx`): tarik dengan mouse/sentuh, panah atas/bawah (Shift = lebih besar), klik dua kali atau Home untuk kembali ke ukuran bawaan. Ukurannya diingat per perangkat (localStorage `size-calendar-v1`, `size-weekboard-v1`, tanpa migrasi); kartu akhir pekan selalu 40% dari tinggi kartu hari kerja.
- **Kecepatan klik di To-Do**: setiap klik (centang, tambah) merender ulang halaman, dan bagian Calendar dulu memanggil Google lagi di tiap render (tukar token + ambil acara + kalender lain + sinkron), yang membuat klik terasa lambat (terukur: ~210 ms -> ~830 ms bila Google 300 ms per panggilan). Sekarang: (1) kotak centang (`components/todo/DoneCheckbox.tsx`) berubah seketika (optimistis), dan kotak tambah cepat langsung kosong dengan "Adding…"; (2) `lib/google/cache.ts` menyimpan access token 30 menit dan tampilan kalender per minggu: yang lebih muda dari 20 detik dipakai langsung, yang lebih tua (maks. 60 detik) dipakai saat itu juga lalu disegarkan di belakang layar lewat `after()` (stale-while-revalidate), dan yang lebih tua dari itu ditunggu segar. Menulis acara dari situs (`bustCalendar`) atau memutus/menyambung Google (`bustUser`) mengosongkan cache. Cache ada di memori tiap instance server; perubahan yang dibuat langsung di Google tampil paling lama sekitar semenit kemudian (polling halaman 20 detik).
- **Upcoming** (`/todos`, `lib/upcoming.ts`): di bawah kotak tambah cepat ada bagian **Upcoming**: to-do TERBUKA yang jatuh tempo SETELAH hari ini, dikelompokkan per tanggal dengan label relatif ("Tomorrow", "In 4 days", "In 2 weeks"), diurutkan menurut tanggal. Delapan pertama tampil, "Show all N" menampilkan semuanya. Filter prioritas dan goal berlaku juga di sini (filter status tidak, karena yang selesai memang tidak ditampilkan). Tiap baris punya centang, Edit/Block time/Delete, dan **Move to today**. Panel Today tetap hanya berisi hari ini, yang terlewat, dan yang tanpa tanggal.
- **To-do dan kalender dari form** (`/todos`, `app/(dashboard)/todos/actions.ts`): form New/Edit task punya kolom **From/To** (jam WIB, opsional, hanya tampil bila Google tersambung). Mengisi keduanya membuat blok di Google Calendar yang tertaut ke to-do; pada to-do yang sudah tertaut, mengubah tanggal/jam di form menggeser acaranya di Google (Google dulu: bila gagal, tidak ada yang berubah), dan kotak **Remove from calendar** melepas serta menghapus acaranya. Kotak "tugas baru" di atas daftar Hari ini punya tombol **Calendar** (tanggal + jam) untuk hal yang sama. Setelah menyimpan, halaman tetap di minggu yang sedang dilihat (`?week=`, dibawa lewat field tersembunyi `week` dan tautan Add task/Edit); tugas baru tanpa `?week=` membuka minggu tanggalnya bila bukan minggu ini.
- **Edit massal to-do** (panel Today di `/todos`, `components/todo/BatchSelection.tsx`, `lib/todo-batch.ts`): kotak pilihan **tidak tampil secara bawaan** (supaya tidak tertukar dengan kotak "tandai selesai"); tombol **Select** di atas daftar membuka mode memilih, dan **Done** atau **Esc** (atau selesai menerapkan perubahan) menutupnya dan mengosongkan pilihan. Dalam mode itu ada kotak centang di tiap to-do
  dan di tiap grup (Overdue, Today, proyek). Setelah ada yang dipilih, bar di bawah layar mengubah sekaligus: tanggal (Today /
  Tomorrow / Next Mon / No date / tanggal bebas), prioritas, status, goal, proyek + fase, atau menghapus. Pilihan yang dibiarkan
  "no change" tidak disentuh; mengganti proyek tanpa memilih fase mengosongkan fasenya. To-do yang tertaut ke blok kalender
  tetap mengikuti bloknya untuk tanggal (kolom lain tetap berubah; pesan hasil menyebut berapa yang tanggalnya dipertahankan).
  **Papan mingguan** punya tombol **Select** sendiri (instance `BatchSelection` terpisah): kotak di tiap to-do plus kotak "pilih
  semua" di header tiap hari, dengan bar aksi dan aturan yang sama. Membuka mode memilih di Today menutup yang di papan, dan
  sebaliknya (event `batch-select-start`). Menyeret to-do tetap bisa, juga saat mode memilih aktif.
  **Halaman proyek** (`/projects/[id]`) juga punya tombol **Select**: kotak di tiap to-do dan kotak "pilih semua" di tiap fase
  (serta grup "Not in any phase"); fase atau hari tanpa to-do tidak menampilkan kotak. Tujuan pindah proyek/fase dan goal
  diambil dari semua proyek yang belum selesai dan goal aktif; to-do yang dipindah ke proyek lain hilang dari halaman ini.
  Maksimal 200 to-do per aksi; masukan divalidasi di server. Di HP, kolom ubah terlipat di balik tombol "Edit…". Belum ada di
  pelacak mingguan (seret-lepas) dan halaman Proyek.
- **Tambah tugas instan** (kolom hari di papan mingguan, `components/WeekBoard.tsx`; kotak "Write a new task" di Beranda,
  `components/TodayQuickAdd.tsx`; server action `addTodoForDay`): tugas langsung tampil (redup) dan kotak langsung kosong dengan fokus
  tetap, sementara penyimpanan berjalan di latar belakang (beberapa bisa bersamaan); gagal = pesan galat dan baris redup dihapus. Selama
  seretan (atau penyimpanan seretan) papan memakai salinan lokal; `reconcileBoard` (`lib/todo-board.ts`) menggabungkan data terbaru ke
  salinan itu, supaya tugas yang baru selesai disimpan di tengah seretan tidak menghilang sampai seretan selesai.
- **To-do proyek dikelompokkan** di panel Today (`lib/todo-groups.ts`): to-do tanpa proyek tetap daftar biasa; to-do proyek masuk
  satu blok per proyek (abjad), dengan sub-judul per fase menurut urutan fase. Blok dengan lebih dari 3 to-do terlipat
  (judul menampilkan jumlahnya; kotak centang di judul memilih semuanya tanpa membuka lipatan).
- **Clients** (menu avatar di kanan atas, `/clients`): tempat master data klien dan partner; tidak lagi bagian dari Issue Log. Halaman yang
  butuh klien baru (form Proyek baru, form Issue) membuka menu ini dengan `?from=<halaman asal>`: tombol "‹ Projects" /
  "‹ Issue Log" dan hasil simpan kembali ke asal, dan klien yang baru dibuat langsung terpilih di form Proyek baru.
  Pola `from` yang sama dipakai saat membuka edit to-do atau edit issue dari halaman Proyek: Batal dan Simpan kembali ke
  halaman Proyek, bukan ke daftar To-Do/Issue (`lib/return-to.ts`; hanya path relatif situs ini yang diterima).
- **Pemilih klien berketik** (form Proyek baru, `components/ClientPicker.tsx`): ketik sebagian nama atau alias (urutan kata bebas),
  pilih dengan klik atau panah + Enter; wajib memilih dari daftar.
- **Hapus langsung**: tombol Delete (dengan konfirmasi) di daftar Notes dan di tiap to-do pada halaman Proyek.
- Pilihan kosong di form ("No goal", "No project", "No phase") tampil abu-abu (`lib/ui.ts`).
- **AI notes** (panel "AI" di bawah editor catatan, dan `/notes/ask`; `lib/ai/*`, `app/(dashboard)/notes/ai-actions.ts`): **Tidy meeting
  notes** (ringkasan, keputusan, action item, pertanyaan terbuka), **Summarize**, **Add action items to To-Do** (hanya yang kamu
  centang), dan **Ask AI** (tanya sampai 5 catatan pilihanmu). Prinsip privasi: (1) tidak ada yang dikirim kecuali kamu menekan
  tombol; tidak ada proses otomatis atau latar belakang; (2) teks dibaca ulang dari database di server dan **disensor sebelum keluar
  server**: nama klien/partner (+alias) dan proyek, email, tautan, nomor telepon, NPWP, nominal/angka besar (≥5 digit atau berawalan
  Rp/IDR/USD), dan kode campuran huruf-angka diganti penanda (`[CLIENT_1]`, `[NUM_2]`, ...), lalu hasil Gemini dikembalikan ke
  aslinya di server; tanggal dan angka kecil tetap. **Nama orang tidak terdeteksi**: pakai **Preview what is sent** untuk melihat
  persis teks yang akan keluar; (3) tombol **Never send this note to AI** menandai catatan privat (`notes.ai_blocked`, migrasi
  `0026`); server menolaknya apa pun yang diminta browser, dan catatan itu tidak bisa dipilih di Ask AI; (4) hasil tidak
  otomatis masuk catatan: kamu memilih **Append to note**, **Copy**, atau membuang. Batas: 30.000 karakter per catatan, 40.000 total
  untuk Ask AI. Issue dan klien tetap tidak pernah dikirim. Memakai `GEMINI_API_KEY` yang sama dengan pencarian; model teks
  diatur lewat `GEMINI_TEXT_MODEL` (bawaan `gemini-3.5-flash-lite`, nama yang disarankan Google sendiri dalam pesan error 404 untuk `gemini-2.5-flash-lite`, yang sudah tidak tersedia untuk pengguna baru; belum diuji dengan kunci asli; bila Google
  mengganti/menghentikan modelnya, aplikasi menampilkan pesan dan cukup mengisi variabel ini). **Catatan tier gratis:** menurut
  sumber pihak ketiga, Google dapat memakai konten tier gratis untuk memperbaiki produknya (tier berbayar tidak); periksa syarat
  resminya sebelum memasukkan isi yang sensitif. Kuota gratis terbatas; bila habis muncul pesan "quota reached".
- **Ringkasan Mingguan** (`/summary`): pilih minggu (Senin–Jumat). Menghasilkan "Summary of This
  Week" (tugas selesai per Goal + issue per klien) dan "Next Week Plan" (tugas belum selesai,
  termasuk yang terlewat, sampai Jumat minggu depan). Kedua kolom bisa diedit lalu disalin ke
  YonWork. Tombol **Save** menyimpan teks minggu itu (satu baris per minggu, `weekly_summaries`); membuka minggu itu
  lagi menampilkan teks tersimpan, "Reset to template" membangun ulang dari data, "Delete saved text" menghapus simpanannya.
  `/summary/history` mendaftar minggu yang disimpan (per bulan, dengan jumlah tugas/issue/jam dari teksnya) dan
  `/summary/monthly?month=YYYY-MM` membuat rekap bulanan berupa angka (tugas per Proyek/Goal, issue per klien/modul/kategori, jam
  terblokir, status proyek) langsung dari data (`buildMonthlyText`). Bila Google Calendar tersambung, "Summary of This Week"
  punya bagian **Time blocked**: total jam blok kalender (Senin–Jumat) yang tertaut ke to-do, per
  Proyek/Goal/Other (`lib/google/summary-blocks.ts`). Jam diambil langsung dari Google (to-do
  disinkronkan dulu); bila Google tidak terbaca dipakai jam tersimpan terakhir, dengan catatan di
  halaman. Acara yang TIDAK tertaut ke to-do (rapat, pribadi) tidak ikut kecuali kamu klik
  "Include them" (`?calendar=all`). "Next Week Plan" menambahkan jam blok pada to-do yang tertaut,
  mis. `(due 22 Oct 2026 13:00–14:30)`. Riwayat butuh migrasi `0025`.
- **Export**: menu akun (avatar) → "Export semua data (JSON)" dan "Export issue log (CSV)";
  halaman Issue Log punya tombol Export CSV yang mengikuti filter. CSV memakai BOM UTF-8 dan
  menetralkan sel yang diawali `= + - @` (dengan awalan `'`) supaya tidak jadi rumus di Excel/Sheets.
- **Zona waktu**: semua logika tanggal/minggu memakai Asia/Jakarta (`lib/date.ts`). Waktu selesai
  (`completed_at`) diisi trigger database, bukan kode aplikasi.

## MCP server untuk Claude.ai (OAuth Supabase)

Endpoint `https://beginner-erp-guide.vercel.app/api/mcp` (Streamable HTTP) memberi Claude.ai akses ke to-do, goal, issue log, dan weekly summary
(tanpa tool hapus). Login lewat OAuth 2.1 Supabase; halaman consent di `/oauth/consent`. Token divalidasi lewat JWKS (issuer, audience, exp, dan
klaim `client_id`), lalu data dibaca dengan token itu sendiri sehingga RLS berlaku (tanpa service role key).

Setup sekali di dashboard Supabase:
1. Authentication → OAuth Server: aktifkan, **Authorization Path** = `/oauth/consent`, dan aktifkan *Dynamic client registration* (atau daftarkan klien manual di OAuth Apps dengan redirect URI `https://claude.ai/api/mcp/auth_callback`).
2. Authentication → URL Configuration: **Site URL** = `https://beginner-erp-guide.vercel.app`.
3. Authentication → JWT Signing Keys: pakai kunci asimetris (ES256).
4. Claude.ai → Settings → Connectors → Add custom connector → URL `https://beginner-erp-guide.vercel.app/api/mcp`.

Env var opsional: `MCP_PUBLIC_ORIGIN` (hanya untuk menguji di domain selain produksi).

Log dan batas durasi: tiap permintaan mencatat `[mcp] start` dan `[mcp] done` (status, jenis isi, durasi) serta `[mcp] closed`/`[mcp] cancelled` saat
respons `text/event-stream` berakhir. Yang dicatat hanya metode HTTP, metode JSON-RPC, nama tool, status, dan durasi (tanpa token, argumen, atau data).
`maxDuration` = 30 detik. Permintaan `subscriptions/listen` dari klien (aliran notifikasi perubahan daftar tool) sengaja dibiarkan terbuka oleh
protokol, jadi di Vercel ia berakhir di batas durasi dan tercatat sebagai "Task timed out" di Runtime Errors; sementara permintaan lain
(`initialize`, `tools/list`, `tools/call`) selesai dalam milidetik. Itu bukan kegagalan tool. Log runtime Vercel Hobby hanya disimpan 1 jam.

## Pemeriksaan otomatis (CI)

`.github/workflows/ci.yml` berjalan di setiap pull request dan setiap push ke `main` (Node 22, `npm ci`): `npx tsc --noEmit` (tipe),
`npm run lint` (eslint), dan `npm test` (tes unit logika murni di `lib/*.test.ts`). Repo ini publik, jadi workflow-nya tanpa rahasia dan hanya
berizin baca (`pull_request`, bukan `pull_request_target`). Jalankan tiga perintah yang sama secara lokal sebelum membuat PR. Build
produksi tetap dilakukan Vercel; CI tidak membangun atau men-deploy. Agar PR yang gagal tidak bisa di-merge, aktifkan branch protection
di GitHub (Settings → Branches → Require status checks to pass → pilih "Typecheck, lint, tests").

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
components/TopNav.tsx     menu atas sticky (di root layout, ada di semua halaman): Home, To-Do List (pil yang disorot), Notes | halaman lain; Clients, Focus, Settings, ekspor ada di menu avatar
app/(dashboard)/          penjaga login untuk halaman-halaman privat di bawahnya
app/(dashboard)/todos/    modul To-Do List (panel Hari ini + pelacak mingguan, terhubung ke Goals)
app/(dashboard)/goals/    modul Goals: daftar + detail checklist (grup, urutan, centang)
app/(dashboard)/issues/   modul Issue Log
app/(dashboard)/clients/  master klien dan partner
app/(dashboard)/projects/ modul Projects: daftar per klien + detail (fase masing-masing dengan daftar to-do sendiri, partner, issue)
docs/BACKUP.md            backup mingguan terenkripsi dan cara restore
.github/workflows/        backup.yml (backup mingguan) dan ci.yml (tsc + lint + tes di setiap PR dan push ke main)
lib/theme.ts              pilihan tema (System/Light/Dark) dan skrip awal di <head>; saklarnya di components/ThemeSwitch.tsx (menu avatar)
lib/motion.ts             pilihan animasi (System/On/Off) dan skrip awal di <head>; saklarnya di components/MotionSwitch.tsx (menu avatar)
app/(dashboard)/focus/    halaman Focus (Pomodoro); tombol melayang di components/focus/FocusFab.tsx, logika murni di lib/focus.ts, sinkronisasi timer di lib/focus-sync.ts + timer-actions.ts
app/(dashboard)/notes/    catatan cepat + panel AI (lib/ai/*); app/(dashboard)/search/ pencarian global (lib/search/*)
lib/google/               integrasi Google Calendar (token, acara, tata letak blok, warna dan legenda, jam kerja, kalender tambahan)
app/api/mcp/              server MCP untuk Claude.ai (lib/mcp/*); app/api/cron/ keep-alive dan reindex pencarian terjadwal
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

Gaya minimalis ala Apple: menu atas sticky, konten di tengah, banyak ruang kosong, halaman tetap putih.
Semua warna adalah CSS variable di `app/globals.css` (dipetakan ke kelas Tailwind lewat `@theme inline`),
jadi mengganti palet = mengubah satu blok `:root`:

- **Netral**: `foreground` (teks utama), `muted` (teks sekunder), `subtle` (teks kosong/default/placeholder),
  `border` / `border-strong`, `surface` (abu sangat muda untuk hover dan area diam). Bayangan kartu lembut
  (`shadow-card`, `shadow-pop` untuk menu/dialog).
- **Aksen tunggal biru navy** (`accent`, `accent-soft`, `accent-ink`): tombol utama, menu aktif, item terpilih,
  progres, fokus input, dan acara kalender utama.
- **Semantik** (versi lembut `*-soft` + teks gelap): hijau = selesai/berhasil, kuning-oranye = perlu perhatian,
  merah (`danger`) = error, prioritas tinggi, lewat tenggat, aksi hapus. Kalender tambahan = abu-abu putus-putus.
- Semua pasangan teks/latar sudah diperiksa kontrasnya (WCAG AA). Pakai token, jangan hex mentah di komponen.

Ukuran: di layar >= 1024px skala dasar 14px (bukan 16px) supaya tidak terasa penuh; semua teks dan jarak memakai rem
jadi mengecil serempak, dan lebar kolom (`--container-*`) dikalikan 16/14 supaya lebarnya dalam piksel tetap. Ponsel dan
tablet tetap 16px. Mengubah ukuran desktop = satu angka (`font-size` di blok `@media (min-width: 1024px)`).

**Mode gelap** (`app/globals.css`, `lib/theme.ts`, `components/ThemeSwitch.tsx`): menu avatar punya pilihan **Appearance: System / Light / Dark**. System (bawaan)
mengikuti pengaturan perangkat (`prefers-color-scheme`); Light atau Dark memaksa tema itu. Pilihan disimpan per perangkat di localStorage (`theme-v1`; tema
memang bergantung pada perangkat, jadi tidak disinkronkan). Cara kerjanya hanya mengganti nilai token warna: blok `:root[data-theme="dark"]` dan padanannya di
`@media (prefers-color-scheme: dark)` untuk System (isinya sama, jangan diubah sendiri-sendiri), plus `color-scheme` supaya kolom isian, tanggal/jam, dan
scrollbar bawaan browser ikut gelap. Skrip kecil di `<head>` (`THEME_INIT_SCRIPT`) memasang `data-theme` sebelum halaman digambar, jadi tidak berkedip terang
lalu gelap; `<html>` memakai `suppressHydrationWarning` karena itu. Palet gelap dihitung kontrasnya (teks >= 4,5:1, garis dan ikon >= 3:1): latar #0e1014,
`accent` tetap biru yang cukup gelap untuk teks putih di tombol, sedangkan teks berwarna aksen memakai `accent-ink` (terang di mode gelap; di mode terang nilainya
sama dengan `accent`, jadi tidak ada perubahan). Aturan menulis komponen baru: pakai token, jangan `bg-white`, `text-black`, atau warna heksa mentah;
teks berwarna aksen = `text-accent-ink`, bukan `text-accent`. Warna blok kalender memakai warna Google dengan alpha tipis di atas latar, jadi otomatis ikut.
Diagram Mermaid memakai dua set warna (`MermaidDiagram.tsx`) dan digambar ulang saat tema berganti. Sorotan pencarian memakai token `highlight`. `themeColor`
(bilah alamat HP) mengikuti perangkat, bukan pilihan di situs.

**Gerak** (`app/globals.css`, `lib/motion.ts`, `components/MotionSwitch.tsx`): animasi sengaja kecil dan hemat: hanya `opacity` dan `transform`/`translate` (tidak memicu hitung
ulang tata letak), 160-260 ms, tanpa pustaka animasi. Isinya: `anim-enter` (item baru masuk), `anim-pop` (menu dan dialog muncul), `anim-fade` (latar dialog), `anim-page`
(isi halaman memudar masuk saat pindah halaman; hanya opacity supaya elemen `fixed` tidak terpengaruh), `anim-check` (kotak centang "selesai" membal sekali, hanya saat
kamu mencentangnya, bukan saat daftar dimuat), dan kartu yang bisa diklik naik 1,75 px dengan bayangan `shadow-lift` saat disorot. **Menu avatar → Animations: System / On / Off**
(per perangkat, `motion-v1`): System (bawaan) mengikuti pengaturan "kurangi gerak" perangkat; **On menimpa "kurangi gerak"** (berguna bila perangkat memintanya tanpa kamu sadari);
Off mematikan semuanya. Mekanismenya token `--m-*` yang hanya berisi animasi bila gerak diizinkan (dua blok nilai di `globals.css` harus sama), lalu kelas `anim-*` dan kartu
(`hover:[translate:0_var(--m-lift)]`) memakai token itu; di luar itu tokennya `none`. Skrip awal di `<head>` memasang `data-motion` sebelum halaman digambar. Catatan teknis:
(1) Tailwind 4 memakai properti CSS `translate` (bukan `transform`), jadi transisinya harus menyebut `translate`; (2) pembaruan state biasa di dalam `startTransition` asinkron baru tampil
setelah server menjawab, jadi animasi yang dipicu klik harus mengubah state DI LUAR transisi; (3) `template.tsx` hanya dipasang ulang saat segmen di bawahnya berganti, jadi
`app/(dashboard)/template.tsx` memudarkan perpindahan antar halaman grup itu (bukan saat `?week=` berubah); (4) animasi halaman tanpa `fill-mode`, supaya tidak ada efek yang tertinggal di
pembungkus halaman (perbedaan anti-aliasing teks). Area seret-lepas (dnd-kit) dan tata letak kalender tidak dianimasikan.

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

Daftar jujur (diperiksa terhadap kode):

- **Mode offline**: tidak ada service worker (situs tetap butuh koneksi).
- **Integrasi Notion**: belum dikerjakan (Google Calendar sudah).
- **Notifikasi tenggat to-do**: pengingat hanya untuk blok kalender (lewat Google), bukan untuk tugas bertanggal.
