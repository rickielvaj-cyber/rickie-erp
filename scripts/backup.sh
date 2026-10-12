#!/usr/bin/env bash
# Backup terenkripsi database Supabase (schema public: semua tabel aplikasi + policy + fungsi).
# Dipakai oleh .github/workflows/backup.yml dan bisa dijalankan lokal untuk uji.
#
#   SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh out/backup.sql.gz.gpg
#
# Isi backup = data klien, jadi file keluaran SELALU terenkripsi (AES-256, passphrase).
# Repo ini publik: jangan pernah menyimpan dump mentah di repo, log, atau artifact.
# Yang TIDAK ikut: auth.users (akun login) dan file di Storage (gambar KB); lihat docs/BACKUP.md.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (connection string Session pooler)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
out="${1:?Pemakaian: scripts/backup.sh FILE_KELUARAN.sql.gz.gpg}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# --column-inserts: INSERT dengan nama kolom, tahan terhadap perbedaan urutan kolom saat restore.
# --no-owner/--no-privileges: restore dijalankan sebagai pemilik project baru.
pg_dump "$SUPABASE_DB_URL" \
  --schema=public --no-owner --no-privileges --column-inserts --quote-all-identifiers \
  --file="$tmp"

# Project Supabase baru sudah punya skema public; baris ini akan membuat restore berhenti dengan error.
sed -i '/^CREATE SCHEMA "public";$/d' "$tmp"

# Pemeriksaan kewarasan: dump yang kosong atau terpotong jangan sampai dianggap backup.
for table in todos goals goal_items issue_log clients kb_entries; do
  if ! grep -q "^CREATE TABLE \"public\"\.\"$table\"" "$tmp"; then
    echo "GAGAL: tabel $table tidak ada di dump" >&2
    exit 1
  fi
done
if [ "$(wc -c < "$tmp")" -lt 20000 ]; then
  echo "GAGAL: dump terlalu kecil, kemungkinan tidak lengkap" >&2
  exit 1
fi

# Ringkasan jumlah baris per tabel (hanya angka, tanpa isi data; log workflow publik).
echo "Jumlah baris di dump:"
for table in todos goals goal_items issue_log clients projects project_phases project_partners kb_entries; do
  printf '  %-16s %s\n' "$table" "$(grep -c "^INSERT INTO \"public\"\.\"$table\"" "$tmp" || true)"
done

mkdir -p "$(dirname "$out")"
# Passphrase lewat file descriptor, bukan argumen perintah (tidak muncul di daftar proses).
gzip -9 < "$tmp" | gpg --batch --yes --quiet --pinentry-mode loopback \
  --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$out" 3<<<"$BACKUP_PASSPHRASE"

echo "Backup terenkripsi: $out ($(wc -c < "$out") byte)"
