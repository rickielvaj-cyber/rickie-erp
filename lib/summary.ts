import { formatDate } from "@/lib/date";

// Template ringkasan mingguan untuk YonWork. Murni berbasis template, tanpa AI.
// Fungsi di sini murni (tanpa akses database) supaya mudah diuji.

// Proyek (jika ada) lebih diutamakan daripada Goal untuk pengelompokan: laporan mingguan ke
// atasan lebih berguna per proyek klien. To-do tanpa proyek tetap dikelompokkan per Goal.
type Grouping = { goalTitle: string | null; projectTitle?: string | null; phaseTitle?: string | null };

export type DoneTask = { title: string } & Grouping;
export type HandledIssue = { client: string | null; module: string | null; title: string; category?: string | null };
export type PlanTask = { title: string; dueDate: string | null; time?: string | null } & Grouping;
/** Blok waktu di kalender yang tertaut ke to-do; `minutes` = lama blok. */
export type TimeBlock = { minutes: number } & Grouping;
/** Acara kalender yang tidak tertaut ke to-do (hanya dipakai bila pengguna memilih menyertakannya). */
export type OtherEvent = { date: string; time: string; title: string; minutes: number };
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

/** 90 -> "1 h 30 m", 45 -> "45 m", 120 -> "2 h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m} m` : m === 0 ? `${h} h` : `${h} h ${m} m`;
}

const sumMinutes = (rows: { minutes: number }[]) => rows.reduce((total, r) => total + r.minutes, 0);

/** Jam terblokir per Proyek/Goal/Other (yang terbanyak dulu), total di judul. */
function timeBlockLines(blocks: TimeBlock[], others: OtherEvent[]) {
  const out: string[] = [`Time blocked (${formatDuration(sumMinutes(blocks) + sumMinutes(others))})`];
  const rank = (k: string) => (k === OTHER ? 2 : k.startsWith(PROJECT_PREFIX) ? 0 : 1);
  const groups = groupTasks(blocks).sort(
    ([a, x], [b, y]) => rank(a) - rank(b) || sumMinutes(y) - sumMinutes(x) || a.localeCompare(b),
  );
  for (const [name, rows] of groups) out.push(`- ${name === OTHER ? OTHER : name}: ${formatDuration(sumMinutes(rows))}`);
  if (others.length > 0) {
    out.push(`Other calendar events (${formatDuration(sumMinutes(others))})`);
    for (const e of others) out.push(`- ${formatDate(e.date)} ${e.time} · ${e.title}`);
  }
  return out;
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
  timeBlocks = null,
  otherEvents = [],
}: {
  weekStart: string;
  weekEnd: string;
  done: DoneTask[];
  issues: HandledIssue[];
  projects?: ProjectStatusLine[];
  /** null = kalender tidak dipakai (bagian "Time blocked" disembunyikan); [] = dipakai tapi tidak ada blok. */
  timeBlocks?: TimeBlock[] | null;
  otherEvents?: OtherEvent[];
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

  if (timeBlocks !== null && (timeBlocks.length > 0 || otherEvents.length > 0)) {
    out.push("", ...timeBlockLines(timeBlocks, otherEvents));
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
      return `${taskTitle(t)} (${carried}due ${formatDate(t.dueDate)}${t.time ? ` ${t.time}` : ""})`;
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

// ---- Rekap bulanan -----------------------------------------------------------------------------------------------------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" -> "October 2026". */
export function monthTitle(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? yyyyMm} ${y}`;
}

/** Hitung kemunculan; yang kosong dikelompokkan ke `emptyLabel` dan ditaruh paling bawah, sisanya terbanyak dulu. */
function tally<T>(rows: T[], pick: (row: T) => string | null | undefined, emptyLabel: string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row)?.trim() || emptyLabel;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort(([a, x], [b, y]) => (a === emptyLabel ? 1 : b === emptyLabel ? -1 : y - x || a.localeCompare(b)));
}

/**
 * Rekap satu bulan dari data (bukan dari teks mingguan yang disimpan): jumlah tugas selesai per Proyek/Goal/Other, issue per
 * klien, modul dan kategori, jam terblokir per Proyek/Goal/Other, dan status proyek. Hanya angka, supaya muat satu layar
 * untuk laporan bulanan; rincian ada di summary mingguan.
 */
export function buildMonthlyText({
  month,
  done,
  issues,
  timeBlocks = null,
  projects = [],
}: {
  month: string;
  done: DoneTask[];
  issues: HandledIssue[];
  timeBlocks?: TimeBlock[] | null;
  projects?: ProjectStatusLine[];
}): string {
  const out: string[] = [`Monthly Summary (${monthTitle(month)})`, ""];

  out.push(`Tasks completed (${done.length})`);
  if (done.length === 0) out.push("- No completed tasks recorded.");
  else for (const [name, rows] of groupTasks(done)) out.push(`- ${name === OTHER ? OTHER : name}: ${rows.length}`);

  out.push("", `Issues handled (${issues.length})`);
  if (issues.length === 0) {
    out.push("- None.");
  } else {
    out.push("By client:");
    for (const [name, n] of tally(issues, (i) => i.client, "No client")) out.push(`- ${name}: ${n}`);
    out.push("By module:");
    for (const [name, n] of tally(issues, (i) => i.module, "No module")) out.push(`- ${name}: ${n}`);
    if (issues.some((i) => i.category?.trim())) {
      out.push("By category:");
      for (const [name, n] of tally(issues, (i) => i.category, "No category")) out.push(`- ${name}: ${n}`);
    }
  }

  if (timeBlocks !== null && timeBlocks.length > 0) {
    out.push("", `Time blocked (${formatDuration(sumMinutes(timeBlocks))})`);
    const rank = (k: string) => (k === OTHER ? 2 : k.startsWith(PROJECT_PREFIX) ? 0 : 1);
    const groups = groupTasks(timeBlocks).sort(([a, x], [b, y]) => rank(a) - rank(b) || sumMinutes(y) - sumMinutes(x) || a.localeCompare(b));
    for (const [name, rows] of groups) out.push(`- ${name === OTHER ? OTHER : name}: ${formatDuration(sumMinutes(rows))}`);
  }

  if (projects.length > 0) out.push("", `Project status (${projects.length})`, ...projectLines(projects));
  return out.join("\n");
}
