import { isISODate } from "@/lib/date";
import type { TodoPriority, TodoStatus } from "@/lib/types";

// Edit massal to-do: validasi masukan dari browser (tidak dipercaya) dan susun perubahan yang akan diterapkan. Murni.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BATCH_MAX = 200;
const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
const STATUSES: TodoStatus[] = ["todo", "in_progress", "done"];

/** "" = tidak diubah, "none" = dikosongkan, selain itu nilainya. */
export type BatchInput = {
  ids: string[];
  dueDate?: string;
  priority?: string;
  status?: string;
  goal?: string;
  project?: string;
  phase?: string;
};

export type BatchPatch = {
  due_date?: string | null;
  priority?: TodoPriority;
  status?: TodoStatus;
  goal_id?: string | null;
  project_id?: string | null;
  phase_id?: string | null;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Pilihan "id atau none atau kosong" -> undefined (tidak diubah) | null (dikosongkan) | id. Salah -> "invalid". */
function refChoice(value: string): string | null | undefined | "invalid" {
  if (value === "") return undefined;
  if (value === "none") return null;
  return UUID_RE.test(value) ? value : "invalid";
}

export function parseBatchInput(raw: unknown): { ok: true; ids: string[]; patch: BatchPatch } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(r.ids) ? Array.from(new Set(r.ids.filter((x): x is string => typeof x === "string"))) : [];
  if (ids.length === 0) return { ok: false, error: "Select at least one task." };
  if (ids.length > BATCH_MAX) return { ok: false, error: `Select at most ${BATCH_MAX} tasks at a time.` };
  if (!ids.every((id) => UUID_RE.test(id))) return { ok: false, error: "Unknown task." };

  const patch: BatchPatch = {};

  const due = text(r.dueDate);
  if (due === "none") patch.due_date = null;
  else if (due !== "") {
    if (!isISODate(due)) return { ok: false, error: "Choose a valid date." };
    patch.due_date = due;
  }

  const priority = text(r.priority);
  if (priority !== "") {
    if (!PRIORITIES.includes(priority as TodoPriority)) return { ok: false, error: "Choose a valid priority." };
    patch.priority = priority as TodoPriority;
  }

  const status = text(r.status);
  if (status !== "") {
    if (!STATUSES.includes(status as TodoStatus)) return { ok: false, error: "Choose a valid status." };
    patch.status = status as TodoStatus;
  }

  const goal = refChoice(text(r.goal));
  if (goal === "invalid") return { ok: false, error: "Unknown goal." };
  if (goal !== undefined) patch.goal_id = goal;

  const project = refChoice(text(r.project));
  if (project === "invalid") return { ok: false, error: "Unknown project." };
  const phase = refChoice(text(r.phase));
  if (phase === "invalid") return { ok: false, error: "Unknown phase." };
  if (project !== undefined) {
    patch.project_id = project;
    // Fase milik proyek lama tidak berlaku di proyek baru: dikosongkan kecuali fase dari proyek baru dipilih.
    patch.phase_id = project === null ? null : (phase ?? null);
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Choose something to change." };
  return { ok: true, ids, patch };
}

/** Perubahan untuk to-do yang tertaut ke blok kalender: tanggalnya mengikuti blok, jadi due_date dibuang. */
export function patchForLinked(patch: BatchPatch): BatchPatch | null {
  const { due_date, ...rest } = patch;
  void due_date;
  return Object.keys(rest).length === 0 ? null : rest;
}
