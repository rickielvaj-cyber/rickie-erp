#!/usr/bin/env bash
# Backup terenkripsi file lampiran (bucket Storage `attachments`). Dipakai oleh .github/workflows/backup.yml.
#
#   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup-attachments.sh out/attachments.tar.gz.gpg
#
# Isi = dokumen dan screenshot kerja klien, jadi keluaran SELALU terenkripsi (AES-256, passphrase yang sama dengan backup
# database). Repo ini publik: jangan pernah menyimpan file mentah di repo, log, atau artifact.
set -euo pipefail

: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
out="${1:?Pemakaian: scripts/backup-attachments.sh FILE_KELUARAN.tar.gz.gpg}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Bila ada file yang gagal diunduh, skrip keluar dengan kode 1 TETAPI backup yang berhasil tetap dikemas; kodenya dikembalikan
# di akhir supaya workflow ditandai gagal (GitHub mengirim email) tanpa membuang file yang sudah aman.
rc=0
npx --no-install tsx scripts/backup-attachments.ts "$work/data" || rc=$?

if [ ! -f "$work/data/manifest.json" ]; then
  echo "GAGAL: tidak ada backup yang dihasilkan" >&2
  exit "${rc:-1}"
fi

mkdir -p "$(dirname "$out")"
# Passphrase lewat file descriptor, bukan argumen perintah (tidak muncul di daftar proses).
tar -czf - -C "$work/data" . | gpg --batch --yes --quiet --pinentry-mode loopback \
  --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$out" 3<<<"$BACKUP_PASSPHRASE"

echo "Backup lampiran terenkripsi: $out ($(wc -c < "$out") byte)"
exit "$rc"
