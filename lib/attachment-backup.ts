import { createHash } from "node:crypto";

// Bagian murni dari backup file lampiran (scripts/backup-attachments.ts dan scripts/restore-attachments.ts): validasi jalur,
// manifest, ringkasan, batas ukuran. Tanpa jaringan dan tanpa disk supaya mudah diuji.

export const ATTACHMENT_BUCKET = "attachments";
export const DEFAULT_MAX_MB = 200;

export type FileStatus = "ok" | "missing" | "size_mismatch" | "unsafe_path";

export type ManifestFile = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  issue_id: string | null;
  kb_entry_id: string | null;
  note_id: string | null;
  created_at: string;
  status: FileStatus;
};

export type Manifest = {
  app: "personal-workspace-attachments";
  version: 1;
  exported_at: string;
  files: ManifestFile[];
};

/** URL project Supabase: SUPABASE_URL bila diisi; kalau tidak, dari nama pengguna Session pooler (`postgres.<ref>`). */
export function projectUrl(env: { SUPABASE_URL?: string; SUPABASE_DB_URL?: string }): string | null {
  const explicit = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const db = env.SUPABASE_DB_URL?.trim();
  if (!db) return null;
  const ref = /^postgres(?:ql)?:\/\/postgres\.([a-z0-9]{10,40})[:@]/.exec(db)?.[1];
  return ref ? `https://${ref}.supabase.co` : null;
}

/**
 * Jalur objek aman untuk ditulis ke disk: `<uid>/<nama>.<ext>` tanpa `..`, jalur absolut, backslash, atau segmen kosong.
 * Aplikasi hanya membuat jalur seperti itu; hal lain di tabel dianggap tidak aman dan tidak ditulis.
 */
export function isSafeStoragePath(path: string): boolean {
  if (path.length === 0 || path.length > 300 || path.includes("\\") || path.startsWith("/")) return false;
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  return parts.every((p) => p !== "" && p !== "." && p !== ".." && /^[A-Za-z0-9._-]+$/.test(p));
}

export const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** Ganti folder pengguna lama dengan yang baru (untuk restore ke akun baru). Jalur dengan folder lain dibiarkan. */
export function remapPath(path: string, fromUid: string, toUid: string): string {
  const [first, ...rest] = path.split("/");
  return first === fromUid ? [toUid, ...rest].join("/") : path;
}

export type Summary = { total: number; ok: number; problems: number; bytes: number; byStatus: Record<FileStatus, number> };

export function summarize(files: Pick<ManifestFile, "status" | "size_bytes">[]): Summary {
  const byStatus: Record<FileStatus, number> = { ok: 0, missing: 0, size_mismatch: 0, unsafe_path: 0 };
  let bytes = 0;
  for (const f of files) {
    byStatus[f.status] += 1;
    if (f.status === "ok") bytes += f.size_bytes;
  }
  return { total: files.length, ok: byStatus.ok, problems: files.length - byStatus.ok, bytes, byStatus };
}

/** Satu baris ringkasan untuk log (publik): hanya angka, tanpa nama file atau jalur. */
export function describeSummary(s: Summary): string {
  const mb = (s.bytes / 1_048_576).toFixed(1);
  const parts = [`${s.ok}/${s.total} files saved (${mb} MB)`];
  if (s.byStatus.missing) parts.push(`${s.byStatus.missing} missing in Storage`);
  if (s.byStatus.size_mismatch) parts.push(`${s.byStatus.size_mismatch} with unexpected size`);
  if (s.byStatus.unsafe_path) parts.push(`${s.byStatus.unsafe_path} with an unsafe path (skipped)`);
  return parts.join(", ");
}

/** Batas ukuran total sebelum mengunduh. maxMb tidak valid -> bawaan. */
export function overBudget(totalBytes: number, maxMb: string | number | undefined): { over: boolean; limitMb: number } {
  const parsed = Number(maxMb);
  const limitMb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_MB;
  return { over: totalBytes > limitMb * 1_048_576, limitMb };
}

/** Periksa manifest hasil dekripsi sebelum dipakai restore. */
export function parseManifest(raw: unknown): { ok: true; manifest: Manifest } | { ok: false; error: string } {
  const m = raw as Partial<Manifest> | null;
  if (!m || m.app !== "personal-workspace-attachments" || m.version !== 1 || !Array.isArray(m.files)) {
    return { ok: false, error: "This is not an attachments backup manifest." };
  }
  for (const f of m.files) {
    if (typeof f?.storage_path !== "string" || typeof f.size_bytes !== "number" || typeof f.mime_type !== "string") {
      return { ok: false, error: "The manifest has an entry that cannot be read." };
    }
  }
  return { ok: true, manifest: m as Manifest };
}
