import { createAdminClient } from "@/lib/supabase/admin";
import { buildEntry, type ErrorEntry } from "@/lib/error-log";

// Penulis log galat (server saja). TIDAK PERNAH melempar galat dan tidak menahan respons lebih dari TIMEOUT_MS: pencatatan yang gagal hanya
// berakhir di console, supaya masalah di log tidak menambah masalah di halaman. Galat yang sama berturut-turut dalam beberapa detik di
// instance yang sama hanya ditulis sekali (database tetap menghitungnya lewat `occurrences` untuk yang lolos).

const TIMEOUT_MS = 3000;
const DEDUPE_MS = 5000;
const recent = new Map<string, number>();

/** Versi rilis singkat (7 huruf pertama commit) dari lingkungan Vercel; kosong di lokal. */
export const currentRelease = () => (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

export async function writeEntry(entry: ErrorEntry): Promise<void> {
  const now = Date.now();
  const last = recent.get(entry.fingerprint);
  if (last !== undefined && now - last < DEDUPE_MS) return;
  recent.set(entry.fingerprint, now);
  if (recent.size > 200) for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);

  try {
    const admin = createAdminClient();
    const write = admin.rpc("log_error", {
      p_fingerprint: entry.fingerprint,
      p_source: entry.source,
      p_route: entry.route,
      p_method: entry.method,
      p_name: entry.name,
      p_message: entry.message,
      p_stack: entry.stack,
      p_digest: entry.digest,
      p_release: entry.release,
    });
    const result = await Promise.race([write, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS))]);
    if (result === "timeout") console.error("[error-log] write timed out");
    else if (result.error) console.error(`[error-log] write failed: ${result.error.message}`);
  } catch (error) {
    console.error(`[error-log] write skipped: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

/** Catat satu galat dari kode server (mis. di balik try/catch yang menelan galat). Aman dipanggil di mana saja; tidak melempar. */
export async function reportError(error: unknown, where: string): Promise<void> {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const entry = buildEntry({ source: "server", route: where, name: e.name, message: e.message, stack: e.stack, digest: (e as { digest?: string }).digest, release: currentRelease() });
  if (entry) await writeEntry(entry);
}
