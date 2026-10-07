#!/usr/bin/env bash
# Cek bahwa TANPA login, tidak ada data yang bisa dibaca lewat API Supabase.
#
# Cuma membaca (GET) pakai anon key — anon key memang publik, jadi aman. Tidak menulis apa pun.
# Pakai: bash scripts/verify-rls.sh   (butuh .env.local berisi URL + anon key)

set -u
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL belum diisi (.env.local)}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi (.env.local)}"

fail=0
for table in todos issue_log goals goal_items kb_entries; do
  body=$(mktemp)
  code=$(curl -s -o "$body" -w '%{http_code}' \
    "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$table?select=id&limit=1" \
    -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY")
  content=$(tr -d '[:space:]' < "$body")
  rm -f "$body"

  if [ "$code" = "200" ] && [ "$content" = "[]" ]; then
    echo "OK     $table: anon mendapat 0 baris"
  elif [ "$code" = "200" ]; then
    echo "BOCOR  $table: anon BISA membaca data! (HTTP 200)"; fail=1
  elif [ "$code" = "404" ]; then
    echo "SKIP   $table: tabel belum ada (migrasinya belum dijalankan?)"
  else
    echo "OK     $table: ditolak (HTTP $code)"
  fi
done

[ "$fail" = "0" ] && echo "Semua tabel aman dari akses tanpa login." || { echo "ADA TABEL BOCOR — cek policy RLS."; exit 1; }
