import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { endOfMonthISO, isYearMonth, todayISO } from "@/lib/date";
import { buildMonthlyText, monthTitle } from "@/lib/summary";
import { currentPhase, sortPhases } from "@/lib/projects";
import { CopyBox } from "./CopyBox";

const WIB = "+07:00";

const shiftMonth = (yyyyMm: string, delta: number) => {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export default async function MonthlyRecapPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const thisMonth = todayISO().slice(0, 7);
  const month = isYearMonth(params.month) ? params.month : thisMonth;
  const first = `${month}-01`;
  const last = endOfMonthISO(month);
  const nextFirst = `${shiftMonth(month, 1)}-01`;

  const supabase = await createClient();
  const [doneResult, issuesResult, blocksResult, goalsResult, projectsResult, phasesResult, clientsResult] = await Promise.all([
    supabase
      .from("todos")
      .select("title, goal_id, project_id")
      .eq("status", "done")
      .gte("completed_at", `${first}T00:00:00${WIB}`)
      .lt("completed_at", `${nextFirst}T00:00:00${WIB}`),
    supabase.from("issue_log").select("title, client_name, module, category").gte("date_resolved", first).lte("date_resolved", last),
    // Blok waktu dari jam yang tersimpan di to-do (tanpa memanggil Google); Weekly Summary yang menyinkronkan.
    supabase
      .from("todos")
      .select("goal_id, project_id, scheduled_start, scheduled_end")
      .not("calendar_event_id", "is", null)
      .gte("scheduled_start", `${first}T00:00:00${WIB}`)
      .lt("scheduled_start", `${nextFirst}T00:00:00${WIB}`),
    supabase.from("goals").select("id, title"),
    supabase.from("projects").select("id, name, client_id, status, target_date"),
    supabase.from("project_phases").select("*"),
    supabase.from("clients").select("id, canonical_name"),
  ]);

  const goalTitles = new Map((goalsResult.data ?? []).map((g) => [g.id, g.title]));
  const clientNames = new Map((clientsResult.data ?? []).map((c) => [c.id, c.canonical_name]));
  const allProjects = projectsResult.data ?? [];
  const projectNames = new Map(
    allProjects.map((p) => [p.id, clientNames.get(p.client_id) ? `${clientNames.get(p.client_id)} — ${p.name}` : p.name]),
  );
  const goalOf = (id: string | null) => (id ? (goalTitles.get(id) ?? null) : null);
  const projectOf = (id: string | null) => (id ? (projectNames.get(id) ?? null) : null);
  const phaseRows = phasesResult.data ?? [];

  const projectStatus = allProjects
    .filter((p) => p.status !== "done" && p.status !== "planning")
    .map((p) => {
      const phases = sortPhases(phaseRows.filter((ph) => ph.project_id === p.id));
      return {
        name: p.name,
        clientName: clientNames.get(p.client_id) ?? null,
        currentPhase: currentPhase(phases)?.name ?? null,
        phasesDone: phases.filter((ph) => ph.status === "done").length,
        phasesTotal: phases.length,
        targetDate: p.target_date,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const blocks = (blocksResult.data ?? [])
    .map((t) => ({
      minutes: t.scheduled_start && t.scheduled_end ? Math.round((Date.parse(t.scheduled_end) - Date.parse(t.scheduled_start)) / 60_000) : 0,
      goalTitle: goalOf(t.goal_id),
      projectTitle: projectOf(t.project_id),
    }))
    .filter((b) => b.minutes > 0);

  const text = buildMonthlyText({
    month,
    done: (doneResult.data ?? []).map((t) => ({ title: t.title, goalTitle: goalOf(t.goal_id), projectTitle: projectOf(t.project_id) })),
    issues: (issuesResult.data ?? []).map((i) => ({ client: i.client_name, module: i.module, title: i.title, category: i.category })),
    timeBlocks: blocks,
    projects: projectStatus,
  });

  const fetchError = doneResult.error ?? issuesResult.error ?? blocksResult.error ?? goalsResult.error ?? projectsResult.error ?? phasesResult.error ?? clientsResult.error;
  const pill = "rounded-full border border-foreground px-4 py-1.5 text-sm hover:bg-surface";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Monthly Recap</h1>
          <p className="mt-1 text-base text-muted">
            {monthTitle(month)} · counts only · <Link href="/summary/history" className="underline underline-offset-4">History</Link>
          </p>
        </div>
        <nav aria-label="Select month" className="flex gap-2">
          <Link href={`/summary/monthly?month=${shiftMonth(month, -1)}`} className={pill}>
            ‹ Previous
          </Link>
          <Link href="/summary/monthly" className={`${pill} ${month === thisMonth ? "bg-surface font-medium" : ""}`}>
            This month
          </Link>
          <Link href={`/summary/monthly?month=${shiftMonth(month, 1)}`} className={pill}>
            Next ›
          </Link>
        </nav>
      </div>

      {fetchError && <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load data: {fetchError.message}</p>}

      <div className="mt-8">
        <CopyBox key={month} text={text} />
      </div>

      <p className="mt-8 text-sm text-muted">
        Built from your data for the whole month (all days, Asia/Jakarta). Time blocked uses the block times saved on to-dos linked to the
        calendar; open Weekly Summary for a week to refresh them from Google first. Project status is as of today.
      </p>
    </div>
  );
}
