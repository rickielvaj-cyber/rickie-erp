import { formatDate } from "@/lib/date";

// Template ringkasan mingguan untuk YonWork. Murni berbasis template, tanpa AI.
// Fungsi di sini murni (tanpa akses database) supaya mudah diuji.

// Proyek (jika ada) lebih diutamakan daripada Goal untuk pengelompokan: laporan mingguan ke
// atasan lebih berguna per proyek klien. To-do tanpa proyek tetap dikelompokkan per Goal.
type Grouping = { goalTitle: string | null; projectTitle?: string | null; phaseTitle?: string | null };

export type DoneTask = { title: string } & Grouping;
export type HandledIssue = { client: string | null; module: string | null; title: string };
export type PlanTask = { title: string; dueDate: string | null } & Grouping;
export type ProjectStatusLine = {
  name: string;
  clientName: string | null;
  currentPhase: string | null;
  phasesDone: number;
  phasesTotal: number;
  targetDate: string | null;
};

const OTHER = "Other";

function range(start: string, end: string) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

const PROJECT_PREFIX = "Project: ";
const GOAL_PREFIX = "Goal: ";

/** Kelompokkan per Proyek (abjad), lalu per Goal (abjad); yang tanpa keduanya di paling bawah ("Other"). */
function groupTasks<T extends Grouping>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const project = row.projectTitle?.trim();
    const goal = row.goalTitle?.trim();
    const key = project ? PROJECT_PREFIX + project : goal ? GOAL_PREFIX + goal : OTHER;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const rank = (k: string) => (k === OTHER ? 2 : k.startsWith(PROJECT_PREFIX) ? 0 : 1);
  return Array.from(groups.entries()).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Judul to-do; to-do proyek menyebut fasenya, mis. "Migrate master data [Data migration]". */
function taskTitle(t: Grouping & { title: string }) {
  return t.projectTitle?.trim() && t.phaseTitle?.trim() ? `${t.title} [${t.phaseTitle.trim()}]` : t.title;
}

function lines(groups: [string, string[]][]) {
  const out: string[] = [];
  for (const [name, items] of groups) {
    out.push(name === OTHER ? `${OTHER}:` : name);
    for (const item of items) out.push(`- ${item}`);
  }
  return out;
}

/** Status proyek yang sedang berjalan: fase berjalan, progres fase, tanggal target. */
function projectLines(projects: ProjectStatusLine[]) {
  const out: string[] = [];
  for (const p of projects) {
    const owner = p.clientName ? ` (${p.clientName})` : "";
    const parts = [
      p.currentPhase ? `now ${p.currentPhase}` : null,
      p.phasesTotal > 0 ? `${p.phasesDone} of ${p.phasesTotal} phases done` : null,
      p.targetDate ? `target ${formatDate(p.targetDate)}` : null,
    ].filter(Boolean);
    out.push(`- ${p.name}${owner}${parts.length ? `: ${parts.join(", ")}` : ""}`);
  }
  return out;
}

export function buildSummaryText({
  weekStart,
  weekEnd,
  done,
  issues,
  projects = [],
}: {
  weekStart: string;
  weekEnd: string;
  done: DoneTask[];
  issues: HandledIssue[];
  projects?: ProjectStatusLine[];
}): string {
  const out: string[] = [`Summary of This Week (${range(weekStart, weekEnd)})`, ""];

  out.push(`Tasks completed (${done.length})`);
  if (done.length === 0) {
    out.push("- No completed tasks recorded.");
  } else {
    out.push(...lines(groupTasks(done).map(([name, rows]) => [name, rows.map(taskTitle)] as [string, string[]])));
  }

  out.push("", `Issues handled (${issues.length})`);
  if (issues.length === 0) {
    out.push("- None.");
  } else {
    const byClient = new Map<string, HandledIssue[]>();
    for (const issue of issues) {
      const key = issue.client?.trim() || "No client";
      byClient.set(key, [...(byClient.get(key) ?? []), issue]);
    }
    const clients = Array.from(byClient.entries()).sort(
      ([a, x], [b, y]) => (a === "No client" ? 1 : b === "No client" ? -1 : y.length - x.length || a.localeCompare(b)),
    );
    for (const [client, rows] of clients) {
      out.push(`${client} (${rows.length})`);
      for (const r of rows) out.push(`- ${r.module ? `[${r.module}] ` : ""}${r.title}`);
    }
  }

  if (projects.length > 0) {
    out.push("", `Project status (${projects.length})`, ...projectLines(projects));
  }

  return out.join("\n");
}

export function buildPlanText({
  nextStart,
  nextEnd,
  tasks,
}: {
  nextStart: string;
  nextEnd: string;
  tasks: PlanTask[];
}): string {
  const out: string[] = [`Next Week Plan (${range(nextStart, nextEnd)})`, ""];

  if (tasks.length === 0) {
    out.push("- ");
  } else {
    const label = (t: PlanTask) => {
      if (!t.dueDate) return taskTitle(t);
      const carried = t.dueDate < nextStart ? "carried over, " : "";
      return `${taskTitle(t)} (${carried}due ${formatDate(t.dueDate)})`;
    };
    out.push(
      ...lines(
        groupTasks(tasks).map(
          ([name, rows]) =>
            [
              name,
              [...rows]
                .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
                .map(label),
            ] as [string, string[]],
        ),
      ),
    );
  }

  return out.join("\n");
}
