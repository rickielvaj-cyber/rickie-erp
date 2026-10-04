Kompilasi error nyata yang ditemuin selama eksplorasi sistem (Juni–Juli 2026), dikumpulin dari catatan modul FA, GL, Inventory Accounting, AP, dan Digital Modeling.

## Ringkasan Cepat

**Insight Pola Umum**

Dari 7 kasus di atas, ada 1 pola yang paling sering muncul: **SEQUENCING**. Banyak modul YonSuite (FA, GL, Inventory) nerapin prinsip "nggak bisa lompat step" — proses bulan berjalan butuh proses bulan sebelumnya udah selesai duluan, dan undo/cancel harus dimulai dari langkah PALING AKHIR, bukan dari awal. Kalau ketemu error baru yang bunyinya soal "periode", "status check", atau "belum di-review/belum diproses", curigai dulu ini soal urutan sebelum nyari penyebab lain.

| No | Modul | Error Singkat | Kategori |
| --- | --- | --- | --- |
| 1 | FA / GL | Disposal convention is not defined for this year | Setup Belum Lengkap |
| 2 | FA / GL | 期间级检查未通过：折旧计提状态检查 (Depreciation Accrual belum jalan) | Sequencing |
| 3 | GL | P&L account (660107) nggak mau balik ke 0 | Setup Belum Lengkap |
| 4 | Inventory Acct. | 该账簿已期初审核，请取消审核后重新操作 (Cancel Inventory Opening) | Cancel/Undo Blocked |
| 5 | Inventory Acct. | 该期间已成本计算，不能取消关账 (Reversal Chain Period-Lock) | Sequencing |
| 6 | Inventory Acct. | 无期初数据 (tidak ada data opening) | Setup Belum Lengkap |
| 7 | AP | Generate Event Entry gagal / voucher nggak kebentuk | Konfigurasi |
| 8 | Digital Modeling | Company Entity nggak muncul di dropdown | Authorization |

<div class="issue-card" data-category="sequencing">

## Kategori 1 — Sequential Lock / Urutan (Sequencing)

### 1.1 Depreciation Accrual belum jalan di periode sebelumnya

**Modul:** FA & GL

**Error:** 期间级检查未通过：折旧计提状态检查 — transaksi aset di bulan berjalan (misal Juli) ke-block karena bulan sebelumnya (Juni) belum menjalankan Depreciation Accrual.

**Akar masalah:** Perhitungan penyusutan bulan berjalan butuh angka akumulasi dari bulan sebelumnya sebagai basis — nggak bisa lompat.

**Solusi:** Buka menu Depreciation Accrual, pilih periode yang ketinggalan (Juni) → Calculate → Review → Post. Baru bulan berikutnya bisa lanjut.

</div>

<div class="issue-card" data-category="sequencing">

### 1.2 Reversal Chain — cancel Period-Lock Inventory butuh beberapa layer

**Modul:** Inventory Accounting

**Error:** "该期间已成本计算，不能取消关账" (nggak bisa cancel period-lock karena Cost Calculation udah jalan) → lanjut ke "该期间已经过账到事项分录，不能取消成本计算" (nggak bisa cancel Cost Calculation karena hasilnya udah ke-posting ke GL).

**Akar masalah:** Undo harus dari langkah PALING AKHIR dulu — kebalikan dari forward flow (Opening → Period-Lock → Cost Calculation → Posting GL).

**Solusi:** Urutan cancel yang benar: reverse posting GL dulu → baru cancel Cost Calculation → baru cancel Period-Lock.

⚠ Area sensitif — udah nyentuh voucher GL yang mungkin kepake laporan lain. Jangan cancel sendiri tanpa konfirmasi.

</div>

<div class="issue-card" data-category="setup">

## Kategori 2 — Master Data / Setup Belum Lengkap

### 2.1 Disposal Convention belum di-extend buat tahun berjalan

**Modul:** FA & GL

**Error:** "The disposal convention is not defined for this year. Failed to obtain the depreciation start date. Please check the enabling date and depreciation convention."

**Akar masalah:** Ada 2 setting terpisah yang harus di-extend per tahun: (1) Accounting Period di node Fiscal Period, dan (2) Allocation/Depreciation Convention di node Allocation Practice. Kalau tahun berjalan (misal 2026) belum di-extend di salah satu/keduanya, aset baru nggak bisa didaftarin.

**Solusi:** Masuk ke Accounting Period → "Add Period" sampai tahun yang dimaksud. Lalu ke Allocation Convention → edit convention yang ada → "Add Next Year" buat nambahin Allocation Date tahun tersebut.

</div>

<div class="issue-card" data-category="setup">

### 2.2 P&L account nggak mau balik ke 0 pas closing

**Modul:** GL

**Error:** 损益类科目金额和数量的余额是否为0检查 — salah satu akun P&L (contoh: 660107 Selling Expense_Asset Depreciation) masih nyisa saldo di akhir periode.

**Akar masalah:** Akun Revenue/Expense harus balik ke 0 tiap akhir periode (saldo dipindah ke akun Current Year Profit) — proses ini disebut P&L Carry-Forward, dan belum dijalankan.

**Solusi:** Setup 1x di awal: GL Parameter (GL0013) → tentuin frekuensi Monthly/Annual; Rule Voucher Definition → bikin rule dengan Business Type "Gain/Loss Carry-forward", Definition Method "Quick Selection", Profit Account "Current Year Profits", Carry-forward Method "Centralized". Tiap periode tinggal jalanin di menu Closing–Carry Forward → pilih rule → generate voucher.

</div>

<div class="issue-card" data-category="setup">

### 2.3 Gagal pull Inventory Opening Data — "tidak ada data opening"

**Modul:** Inventory Accounting

**Error:** 无期初数据 (tidak ada data opening) — sistem nggak nemu dokumen Inventory Opening yang memenuhi kriteria.

**Akar masalah:** Ada 6 syarat sekaligus yang harus semuanya lolos: (1) tanggal dokumen lebih awal dari tanggal aktivasi Inventory, (2) Transaction Type = "Opening Stock-In", (3) Cost Domain sudah dibuat buat Warehouse Organization terkait & lebih awal dari tanggal dokumen, (4) Warehouse Profile dicentang "Participate in Cost Calculation", (5) Item Master → Value Management Mode di-set ke "Inventory Accounting" (bukan cuma quantity tracking), (6) Transaction Type di-set ke "Update Inventory Cost". Kalau satu aja nggak terpenuhi, hasil retrieve kosong.

**Solusi:** Cek satu-satu ke-6 syarat di atas. Yang paling sering kelewat: Item Master (Value Management Mode) dan Cost Domain — karena keduanya setup di level master data (digital modelling), jadi kalau kelewat, SEMUA dokumen yang pakai item/warehouse itu ikut gagal.

</div>

<div class="issue-card" data-category="cancel-undo">

## Kategori 3 — Cancel/Undo Blocked

### 3.1 Gagal cancel Inventory Opening yang udah di-review

**Modul:** Inventory Accounting

**Error:** 该账簿已期初审核，请取消审核后重新操作 — gagal narik ulang data Inventory Opening karena Account Book itu sudah melewati proses Review (审核).

**Akar masalah:** Data yang udah di-review dianggap final, sistem block kalau mau ditarik ulang tanpa dibatalin dulu.

**Solusi:** Cari tombol "取消审核" (Cancel Review) di layar yang sama, baru bisa retrieve data lagi.

</div>

<div class="issue-card" data-category="konfigurasi">

## Kategori 4 — Error Konfigurasi (Event Entry / Voucher Generation)

### 4.1 Generate Event Entry gagal / voucher nggak kebentuk (AP)

**Modul:** AP

Ini bukan 1 error spesifik, tapi checklist troubleshooting umum kalau Generate Event Entry di AP bermasalah — cek dulu pesan errornya, baru cocokkan ke 3 penyebab paling umum berikut:

- **Event Template** — sering kejadian karena template di-copy paste dari template lain, bagian Voucher Type-nya kadang ketinggalan nggak di-link ulang.
- **Business Dimension Analysis** — harus di-setting di account-nya COA. Kadang dimension ini di-enable tapi ada node yang sebenernya nggak butuh field itu diisi, jadi bentrok.
- **Account Cross-Reference** belum di-setup — A/P/AR Target Account (bisa dari purchase) belum "dikawinkan" pakai Account Cross-Reference.

</div>

<div class="issue-card" data-category="authorization">

## Kategori 5 — Authorization & Access Permission

### 5.1 Company Entity nggak muncul di pilihan (COA, Purchasing, Sales, dll)

**Modul:** Digital Modeling (Authorization) — berdampak lintas modul

**Error:** Nama company entity/organization nggak muncul di dropdown pilihan pas mau melakukan operasional — misal bikin COA baru, atau transaksi Purchasing/Sales.

**Akar masalah:** Ini bukan soal data entity-nya hilang/salah setup, tapi soal PERMISSION user. Role yang di-assign ke user yang lagi dipakai belum ada centang buat entity tersebut di bagian Organizational Permission-nya — jadi sistem nganggep user itu nggak berhak akses/lihat entity itu.

**Solusi:** Cek ke Digital Modeling → Authorization → buka role yang di-assign ke user → bagian Organizational Permission → pastikan entity yang dimaksud udah tercentang. Setelah dicentang, entity itu baru muncul di pilihan dropdown di modul manapun (COA, Purchasing, Sales, dll).

⚠ Pola beda dari kategori 1-4: ini bukan soal urutan proses atau data yang belum lengkap, tapi soal HAK AKSES. Kalau ketemu kasus "field/pilihan yang seharusnya ada tapi nggak muncul" (bukan error message eksplisit), curigai dulu ini soal permission/authorization sebelum nyari penyebab di data/konfigurasi modul terkait.

</div>

## Catatan Pemakaian File Ini

File ini digabung dari 4 sumber catatan modul (FA, GL, Inventory Accounting, AP) — beberapa kasus (Disposal Convention & Depreciation Accrual) muncul di 2 modul sekaligus karena dampaknya nyambung ke closing GL. Kalau ketemu error baru di lapangan, tambahin ke kategori yang paling sesuai di atas biar pattern-nya makin kelihatan dari waktu ke waktu.

**Cara nambah entri baru:** copy salah satu blok `<div class="issue-card" data-category="...">...</div>` di atas, taruh di kategori yang sesuai, ganti isinya. Kategori yang valid: `sequencing`, `setup`, `cancel-undo`, `konfigurasi`, `authorization`.
