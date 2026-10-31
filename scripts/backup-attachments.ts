/**
 * Unduh semua file lampiran dari Supabase Storage ke satu folder (beserta manifest.json), untuk dikemas terenkripsi oleh
 * scripts/backup-attachments.sh. Daftar file diambil dari tabel `attachments` (yang terdaftar di aplikasi).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_DB_URL=... npx tsx scripts/backup-attachments.ts DIR
 *
 * Butuh: SUPABASE_SERVICE_ROLE_KEY dan salah satu dari SUPABASE_URL atau SUPABASE_DB_URL (URL project dibaca dari nama pengguna
 * Session pooler). Service role melewati RLS: jangan dibagikan.
 *
 * Log workflow bersifat PUBLIK: skrip ini hanya mencetak angka, tidak pernah nama file, jalur, atau isi.
 * Keluar dengan kode 1 bila ada file yang hilang/ukurannya tidak cocok (backup tetap ditulis, supaya yang berhasil tidak terbuang)
 * atau bila total ukuran melewati batas (ATTACHMENT_BACKUP_MAX_MB, bawaan 200).
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ATTACHMENT_BUCKET,
  describeSummary,
  isSafeStoragePath,
  overBudget,
  projectUrl,
  sha256,
  summarize,
  type Manifest,
  type ManifestFile,
} from "../lib/attachment-backup";

const PAGE = 1000;
const CONCURRENCY = 4;
const ATTEMPTS = 3;

type Row = Omit<ManifestFile, "sha256" | "status">;

async function main() {
  const dir = process.argv[2];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = projectUrl({ SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_DB_URL: process.env.SUPABASE_DB_URL });
  if (!dir) fail("Usage: npx tsx scripts/backup-attachments.ts DIR");
  if (!key) fail("SUPABASE_SERVICE_ROLE_KEY is not set (add it as a GitHub Actions secret; see docs/BACKUP.md).");
  if (!url) fail("Cannot work out the Supabase project URL. Set SUPABASE_URL, or use the Session pooler connection string in SUPABASE_DB_URL.");

  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("attachments")
      .select("id, storage_path, file_name, mime_type, size_bytes, issue_id, kb_entry_id, note_id, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) fail(`Could not read the attachments table: ${error.message}`);
    rows.push(...(data as Row[]));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const planned = rows.reduce((sum, r) => sum + r.size_bytes, 0);
  const budget = overBudget(planned, process.env.ATTACHMENT_BACKUP_MAX_MB);
  console.log(`Attachments listed: ${rows.length} (${(planned / 1_048_576).toFixed(1)} MB).`);
  if (budget.over) fail(`Attachments are larger than the ${budget.limitMb} MB backup limit. Raise ATTACHMENT_BACKUP_MAX_MB or clean up files.`);

  await mkdir(join(dir, "files"), { recursive: true });
  const files: ManifestFile[] = new Array(rows.length);

  async function one(i: number) {
    const row = rows[i];
    const base = { ...row, sha256: null as string | null };
    if (!isSafeStoragePath(row.storage_path)) {
      files[i] = { ...base, status: "unsafe_path" };
      return;
    }
    let bytes: Uint8Array | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS && !bytes; attempt++) {
      const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).download(row.storage_path);
      if (data && !error) bytes = new Uint8Array(await data.arrayBuffer());
      else if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    if (!bytes) {
      files[i] = { ...base, status: "missing" };
      return;
    }
    const target = join(dir, "files", row.storage_path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    files[i] = { ...base, sha256: sha256(bytes), status: bytes.length === row.size_bytes ? "ok" : "size_mismatch" };
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (next < rows.length) await one(next++);
    }),
  );

  const manifest: Manifest = { app: "personal-workspace-attachments", version: 1, exported_at: new Date().toISOString(), files };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const summary = summarize(files);
  console.log(describeSummary(summary));
  if (summary.problems > 0) {
    console.error("FAILED: some attachment files could not be saved. The backup contains the rest; check Storage.");
    process.exit(1);
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Attachment backup failed.");
  process.exit(1);
});
