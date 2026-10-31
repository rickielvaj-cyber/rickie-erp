# Backup database

Supabase free tier **tidak punya backup otomatis**. Backup di sini dibuat oleh GitHub Actions setiap
minggu, dienkripsi, dan disimpan di luar Supabase dan Vercel.

## Yang dibackup, dan yang tidak

| Ikut backup | Tidak ikut backup |
|---|---|
| Semua tabel aplikasi: to-do, goal, item goal, Issue Log, klien/partner, proyek, **225 entri Knowledge Base** | **Akun login** (`auth.users`), lihat langkah restore |
| Struktur tabel, policy RLS, fungsi, trigger | **Isi indeks pencarian** (`search_index`, hanya strukturnya). Bisa dibuat ulang lewat Settings → Reindex Search. **Token Google Calendar** (`google_connections`, hanya strukturnya): setelah restore klik "Connect Google Calendar" lagi |
|  | **File gambar KB** di Storage (±1.200 gambar). Sumbernya tetap file Word asli Rickie; simpan file itu |
|  | **File di Storage selain lampiran**: gambar KB (lihat atas). File lampiran **ikut backup tersendiri** (job `attachments`, di bawah), tetapi baru aktif setelah rahasia `SUPABASE_SERVICE_ROLE_KEY` dipasang |
| | Pengaturan project (Auth, domain, dsb.) |

## Cara kerja

- **Kapan:** setiap Senin 03:00 WIB. Bisa juga dijalankan manual (lihat "Uji").
- **Isi:** `pg_dump` schema `public`, dikompres, lalu dienkripsi AES-256 dengan passphrase.
- **Di mana:** artifact di tab **Actions** GitHub, disimpan **90 hari** (±12 backup mingguan).
- **Kenapa wajib terenkripsi:** repo ini **publik**, dan artifact bisa diunduh siapa saja yang login
  ke GitHub. Tanpa enkripsi, data klien akan terbuka. Passphrase tidak pernah ada di repo.
- **Kalau gagal:** GitHub mengirim email ke pemilik repo. Jangan diabaikan.

### File lampiran (job `attachments`)

Berjalan di workflow yang sama, pada jadwal yang sama, tetapi sebagai job terpisah (kegagalan satu tidak membatalkan yang lain).

- **Isi:** semua file di bucket `attachments` yang terdaftar di tabel `attachments`, ditambah `manifest.json` (nama asli,
  jenis, ukuran, induk, dan checksum SHA-256 tiap file). Dikemas `tar.gz` lalu dienkripsi AES-256 dengan **passphrase yang sama**
  dengan backup database.
- **Di mana:** artifact `attachments-…` di tab **Actions**, disimpan **30 hari** (±4 salinan; tiap salinan memuat semua file, bukan
  hanya yang baru).
- **Diperiksa:** tiap file harus ada dan ukurannya sama dengan yang tercatat. Bila ada yang hilang atau tidak cocok, job ditandai
  **gagal** (GitHub mengirim email), tetapi file yang berhasil tetap dikemas dan disimpan.
- **Batas ukuran:** 200 MB total (ubah lewat variabel `ATTACHMENT_BACKUP_MAX_MB` di workflow). Bila lampiran melewatinya, job
  gagal sebelum mengunduh dan tidak ada salinan. Kuota penyimpanan artifact GitHub terbatas; kalau lampiran makin besar, kurangi
  `retention-days` atau pertimbangkan penyimpanan lain.
- **Log publik:** repo ini publik, jadi log hanya memuat angka (jumlah file, MB), tidak pernah nama file atau jalur.

Selain itu, `/api/cron/keep-alive` dipanggil Vercel Cron tiap hari supaya project Supabase tidak
di-pause karena tidak aktif seminggu.

## Pengaturan satu kali (±10 menit)

### 1. Ambil connection string database
Supabase Dashboard → **Connect** → tab **Session pooler** → salin URI-nya
(bentuknya `postgresql://postgres.xxxxx:[PASSWORD]@aws-...pooler.supabase.com:5432/postgres`).
Ganti `[PASSWORD]` dengan password database. Lupa password? Database → Settings → Reset database password.

> Pakai **Session pooler**, bukan "Direct connection". GitHub Actions hanya IPv4, dan koneksi langsung
> Supabase hanya IPv6.

### 2. Buat passphrase
Buat kalimat acak yang **panjang** (≥ 20 karakter), lalu **simpan di password manager**.
**Kalau passphrase hilang, semua backup tidak bisa dibuka.** Tidak ada cara memulihkannya.

### 3. Simpan keduanya sebagai rahasia di GitHub
Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nama | Isi |
|---|---|
| `SUPABASE_DB_URL` | connection string dari langkah 1 (sudah berisi password) |
| `BACKUP_PASSPHRASE` | passphrase dari langkah 2 |

### 3b. Rahasia tambahan untuk backup lampiran
Backup lampiran perlu membaca Storage, yang dikunci RLS, jadi butuh kunci server. Tambahkan satu rahasia lagi di tempat yang sama:

| Nama | Isi |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → **Project Settings** → **API Keys** → kunci **service_role** (atau *secret*) → Reveal → salin. Isinya sama dengan variabel `SUPABASE_SERVICE_ROLE_KEY` di Vercel |

URL project dibaca otomatis dari `SUPABASE_DB_URL` (Session pooler). Bila koneksimu bukan Session pooler, tambahkan juga rahasia
`SUPABASE_URL` (mis. `https://xxxx.supabase.co`).

> Kunci ini **melewati RLS** (akses penuh ke seluruh data project). Rahasia GitHub tidak terbaca dari repo atau log, dan workflow
> hanya berjalan dari jadwal dan tombol manual (bukan dari pull request orang lain), tetapi perlakukan seperti `SUPABASE_DB_URL`:
> jangan ditempel di chat atau file mana pun. Tanpa rahasia ini, job `attachments` gagal dengan pesan yang jelas; backup database
> tidak terpengaruh.

### 4. (Disarankan) Amankan endpoint keep-alive
Vercel → project → **Settings** → **Environment Variables** → tambah `CRON_SECRET` berisi teks acak
panjang (Production). Vercel Cron otomatis memakainya. Tanpa ini endpoint tetap tidak berbahaya
(tidak mengembalikan data), hanya terbuka untuk dipanggil siapa saja.

## Uji (lakukan sekali setelah pengaturan)

1. Repo → tab **Actions** → **Backup database** → **Run workflow**.
2. Tunggu hijau (±1 menit). Buka run-nya: di bagian **Artifacts** ada `backup-…`.
3. Log menampilkan jumlah baris per tabel. Pastikan angkanya masuk akal (mis. `kb_entries` 225).
4. Unduh artifact dan coba buka (langkah "Membuka backup" di bawah) untuk memastikan passphrase benar.

## Membuka backup

Butuh `gpg` (Mac: `brew install gnupg`; Windows: Gpg4win; Linux: sudah ada).

```bash
# 1. unduh artifact dari tab Actions, ekstrak zip-nya, lalu:
gpg -d backup-2026-10-12.sql.gz.gpg | gunzip > backup.sql
# (diminta passphrase)
```

**Backup lampiran** (artifact `attachments-…`):

```bash
gpg -d attachments-2026-11-02.tar.gz.gpg | tar -xz -C lampiran-pulih
# hasil: lampiran-pulih/manifest.json dan lampiran-pulih/files/<uid>/<file>
```

Isinya dokumen dan screenshot klien dalam bentuk asli: **jangan unggah ke mana pun**, hapus folder setelah dipakai.

`backup.sql` berisi seluruh data Rickie dalam teks biasa: **jangan unggah ke mana pun**, hapus setelah dipakai.

## Restore (project baru atau data hilang)

File backup sudah berisi **struktur tabel + policy RLS + fungsi + data**, jadi **tidak perlu menjalankan
migrasi** lebih dulu (justru akan error "sudah ada"). Akun login tidak ikut backup, jadi data harus
dihubungkan ke akun **baru**:

1. Buat project Supabase **baru dan kosong**, lalu aktifkan ekstensi **pgvector**: Dashboard → Database → Extensions → cari `vector` → aktifkan (skema `extensions`, bawaan). **Wajib sebelum restore**: tabel `search_index` memakai tipe `vector`, dan tanpa ekstensi restore berhenti dengan error `type extensions.vector does not exist`. (Hanya data yang hilang di project lama? Lihat catatan di bawah.)
2. Daftar/login di situs yang menunjuk ke project baru supaya akun baru terbentuk. Ambil **User UID**-nya:
   Supabase Dashboard → Authentication → Users.
3. Cari UID **lama** di file backup. UID pengguna muncul di setiap baris data, jadi dialah UUID yang paling sering:
   ```bash
   grep -o "'[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}'" backup.sql \
     | sort | uniq -c | sort -rn | head -3
   ```
   Baris teratas = UID lama (angka di depannya jauh lebih besar dari yang lain).
4. Ganti UID lama dengan yang baru:
   ```bash
   sed "s/UID-LAMA/UID-BARU/g" backup.sql > restore.sql
   ```
5. Jalankan `restore.sql` di **SQL Editor** (tempel isinya), atau `psql "$SUPABASE_DB_URL" -f restore.sql`.
6. Buka situs, cek to-do, Goals, Issue Log, Clients, dan KB. Isi Search belum ada (indeks pencarian tidak ikut backup): buka **Settings → Reindex Search**; kalau ada pesan "N still waiting" tekan lagi setelah semenit, lalu tunggu kartu jumlahnya cocok.
7. **Lampiran:** buat ulang bucket `attachments` beserta policy-nya dengan menjalankan bagian Storage dari
   `supabase/migrations/0024_attachments.sql` di SQL Editor (dari `insert into storage.buckets` sampai tiga `create policy ... on storage.objects`;
   tabel `attachments` sendiri sudah pulih dari backup database, jangan dijalankan lagi). Lalu buka backup lampiran (di atas) dan jalankan, dengan UID yang sama seperti di langkah 3-4:
   ```bash
   SUPABASE_URL=https://PROJECT-BARU.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
     npx tsx scripts/restore-attachments.ts lampiran-pulih --from-uid UID-LAMA --to-uid UID-BARU
   ```
   Skrip memeriksa checksum tiap file sebelum mengunggah, mengganti folder pengguna pada jalur file (sama seperti UID di tabel), dan
   melewati file yang sudah ada, jadi aman dijalankan ulang. Ia mencetak jumlah file yang dipulihkan dan yang tidak bisa.
8. Unggah ulang gambar KB dari file Word asli (gambar KB tidak ikut backup). Pengaturan Auth (mis. matikan sign-up publik) juga harus diulang.

**Hanya isi tabel yang hilang, project lama masih ada?** Jangan jalankan `restore.sql` utuh: ia mencoba
membuat ulang tabel dan akan error. Ambil hanya baris `INSERT INTO "public"."nama_tabel"` untuk tabel yang
perlu dipulihkan (dan ganti UID bila akunnya juga berubah).

> Alur ini sudah diuji ujung ke ujung dengan data tiruan (semua migrasi 0001–0016): jumlah baris dan isi
> (termasuk teks multi-baris, tab, dan tanda kutip) identik setelah restore ke database kosong dengan pengguna
> berbeda, 0 galat, dan policy RLS, `search_path` fungsi, serta fungsi pencarian ikut pulih. Tanpa pgvector
> aktif lebih dulu, restore gagal di tipe `vector` (diuji juga).
> **Uji restore sungguhan ke project kosong setiap beberapa bulan.** Backup yang tidak pernah
> dicoba dipulihkan belum bisa dianggap backup.

## Batasan yang perlu diketahui

- Backup lampiran **belum diuji** di GitHub Actions asli maupun terhadap Supabase asli (diuji terhadap Supabase tiruan: unduh, kemas,
  enkripsi, buka, restore ke akun dengan UID baru). Setelah rahasia dipasang, jalankan **Run workflow** sekali, unduh artifact
  `attachments-…`, dan coba buka (lihat "Membuka backup"). Uji restore penuh ke project kosong tetap perlu dilakukan berkala.
- **Kehilangan data maksimal ±1 minggu** (sejak backup terakhir). Sebelum perubahan besar (mis. migrasi),
  jalankan manual lewat **Run workflow**, atau unduh **Export JSON** dari menu akun.
- GitHub menonaktifkan jadwal otomatis pada repo yang tidak ada aktivitas **60 hari**. Selama repo masih
  dipakai (commit/merge) ini tidak terjadi. Cek tab Actions kalau ragu.
- Artifact disimpan 90 hari. Mau lebih lama? Unduh sebulan sekali dan simpan di tempat pribadi
  (Drive pribadi, terenkripsi tetap aman).
- `SUPABASE_DB_URL` memakai akun `postgres` yang berhak penuh. Rahasia GitHub tidak bisa dibaca dari
  repo atau log, tapi siapa pun yang punya akses admin ke repo bisa memakainya. Repo ini hanya milik Rickie.
