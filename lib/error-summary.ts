import { createAdminClient } from "@/lib/supabase/admin";

export type ErrorSummary = { available: false } | { available: true; total: number; last24h: number; occurrences24h: number };

/** Ringkasan log galat untuk Settings dan Beranda. Tabel belum ada atau kunci tidak diatur = tidak tersedia (tidak pernah melempar). */
export async function getErrorSummary(): Promise<ErrorSummary> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [all, recent] = await Promise.all([
      admin.from("error_log").select("id", { count: "exact", head: true }),
      admin.from("error_log").select("occurrences").gte("last_seen", since).limit(500),
    ]);
    if (all.error || recent.error) return { available: false };
    const rows = recent.data ?? [];
    return { available: true, total: all.count ?? 0, last24h: rows.length, occurrences24h: rows.reduce((n, r) => n + r.occurrences, 0) };
  } catch {
    return { available: false };
  }
}
