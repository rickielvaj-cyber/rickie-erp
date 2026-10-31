/**
 * Kembalikan file lampiran dari backup (yang sudah dibuka: lihat docs/BACKUP.md) ke bucket Storage `attachments`.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/restore-attachments.ts DIR [--from-uid UID-LAMA --to-uid UID-BARU]
 *
 * DIR = folder hasil ekstrak (berisi manifest.json dan folder files/). Bila akun baru punya UID berbeda, beri --from-uid dan
 * --to-uid: folder pengguna pada jalur file diganti, sama seperti baris tabel `attachments` yang diganti UID-nya saat restore database.
 * Checksum tiap file diperiksa sebelum diunggah. File yang sudah ada dilewati (aman dijalankan ulang).
 * Jalankan setelah restore database dan setelah bucket `attachments` dibuat (docs/BACKUP.md). Hanya angka yang dicetak.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ATTACHMENT_BUCKET, isSafeStoragePath, parseManifest, remapPath, sha256 } from "../lib/attachment-backup";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dir = process.argv[2];
  const fromUid = arg("--from-uid");
  const toUid = arg("--to-uid");
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!dir || dir.startsWith("--")) fail("Usage: npx tsx scripts/restore-attachments.ts DIR [--from-uid OLD --to-uid NEW]");
  if (!url || !key) fail("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  if (Boolean(fromUid) !== Boolean(toUid)) fail("Give both --from-uid and --to-uid, or neither.");

  const parsed = parseManifest(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
  if (!parsed.ok) fail(parsed.error);

  const db = createClient(url, key, { auth: { persistSession: false } });
  let uploaded = 0;
  let skipped = 0;
  let bad = 0;

  for (const f of parsed.manifest.files) {
    if (f.status !== "ok" || !isSafeStoragePath(f.storage_path)) {
      bad++;
      continue;
    }
    const bytes = new Uint8Array(await readFile(join(dir, "files", f.storage_path)));
    if (bytes.length !== f.size_bytes || sha256(bytes) !== f.sha256) {
      bad++;
      continue;
    }
    const target = fromUid && toUid ? remapPath(f.storage_path, fromUid, toUid) : f.storage_path;
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(target, bytes, { contentType: f.mime_type, upsert: false });
    if (!error) uploaded++;
    else if (/already exists|duplicate/i.test(error.message)) skipped++;
    else fail(`Upload failed (${uploaded} done so far): ${error.message}`);
  }

  console.log(`Restored ${uploaded} files, ${skipped} already there, ${bad} not restorable (missing, damaged or unsafe in the backup).`);
  if (bad > 0) process.exit(1);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Restore failed.");
  process.exit(1);
});
