import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, formatDate, isISODate, mondayOfISO, todayISO } from "@/lib/date";
import { buildPlanText, buildSummaryText } from "@/lib/summary";
import { SummaryEditor } from "@/components/SummaryEditor";

type SearchParams = { week?: string };

// Zona waktu Jakarta (WIB, UTC+7, tanpa DST) untuk batas hari pada completed_at.
const WIB = "+07:00";

export default async function SummaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const today = todayISO();
  const currentMonday = mondayOfISO(today);
  const weekStart = isISODate(params.week) ? mondayOfISO(params.week) : currentMonday;
  const isCurrentWeek = weekStart === currentMonday;

  // Senin–Jumat minggu terpilih, dan Senin–Jumat minggu depannya untuk rencana.
  const weekEnd = addDaysISO(weekStart, 4);
  const nextStart = addDaysISO(weekStart, 7);
  const nextEnd = addDaysISO(weekStart, 11);

  const supabase = await createClient();
  const [doneResult, issuesResult, planResult, goalsResult] = await Promise.all([
    supabase
      .from("todos")
      .select("id, title, goal_id")
      .eq("status", "done")
      .gte("completed_at", `${weekStart}T00:00:00${WIB}`)
      .lt("completed_at", `${addDaysISO(weekEnd, 1)}T00:00:00${WIB}`)
      .order("completed_at", { ascending: true }),
    supabase
      .from("issue_log")
      .select("id, title, client_name, module")
      .gte("date_resolved", weekStart)
      .lte("date_resolved", weekEnd)
      .order("date_resolved", { ascending: true })
      .order("created_at", { ascending: true }),
    // Belum selesai dan terjadwal sampai Jumat minggu depan (termasuk yang terlewat).
    supabase
      .from("todos")
      .select("id, title, goal_id, due_date")
      .neq("status", "done")
      .not("due_date", "is", null)
      .lte("due_date", nextEnd)
      .order("due_date", { ascending: true }),
    supabase.from("goals").select("id, title"),
  ]);

  const goalTitles = new Map((goalsResult.data ?? []).map((g) => [g.id, g.title]));
  const goalOf = (id: string | null) => (id ? (goalTitles.get(id) ?? null) : null);
  const done = doneResult.data ?? [];
  const issues = issuesResult.data ?? [];
  const plan = planResult.data ?? [];
  const fetchError = doneResult.error ?? issuesResult.error ?? planResult.error ?? goalsResult.error;

  const summaryText = buildSummaryText({
    weekStart,
    weekEnd,
    done: done.map((t) => ({ title: t.title, goalTitle: goalOf(t.goal_id) })),
    issues: issues.map((i) => ({ client: i.client_name, module: i.module, title: i.title })),
  });
  const planText = buildPlanText({
    nextStart,
    nextEnd,
    tasks: plan.map((t) => ({ title: t.title, dueDate: t.due_date, goalTitle: goalOf(t.goal_id) })),
  });

  const pill = "rounded-full border border-foreground px-4 py-1.5 text-sm hover:bg-surface";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Weekly Summary</h1>
          <p className="mt-1 text-base text-muted">
            {formatDate(weekStart)} – {formatDate(weekEnd)} · Mon–Fri · {done.length} tasks completed ·{" "}
            {issues.length} {issues.length === 1 ? "issue" : "issues"}
          </p>
        </div>
        <nav aria-label="Select week" className="flex gap-2">
          <Link href={`/summary?week=${addDaysISO(weekStart, -7)}`} className={pill}>
            ‹ Previous
          </Link>
          <Link href="/summary" className={`${pill} ${isCurrentWeek ? "bg-surface font-medium" : ""}`}>
            This week
          </Link>
          <Link href={`/summary?week=${addDaysISO(weekStart, 7)}`} className={pill}>
            Next ›
          </Link>
        </nav>
      </div>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Failed to load data: {fetchError.message}
        </p>
      )}

      <div className="mt-8">
        {/* key: pindah minggu = editor dimuat ulang dari template minggu itu. */}
        <SummaryEditor key={weekStart} summaryText={summaryText} planText={planText} />
      </div>

      <p className="mt-8 text-sm text-muted">
        Tasks count by the date they were checked off (Asia/Jakarta time zone); issues count by their own date.
        Anything checked off or logged on Saturday–Sunday is not included in the Mon–Fri summary.
      </p>
    </div>
  );
}
