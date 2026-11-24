import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTimeWIB } from "@/lib/date";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { ErrorLogRow } from "@/lib/types";
import { clearErrorLog, deleteErrorLogRow } from "../error-actions";

export const metadata = { title: "Error log" };
export const dynamic = "force-dynamic";

const badge = "rounded-full border px-2 py-0.5 text-xs";
// Di luar komponen: Date.now() tidak boleh dipanggil saat render.
const hoursAgo = (h: number) => Date.now() - h * 3600 * 1000;

export default async function ErrorLogPage() {
  let rows: ErrorLogRow[] = [];
  let unavailable: string | null = null;
  try {
    const { data, error } = await createAdminClient().from("error_log").select("*").order("last_seen", { ascending: false }).limit(200);
    if (error) unavailable = error.message;
    else rows = data ?? [];
  } catch (error) {
    unavailable = error instanceof Error ? error.message : "Unavailable";
  }
  const since = hoursAgo(24);
  const recent = rows.filter((r) => new Date(r.last_seen).getTime() >= since);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/settings" className="text-sm text-muted underline underline-offset-4 hover:text-foreground">
        ‹ Settings
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Error log</h1>
          <p className="mt-1 text-base text-muted">
            Errors this site hit, kept for 30 days (500 at most). The same error is counted, not repeated. Only the route, the message (tokens, emails and long
            secrets blanked out) and the stack are stored: never request contents, cookies or your data.
          </p>
        </div>
        {rows.length > 0 && (
          <form action={clearErrorLog}>
            <ConfirmButton
              label="Clear all"
              confirmText="Delete the whole error log? This cannot be undone."
              className="rounded-full border border-border-strong px-4 py-2 text-sm transition-colors hover:border-danger hover:text-danger"
            />
          </form>
        )}
      </div>

      {unavailable !== null ? (
        <p role="status" className="mt-8 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          The error log is not available yet ({unavailable}). It starts working once migration 0034 is applied.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center text-base text-subtle">No errors recorded. Nice.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {rows.length} distinct error{rows.length === 1 ? "" : "s"} · {recent.length} seen in the last 24 hours
          </p>
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-background p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-danger">{r.name}</span>
                  <span className={`${badge} border-border text-muted`}>{r.source}</span>
                  {r.occurrences > 1 && <span className={`${badge} border-warning/30 bg-warning-soft text-warning-ink`}>×{r.occurrences}</span>}
                  <span className="ml-auto text-xs text-muted">last {formatDateTimeWIB(r.last_seen)} WIB</span>
                </div>
                <p className="mt-2 break-words text-base">{r.message || "(no message)"}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted">
                  {r.method ? `${r.method} ` : ""}
                  {r.route || "(no route)"}
                </p>
                <p className="mt-1 text-xs text-subtle">
                  first {formatDateTimeWIB(r.first_seen)}
                  {r.release ? ` · release ${r.release}` : ""}
                  {r.digest ? ` · digest ${r.digest}` : ""}
                </p>
                {r.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted underline underline-offset-4">Stack</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface p-3 text-xs leading-relaxed">{r.stack}</pre>
                  </details>
                )}
                <form action={deleteErrorLogRow.bind(null, r.id)} className="mt-3">
                  <button type="submit" className="text-xs text-muted underline underline-offset-4 hover:text-danger">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
