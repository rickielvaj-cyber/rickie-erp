import { addDaysISO, mondayOfISO } from "@/lib/date";
import { formatScheduled } from "@/lib/google/layout";
import { canBecomeKbEntry } from "@/lib/issue-kb";
import { currentPhase, isOverdue, phaseProgress, sortPhases } from "@/lib/projects";
import { formatDuration } from "@/lib/summary";
import type { Project, ProjectPhase, Todo } from "@/lib/types";

// Ringkasan beranda (dashboard) setelah login. Murni (tanpa database) supaya mudah diuji; page memberi datanya.
// Semua hitungan dari data yang sudah tersimpan: tidak memanggil Google, jadi beranda tetap cepat.

/** Senin sampai Minggu dari minggu yang memuat `today`. */
export function weekOf(today: string): { start: string; end: string; nextStart: string } {
  const start = mondayOfISO(today);
  return { start, end: addDaysISO(start, 6), nextStart: addDaysISO(start, 7) };
}

export type DashTodo = Pick<
  Todo,
  "id" | "title" | "priority" | "due_date" | "status" | "calendar_event_id" | "scheduled_start" | "scheduled_end" | "project_id" | "goal_id"
>;

export type TodayTodo = DashTodo & { time: string | null; overdue: boolean };

/**
 * Daftar "Hari ini": yang terlewat, lalu jatuh tempo hari ini, lalu yang tanpa tanggal (aturan yang sama dengan panel
 * Hari ini di halaman To-Do). Yang berjam (tertaut blok kalender) lebih dulu menurut jamnya; selebihnya urutan masukan.
 */
export function buildToday(todos: DashTodo[], today: string): { items: TodayTodo[]; overdue: number; dueToday: number; undated: number } {
  const open = todos.filter((t) => t.status !== "done");
  const decorate = (t: DashTodo, overdue: boolean): TodayTodo => ({
    ...t,
    time: t.calendar_event_id ? formatScheduled(t.scheduled_start, t.scheduled_end) : null,
    overdue,
  });
  const byTime = (a: TodayTodo, b: TodayTodo) => {
    if (a.time && b.time) return (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? "");
    return a.time ? -1 : b.time ? 1 : 0;
  };
  const overdue = open.filter((t) => t.due_date !== null && t.due_date < today).map((t) => decorate(t, true));
  const dueToday = open.filter((t) => t.due_date === today).map((t) => decorate(t, false)).sort(byTime);
  const undated = open.filter((t) => t.due_date === null).map((t) => decorate(t, false));
  return { items: [...overdue, ...dueToday, ...undated], overdue: overdue.length, dueToday: dueToday.length, undated: undated.length };
}

/** Total menit blok kalender (to-do tertaut) dari baris yang diberikan; baris tanpa jam atau terbalik dilewati. */
export function blockedMinutes(rows: { scheduled_start: string | null; scheduled_end: string | null }[]): number {
  let total = 0;
  for (const r of rows) {
    if (!r.scheduled_start || !r.scheduled_end) continue;
    const minutes = Math.round((Date.parse(r.scheduled_end) - Date.parse(r.scheduled_start)) / 60_000);
    if (Number.isFinite(minutes) && minutes > 0) total += minutes;
  }
  return total;
}

export const blockedLabel = (minutes: number) => formatDuration(minutes);

export type IssueAttention = { notInSheet: number; canAddToKb: number };

/** Issue yang menunggu tindakan: belum ditandai masuk sheet, dan yang sudah punya penyebab/solusi tapi belum jadi entri KB. */
export function issueAttention(
  issues: { copied_to_sheet_at: string | null; kb_entry_id: string | null; root_cause: string | null; resolution: string | null }[],
): IssueAttention {
  return {
    notInSheet: issues.filter((i) => !i.copied_to_sheet_at).length,
    canAddToKb: issues.filter((i) => !i.kb_entry_id && canBecomeKbEntry(i)).length,
  };
}

export type DashProject = {
  id: string;
  name: string;
  clientName: string | null;
  currentPhase: string | null;
  done: number;
  total: number;
  percent: number;
  targetDate: string | null;
  overdue: boolean;
};

/** Proyek yang sedang berjalan (bukan Planning/Done): fase berjalan, progres fase, dan apakah target sudah lewat. */
export function runningProjects(
  projects: Pick<Project, "id" | "name" | "client_id" | "status" | "target_date">[],
  phases: Pick<ProjectPhase, "id" | "project_id" | "name" | "status" | "position" | "created_at">[],
  clientNames: Map<string, string>,
  today: string,
): DashProject[] {
  return projects
    .filter((p) => p.status !== "done" && p.status !== "planning")
    .map((p) => {
      const own = sortPhases(phases.filter((ph) => ph.project_id === p.id));
      const progress = phaseProgress(own);
      return {
        id: p.id,
        name: p.name,
        clientName: clientNames.get(p.client_id) ?? null,
        currentPhase: currentPhase(own)?.name ?? null,
        done: progress.done,
        total: progress.total,
        percent: progress.percent,
        targetDate: p.target_date,
        overdue: isOverdue(p.target_date, today, false),
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") || a.name.localeCompare(b.name));
}
