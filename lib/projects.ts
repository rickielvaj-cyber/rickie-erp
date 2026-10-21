import type { PhaseStatus, ProjectPhase, ProjectStatus } from "@/lib/types";

export const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "done"];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  done: "Done",
};

export const PHASE_STATUSES: PhaseStatus[] = ["not_started", "in_progress", "done"];
export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/** Fase awal untuk proyek implementasi ERP; bisa diubah, ditambah, atau dihapus setelah dibuat. */
export const STANDARD_PHASES = [
  "Blueprint",
  "Configuration",
  "Data migration",
  "UAT",
  "Training",
  "Go-live",
  "Hypercare",
] as const;

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as string[]).includes(value);
}

export function isPhaseStatus(value: string): value is PhaseStatus {
  return (PHASE_STATUSES as string[]).includes(value);
}

type PhaseLike = Pick<ProjectPhase, "status" | "position" | "created_at" | "id">;

/** Urutan tampilan fase: position, lalu waktu dibuat, lalu id (stabil bila position sama). */
export function sortPhases<T extends PhaseLike>(phases: T[]): T[] {
  return [...phases].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function phaseProgress(phases: Pick<ProjectPhase, "status">[]) {
  const total = phases.length;
  const done = phases.filter((p) => p.status === "done").length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * Fase yang sedang berjalan: fase pertama berstatus In progress; kalau tidak ada, fase pertama yang
 * belum dimulai; kalau semua selesai (atau tidak ada fase), null.
 */
export function currentPhase<T extends PhaseLike>(phases: T[]): T | null {
  const ordered = sortPhases(phases);
  return ordered.find((p) => p.status === "in_progress") ?? ordered.find((p) => p.status === "not_started") ?? null;
}

/** Terlambat = ada tanggal target yang sudah lewat (lebih kecil dari hari ini) dan belum selesai. */
export function isOverdue(targetDate: string | null, today: string, done: boolean): boolean {
  return !done && targetDate !== null && targetDate < today;
}

type TodoLike = { id: string; phase_id: string | null; status: string };

/**
 * Kelompokkan to-do proyek per fase (halaman proyek: tiap fase punya daftar to-do sendiri). Dalam tiap kelompok yang
 * belum selesai tampil lebih dulu, urutan lain mengikuti urutan masukan. To-do yang fasenya sudah dihapus atau tidak
 * dikenal (bukan milik proyek ini) masuk ke `unphased`.
 */
export function groupTodosByPhase<T extends TodoLike>(todos: T[], phases: { id: string }[]): { byPhase: Map<string, T[]>; unphased: T[] } {
  const known = new Set(phases.map((p) => p.id));
  const order = (list: T[]) => [...list.filter((t) => t.status !== "done"), ...list.filter((t) => t.status === "done")];
  const byPhase = new Map<string, T[]>(phases.map((p) => [p.id, [] as T[]]));
  const unphased: T[] = [];
  for (const t of todos) {
    if (t.phase_id && known.has(t.phase_id)) byPhase.get(t.phase_id)!.push(t);
    else unphased.push(t);
  }
  for (const [id, list] of byPhase) byPhase.set(id, order(list));
  return { byPhase, unphased: order(unphased) };
}
