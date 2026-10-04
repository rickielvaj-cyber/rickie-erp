# Catatan Belajar ERP YonSuite

Situs statis pribadi untuk catatan belajar YonSuite ERP (PT Yonyou Network Indonesia) — Digital Modeling, AACT/COA, Purchasing, Sales, Inventory, AP, AR, Fixed Asset, Inventory Accounting, GL, dan Issue Log troubleshooting.

**Live site:** diaktifkan lewat GitHub Pages (lihat Settings → Pages di repo ini).

## Struktur

```
index.html              shell aplikasi (sidebar, search, router)
assets/css/style.css     semua styling (tema merah/biru x terang/gelap)
assets/js/app.js         routing, render markdown, search, filter issue log
assets/js/editor.js      editor in-browser (GitHub Contents API, password gate)
assets/js/vendor/marked.js   markdown parser (MIT, https://github.com/markedjs/marked)
content/manifest.json    daftar modul, urutan belajar, kategori issue log
content/*.md             satu file markdown per modul
content/images/<slug>/   screenshot & file upload per modul
```

## Cara nambah / update konten

Situs ini merender markdown langsung di browser (tidak ada build step) — tinggal edit,
commit, push, dan GitHub Pages otomatis update.

- **Update catatan modul yang sudah ada:** edit langsung file `content/<slug>.md`.
- **Tambah modul baru:**
  1. Buat file baru `content/<slug-baru>.md`.
  2. Tambahkan entri baru di `content/manifest.json` (`modules` dan `learningPath`).
- **Tambah entri Issue Log baru:** buka `content/issue-log.md`, copy salah satu blok
  `<div class="issue-card" data-category="...">...</div>` yang sudah ada, taruh di kategori
  yang sesuai. Kategori valid: `sequencing`, `setup`, `cancel-undo`, `konfigurasi`, `authorization`.
- **Tambah gambar/screenshot:** taruh file image di `content/images/<slug>/`, referensikan
  di markdown dengan `![alt](images/<slug>/nama-file.png)`.

## Menjalankan lokal

Situs ini murni HTML/CSS/JS statis, tidak butuh build tool. Jalankan server statis apa saja, contoh:

```bash
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Palet warna & tema

Pengunjung bisa pilih tema sendiri lewat tombol **Tema** di topbar: warna (Merah/Yonyou
atau Biru) x mode (Terang/Gelap/Ikuti Sistem) — 4 kombinasi total, tersimpan di
localStorage browser masing-masing. Semua warna didefinisikan sebagai CSS custom
properties di `assets/css/style.css` (4 blok `:root[data-palette=...][data-theme=...]`),
gampang disesuaikan atau ditambah palet baru di situ.

## Edit langsung dari browser (tanpa Claude Code)

Tiap halaman modul & Issue Log punya tombol **Edit** di pojok kanan atas. Ini editor
markdown + live preview yang commit langsung ke GitHub lewat GitHub Contents API —
nggak perlu sentuh terminal/Claude Code buat update konten sehari-hari.

**Setup sekali per browser/device** (cuma pemilik repo yang perlu ini):

1. Buat **GitHub fine-grained personal access token**: GitHub → Settings →
   Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Resource owner: `rickielvaj-cyber`
   - Repository access: **Only select repositories** → pilih `Beginner-ERP-Guide`
   - Permissions: **Contents → Read and write** (yang lain biarin default/no access)
2. Klik tombol **Edit** di situs → masukin token itu + bikin password editor sendiri.
   Keduanya cuma tersimpan di `localStorage` browser itu — nggak pernah ke-commit ke
   repo atau kekirim ke server manapun selain langsung ke `api.github.com`.
3. Selesai setup, tiap klik **Edit** berikutnya cuma perlu password (bukan token lagi).

**Catatan penting soal keamanan:** token disimpan di localStorage browser kamu — siapapun
yang punya akses ke browser profile itu (devtools) bisa lihat token-nya. Makanya token-nya
di-scope CUMA ke repo ini dengan izin Contents doang, bukan token akses penuh akun GitHub
kamu — supaya kalaupun bocor, dampaknya terbatas cuma bisa edit isi repo ini aja. Kalau mau
cabut akses, tinggal revoke token itu dari GitHub Settings kapan aja.

Upload gambar (PNG/SVG) otomatis ke-insert inline di kursor, PDF jadi link download. File
naik ke `content/images/<slug>/`. Setelah Simpan & Publish, tampilan situs langsung
ke-update (pakai isi yang baru disimpan), tapi butuh 1-2 menit sampai GitHub Pages selesai
rebuild versi publiknya.

## Kalau situs kelihatan belum ke-update setelah push

Browser kadang nge-cache `app.js`/`style.css` versi lama walau `index.html` sudah baru.
Kalau ganti isi `assets/js/app.js` atau `assets/css/style.css` dan situsnya kelihatan
belum berubah setelah push + hard refresh, naikkan angka `?v=` di tag `<link>`/`<script>`
pada `index.html` (misal `?v=3` → `?v=4`) — itu maksa browser ambil file yang baru.
