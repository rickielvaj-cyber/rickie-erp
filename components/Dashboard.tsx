import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, formatDate, formatLongDay, todayISO } from "@/lib/date";
import { blockedLabel, blockedMinutes, buildToday, issueAttention, runningProjects, weekOf } from "@/lib/dashboard";
import { createTodoForDay } from "@/app/(dashboard)/todos/actions";

// Beranda setelah login: apa yang perlu dikerjakan hari ini dan gambaran minggu ini. Semua dari database sendiri
// (RLS berlaku); tidak memanggil Google, jadi jam blok diambil dari jam terakhir yang tersimpan di to-do.

// Zona Jakarta (WIB, UTC+7, tanpa DST) untuk batas hari/minggu pada kolom timestamp.
const WIB = "+07:00";
const VISIBLE_TODAY = 8;

const card = "rounded-3xl border border-border bg-surface p-6";
const cardTitle = "text-xl font-semibold tracking-tight";

function Stat({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="flex items-baseline justify-between gap-3 py-2.5 transition-colors hover:text-muted">
      <span className="text-base text-muted">{label}</span>
      <span className="text-lg font-semibold tracking-tight">{value}</span>
    </Link>
  );
}

export async function Dashboard() {
  const supabase = await createClient();
  const today = todayISO();
  const week = weekOf(today);
  const weekFrom = `${week.start}T00:00:00${WIB}`;
  const weekTo = `${week.nextStart}T00:00:00${WIB}`;

  const [openResult, doneToday, doneWeek, laterThisWeek, blocksResult, issuesWeek, issuesResult, projectsResult, phasesResult, clientsResult] =
    await Promise.all([
      // Belum selesai dan jatuh tempo sampai hari ini, atau tanpa tanggal (sama dengan panel Hari ini di To-Do).
      supabase
        .from("todos")
        .select("id, title, priority, due_date, status, calendar_event_id, scheduled_start, scheduled_end, project_id, goal_id")
        .neq("status", "done")
        .or(`due_date.lte.${today},due_date.is.null`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("completed_at", `${today}T00:00:00${WIB}`)
        .lt("completed_at", `${addDaysISO(today, 1)}T00:00:00${WIB}`),
      supabase.from("todos").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", weekFrom).lt("completed_at", weekTo),
      supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .neq("status", "done")
        .gt("due_date", today)
        .lte("due_date", week.end),
      supabase
        .from("todos")
        .select("scheduled_start, scheduled_end")
        .not("calendar_event_id", "is", null)
        .gte("scheduled_start", weekFrom)
        .lt("scheduled_start", weekTo),
      supabase.from("issue_log").select("id", { count: "exact", head: true }).gte("date_resolved", week.start).lte("date_resolved", week.end),
      supabase.from("issue_log").select("copied_to_sheet_at, kb_entry_id, root_cause, resolution"),
      supabase.from("projects").select("id, name, client_id, status, target_date"),
      supabase.from("project_phases").select("id, project_id, name, status, position, created_at"),
      supabase.from("clients").select("id, canonical_name"),
    ]);

  const fetchError = openResult.error ?? blocksResult.error ?? issuesResult.error ?? projectsResult.error ?? phasesResult.error ?? clientsResult.error;
  const clientNames = new Map((clientsResult.data ?? []).map((c) => [c.id, c.canonical_name]));
  const { items, overdue, dueToday } = buildToday(openResult.data ?? [], today);
  const shown = items.slice(0, VISIBLE_TODAY);
  const projects = runningProjects(projectsResult.data ?? [], phasesResult.data ?? [], clientNames, today);
  const attention = issueAttention(issuesResult.data ?? []);
  const blocked = blockedMinutes(blocksResult.data ?? []);
  const needsAttention = attention.notInSheet + attention.canAddToKb;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-base text-muted">
            {formatLongDay(today)} · {dueToday} due today
            {overdue > 0 && <span className="text-danger"> · {overdue} overdue</span>}
            {" · "}
            {doneToday.count ?? 0} done
          </p>
        </div>
        <Link href="/summary" className="rounded-full border border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-surface">
          Weekly Summary
        </Link>
      </div>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load some data: {fetchError.message}</p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section aria-labelledby="dash-today" className={`${card} lg:col-span-3`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="dash-today" className={cardTitle}>
              To do
            </h2>
            <Link href="/todos" className="text-sm text-muted underline underline-offset-4 hover:text-foreground">
              Open To-Do
            </Link>
          </div>

          {shown.length === 0 ? (
            <p className="mt-4 text-base text-muted">Nothing left for today. Enjoy your day.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {shown.map((t) => (
                <li key={t.id}>
                  <Link href="/todos" className="flex items-baseline gap-3 py-2.5 transition-colors hover:text-muted">
                    <span className="min-w-0 flex-1 truncate text-base">{t.title}</span>
                    {t.priority === "high" && <span className="shrink-0 rounded-full border border-foreground px-2 py-0.5 text-xs">High</span>}
                    {t.overdue && t.due_date ? (
                      <span className="shrink-0 text-sm text-danger">{formatDate(t.due_date)}</span>
                    ) : t.time ? (
                      <span className="shrink-0 text-sm text-muted">{t.time}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {items.length > shown.length && (
            <Link href="/todos" className="mt-2 inline-block text-sm text-muted underline underline-offset-4 hover:text-foreground">
              +{items.length - shown.length} more
            </Link>
          )}

          <form action={createTodoForDay.bind(null, today)} className="mt-4">
            <input
              name="title"
              required
              placeholder="+ Write a new task, then press Enter"
              aria-label="New task for today"
              className="h-11 w-full rounded-2xl border border-dashed border-muted/60 bg-background px-4 text-base placeholder:text-muted focus:border-solid focus:border-foreground focus:outline-none"
            />
          </form>
        </section>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <section aria-labelledby="dash-week" className={card}>
            <h2 id="dash-week" className={cardTitle}>
              This week
            </h2>
            <div className="mt-2 divide-y divide-border">
              <Stat label="Tasks completed" value={doneWeek.count ?? 0} href="/summary" />
              <Stat label="Due later this week" value={laterThisWeek.count ?? 0} href="/todos" />
              <Stat label="Time blocked" value={blockedLabel(blocked)} href="/todos#calendar" />
              <Stat label="Issues handled" value={issuesWeek.count ?? 0} href="/issues" />
            </div>
          </section>

          {needsAttention > 0 && (
            <section aria-labelledby="dash-attention" className={card}>
              <h2 id="dash-attention" className={cardTitle}>
                Needs attention
              </h2>
              <div className="mt-2 divide-y divide-border">
                {attention.notInSheet > 0 && <Stat label="Issues not marked in the sheet" value={attention.notInSheet} href="/issues" />}
                {attention.canAddToKb > 0 && <Stat label="Issues you could add to the KB" value={attention.canAddToKb} href="/issues" />}
              </div>
            </section>
          )}
        </div>
      </div>

      <section aria-labelledby="dash-projects" className={`${card} mt-6`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="dash-projects" className={cardTitle}>
            Running projects
          </h2>
          <Link href="/projects" className="text-sm text-muted underline underline-offset-4 hover:text-foreground">
            All projects
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="mt-4 text-base text-muted">No running projects.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block py-3 transition-colors hover:text-muted">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-base font-medium">
                      {p.clientName ? `${p.clientName} — ` : ""}
                      {p.name}
                    </span>
                    <span className={`text-sm ${p.overdue ? "text-danger" : "text-muted"}`}>
                      {p.targetDate ? `${p.overdue ? "Past target " : "Target "}${formatDate(p.targetDate)}` : "No target date"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-sm text-muted">
                    <span className="shrink-0">{p.currentPhase ? `Now: ${p.currentPhase}` : p.total > 0 ? "All phases done" : "No phases yet"}</span>
                    {p.total > 0 && (
                      <>
                        <span
                          role="progressbar"
                          aria-label={`${p.done} of ${p.total} phases done`}
                          aria-valuemin={0}
                          aria-valuemax={p.total}
                          aria-valuenow={p.done}
                          className="h-1.5 min-w-12 max-w-48 flex-1 overflow-hidden rounded-full bg-border"
                        >
                          <span className="block h-full bg-foreground" style={{ width: `${p.percent}%` }} />
                        </span>
                        <span className="shrink-0">
                          {p.done}/{p.total}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function DashboardFallback() {
  return (
    <div aria-hidden="true" className="mx-auto max-w-5xl animate-pulse px-6 py-10">
      <div className="h-10 w-40 rounded bg-surface" />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="h-72 rounded-3xl border border-border bg-surface lg:col-span-3" />
        <div className="h-72 rounded-3xl border border-border bg-surface lg:col-span-2" />
      </div>
    </div>
  );
}
