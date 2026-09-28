import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentWeekRange, formatDateID, last7DaysRange, nextWeekRange } from "@/lib/date";
import { CopySummaryButton } from "@/components/CopySummaryButton";

type SearchParams = { mode?: string };

function groupCount(values: (string | null)[], fallbackLabel: string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value ?? fallbackLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const mode = params.mode === "last7" ? "last7" : "week";
  const range = mode === "last7" ? last7DaysRange() : currentWeekRange();
  const nextWeek = nextWeekRange();

  const supabase = await createClient();

  const [{ data: resolvedIssues }, { data: doneTodos }, { data: upcomingTodos }] = await Promise.all([
    supabase
      .from("issue_log")
      .select("id, title, category, client_name, date_resolved")
      .gte("date_resolved", range.start)
      .lte("date_resolved", range.end)
      .order("date_resolved", { ascending: false }),
    supabase
      .from("todos")
      .select("id, title, updated_at")
      .eq("status", "done")
      .gte("updated_at", `${range.start}T00:00:00`)
      .lte("updated_at", `${range.end}T23:59:59`)
      .order("updated_at", { ascending: false }),
    supabase
      .from("todos")
      .select("id, title, due_date")
      .in("status", ["todo", "in_progress"])
      .gte("due_date", nextWeek.start)
      .lte("due_date", nextWeek.end)
      .order("due_date", { ascending: true }),
  ]);

  const issues = resolvedIssues ?? [];
  const done = doneTodos ?? [];
  const upcoming = upcomingTodos ?? [];

  const byCategory = groupCount(issues.map((i) => i.category), "Tanpa kategori");
  const byClient = groupCount(issues.map((i) => i.client_name), "Tanpa klien");

  const periodLabel =
    mode === "last7"
      ? `${formatDateID(range.start)} – ${formatDateID(range.end)} (7 hari terakhir)`
      : `${formatDateID(range.start)} – ${formatDateID(range.end)} (Senin–Minggu berjalan)`;

  const summaryText = buildSummaryText({
    periodLabel,
    issues,
    byCategory,
    byClient,
    done,
    upcoming,
    nextWeek,
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-red">Ringkasan Mingguan</h1>
        <CopySummaryButton text={summaryText} />
      </div>
      <p className="mb-6 text-sm text-muted">{periodLabel}</p>

      <div className="mb-6 flex gap-2 text-sm">
        <Link
          href="/summary?mode=week"
          className={`rounded-md px-3 py-1.5 ${mode === "week" ? "bg-brand-red text-white" : "border border-border hover:border-brand-red hover:text-brand-red"}`}
        >
          Senin–Minggu Berjalan
        </Link>
        <Link
          href="/summary?mode=last7"
          className={`rounded-md px-3 py-1.5 ${mode === "last7" ? "bg-brand-red text-white" : "border border-border hover:border-brand-red hover:text-brand-red"}`}
        >
          7 Hari Terakhir
        </Link>
      </div>

      <section className="mb-6 rounded-md border border-border p-5">
        <h2 className="font-medium">Issue Log Diselesaikan ({issues.length})</h2>
        <div className="mt-3 grid grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted">Per Kategori</h3>
            {byCategory.length === 0 && <p className="text-muted">Tidak ada.</p>}
            <ul className="space-y-0.5">
              {byCategory.map((c) => (
                <li key={c.label} className="flex justify-between">
                  <span>{c.label}</span>
                  <span className="text-muted">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted">Per Klien</h3>
            {byClient.length === 0 && <p className="text-muted">Tidak ada.</p>}
            <ul className="space-y-0.5">
              {byClient.map((c) => (
                <li key={c.label} className="flex justify-between">
                  <span>{c.label}</span>
                  <span className="text-muted">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-md border border-border p-5">
        <h2 className="font-medium">To-Do Selesai Minggu Ini ({done.length})</h2>
        {done.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Belum ada to-do yang ditandai selesai.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {done.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border p-5">
        <h2 className="font-medium">
          Draft Rencana Minggu Depan ({formatDateID(nextWeek.start)} – {formatDateID(nextWeek.end)})
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Tidak ada to-do dengan jatuh tempo minggu depan.</p>
        ) : (
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {upcoming.map((t) => (
              <li key={t.id}>
                {t.title} <span className="text-muted">(jatuh tempo {formatDateID(t.due_date)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function buildSummaryText({
  periodLabel,
  issues,
  byCategory,
  byClient,
  done,
  upcoming,
  nextWeek,
}: {
  periodLabel: string;
  issues: { title: string }[];
  byCategory: { label: string; count: number }[];
  byClient: { label: string; count: number }[];
  done: { title: string }[];
  upcoming: { title: string; due_date: string | null }[];
  nextWeek: { start: string; end: string };
}) {
  const lines: string[] = [];

  lines.push(`Summary of This Week (${periodLabel}):`);
  lines.push(`- Issue log diselesaikan: ${issues.length}`);
  if (byCategory.length > 0) {
    lines.push(`  Per kategori: ${byCategory.map((c) => `${c.label} (${c.count})`).join(", ")}`);
  }
  if (byClient.length > 0) {
    lines.push(`  Per klien: ${byClient.map((c) => `${c.label} (${c.count})`).join(", ")}`);
  }
  lines.push(`- To-do selesai: ${done.length}`);
  for (const t of done) {
    lines.push(`  - ${t.title}`);
  }

  lines.push("");
  lines.push(`Work Plan of Next Week (${formatDateID(nextWeek.start)} - ${formatDateID(nextWeek.end)}):`);
  if (upcoming.length === 0) {
    lines.push("- Tidak ada to-do dengan jatuh tempo minggu depan.");
  } else {
    for (const t of upcoming) {
      lines.push(`- ${t.title} (jatuh tempo ${formatDateID(t.due_date)})`);
    }
  }

  return lines.join("\n");
}
