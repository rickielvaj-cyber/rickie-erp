import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, formatDate } from "@/lib/date";
import { groupByMonth, statsFromSummaryText } from "@/lib/summary-history";
import { monthTitle } from "@/lib/summary";

export default async function SummaryHistoryPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_summaries")
    .select("week_start, summary_text, updated_at")
    .order("week_start", { ascending: false })
    .limit(300);

  const rows = data ?? [];
  const groups = groupByMonth(rows);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight">Summary History</h1>
      <p className="mt-1 text-base text-muted">
        Weekly summaries you saved. <Link href="/summary" className="underline underline-offset-4">Back to this week</Link>
      </p>

      {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load history: {error.message}</p>}

      {rows.length === 0 && !error && (
        <p className="mt-8 rounded-2xl border border-border px-5 py-8 text-center text-base text-muted">
          Nothing saved yet. Open a week in Weekly Summary and press Save to keep it here.
        </p>
      )}

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group.month} aria-label={monthTitle(group.month)}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">{monthTitle(group.month)}</h2>
              <Link href={`/summary/monthly?month=${group.month}`} className="text-sm underline underline-offset-4 hover:text-muted">
                Monthly recap
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
              {group.rows.map((row) => {
                const stats = statsFromSummaryText(row.summary_text);
                const parts = [
                  stats.tasks !== null ? `${stats.tasks} tasks` : null,
                  stats.issues !== null ? `${stats.issues} ${stats.issues === 1 ? "issue" : "issues"}` : null,
                  stats.blocked ? `${stats.blocked} blocked` : null,
                ].filter(Boolean);
                return (
                  <li key={row.week_start}>
                    <Link href={`/summary?week=${row.week_start}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3 hover:bg-surface">
                      <span className="font-medium">
                        {formatDate(row.week_start)} – {formatDate(addDaysISO(row.week_start, 4))}
                      </span>
                      <span className="text-sm text-muted">{parts.length > 0 ? parts.join(" · ") : "edited text"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
