"use server";

import { safeReturnPath, withFrom } from "@/lib/return-to";
import { BATCH_MAX, parseBatchInput, patchForLinked } from "@/lib/todo-batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate, mondayOfISO, todayISO } from "@/lib/date";
import { getAuthUser } from "@/lib/supabase/auth";
import { getAccessToken } from "@/lib/google/store";
import { createEvent, deleteEvent, getEvent, rescheduleEvent } from "@/lib/google/calendar";
import { parseOptionalRange, wibIso } from "@/lib/google/block";
import { toWib } from "@/lib/google/layout";
import { bustCalendar } from "@/lib/google/cache";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readTodoFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TodoStatus;
  const priority = String(formData.get("priority") ?? "medium") as TodoPriority;
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const goalId = String(formData.get("goal_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const phaseId = String(formData.get("phase_id") ?? "").trim();

  return {
    title,
    description: description || null,
    status,
    priority,
    due_date: dueDate || null,
    goal_id: UUID_RE.test(goalId) ? goalId : null,
    project_id: UUID_RE.test(projectId) ? projectId : null,
    // Fase hanya berarti kalau proyeknya dipilih; kecocokan fase-proyek diperiksa di withValidPhase.
    phase_id: UUID_RE.test(projectId) && UUID_RE.test(phaseId) ? phaseId : null,
  };
}

/** Fase yang bukan milik proyek yang dipilih (mis. proyek diganti) dilepas, bukan disimpan. */
async function withValidPhase<T extends { project_id: string | null; phase_id: string | null }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: T,
): Promise<T> {
  if (!fields.phase_id || !fields.project_id) return { ...fields, phase_id: null };
  const { data } = await supabase
    .from("project_phases")
    .select("id")
    .eq("id", fields.phase_id)
    .eq("project_id", fields.project_id)
    .maybeSingle();
  return data ? fields : { ...fields, phase_id: null };
}

function revalidateTodoViews() {
  revalidatePath("/todos");
  revalidatePath("/goals", "layout"); // daftar goal + detail menampilkan to-do tertaut
  revalidatePath("/projects", "layout"); // status fase proyek mengikuti to-do-nya (trigger database)
  revalidatePath("/summary");
  revalidatePath("/");
}

/** `/todos` dengan minggu yang sedang dilihat (?week=YYYY-MM-DD, selalu Senin) supaya tetap di minggu itu setelah menyimpan. */
function todosHref(week: string | null | undefined, extra = ""): string {
  const params = new URLSearchParams();
  if (week && isISODate(week)) params.set("week", mondayOfISO(week));
  const q = params.toString();
  return `/todos${q || extra ? "?" : ""}${[q, extra].filter(Boolean).join("&")}`;
}

const readWeek = (formData: FormData): string | null => {
  const raw = String(formData.get("week") ?? "").trim();
  return isISODate(raw) ? mondayOfISO(raw) : null;
};

/** Setelah menyimpan: minggu yang sedang dilihat; tanpa itu, minggu tanggal to-do bila bukan minggu ini (supaya hasilnya terlihat). */
function weekAfterSave(week: string | null, dueDate: string | null): string | null {
  if (week) return week;
  if (dueDate && mondayOfISO(dueDate) !== mondayOfISO(todayISO())) return mondayOfISO(dueDate);
  return null;
}

const isoOf = (date: string, minutes: number) => new Date(wibIso(date, minutes)).toISOString();

/** Access token Google bila tersambung; null bila tidak. Gangguan (mis. akses dicabut) dilempar. */
async function googleToken(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  // Dipakai hanya untuk menulis acara: tampilan kalender yang di-cache jadi basi, kosongkan.
  bustCalendar(user.id);
  return await getAccessToken(user.id);
}

/**
 * Buat blok kalender untuk to-do yang sudah ada dan tautkan. Gagal menautkan = acara dihapus lagi (tidak ada acara yatim).
 * Mengembalikan pesan galat, atau null bila berhasil.
 */
async function attachBlock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  todoId: string,
  title: string,
  date: string,
  range: { startMin: number; endMin: number },
): Promise<string | null> {
  try {
    const token = await googleToken();
    if (!token) return "Google Calendar is not connected, so no calendar block was made.";
    const event = await createEvent(token, { date, startMin: range.startMin, endMin: range.endMin, title });
    if (!event) return "Google did not return the new event.";
    const { error } = await supabase
      .from("todos")
      .update({ calendar_event_id: event.id, due_date: date, scheduled_start: isoOf(date, range.startMin), scheduled_end: isoOf(date, range.endMin) })
      .eq("id", todoId);
    if (error) {
      await deleteEvent(token, event.id).catch(() => undefined);
      return error.message;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not create the calendar block.";
  }
}

export async function createTodo(formData: FormData) {
  const fields = readTodoFields(formData);
  const week = readWeek(formData);
  if (!fields.title) {
    redirect(todosHref(week, "new=1&error=" + encodeURIComponent("Title is required.")));
  }
  const range = parseOptionalRange(formData.get("start_time"), formData.get("end_time"));
  if (!range.ok) redirect(todosHref(week, "new=1&error=" + encodeURIComponent(range.error)));
  if (range.value && !fields.due_date) redirect(todosHref(week, "new=1&error=" + encodeURIComponent("Choose a date to put it on the calendar.")));

  const supabase = await createClient();
  const { data: created, error } = await supabase.from("todos").insert(await withValidPhase(supabase, fields)).select("id").single();

  if (error || !created) {
    redirect(todosHref(week, "new=1&error=" + encodeURIComponent(error?.message ?? "Could not save the task.")));
  }

  if (range.value && fields.due_date) {
    const failure = await attachBlock(supabase, created.id, fields.title, fields.due_date, range.value);
    if (failure) {
      // To-do-nya sudah tersimpan; buka lagi formnya supaya blok kalender bisa dicoba ulang.
      revalidateTodoViews();
      redirect(todosHref(week, `edit=${created.id}&error=` + encodeURIComponent(`Task saved, but the calendar block failed: ${failure}`)));
    }
  }

  revalidateTodoViews();
  redirect(todosHref(weekAfterSave(week, fields.due_date)));
}

export async function updateTodo(id: string, formData: FormData) {
  const fields = readTodoFields(formData);
  const week = readWeek(formData);
  // Dibuka dari halaman lain (mis. Proyek)? Setelah simpan kembali ke sana, bukan ke daftar To-Do.
  const from = safeReturnPath(String(formData.get("from") ?? ""));
  const back = (error: string) => redirect(withFrom(todosHref(week, `edit=${id}`), from) + "&error=" + encodeURIComponent(error));
  if (!fields.title) back("Title is required.");

  const range = parseOptionalRange(formData.get("start_time"), formData.get("end_time"));
  if (!range.ok) back(range.error);
  const removeBlock = formData.get("remove_block") === "on";

  const supabase = await createClient();
  const { data: current } = await supabase.from("todos").select("calendar_event_id").eq("id", id).maybeSingle();
  const valid = await withValidPhase(supabase, fields);
  const update: Partial<typeof valid> & { calendar_event_id?: null; scheduled_start?: string | null; scheduled_end?: string | null } = { ...valid };
  let createBlock: { startMin: number; endMin: number } | null = null;

  if (current?.calendar_event_id) {
    // Terhubung ke blok kalender: tanggal dan jam yang diubah di form menggeser acaranya di Google (Google dulu; gagal = tidak ada yang berubah).
    try {
      const token = await googleToken();
      if (removeBlock) {
        if (token) await deleteEvent(token, current.calendar_event_id).catch(() => undefined);
        update.calendar_event_id = null;
        update.scheduled_start = null;
        update.scheduled_end = null;
      } else if (!token) {
        delete update.due_date; // tanpa Google tidak bisa menggeser blok: tanggal tetap mengikuti blok
      } else {
        if (!range.ok || !range.value || !fields.due_date) {
          back("A calendar block needs a date and both times. Tick “Remove from calendar” to unlink it instead.");
        } else {
          await rescheduleEvent(token, current.calendar_event_id, fields.due_date, range.value.startMin, range.value.endMin);
          update.scheduled_start = isoOf(fields.due_date, range.value.startMin);
          update.scheduled_end = isoOf(fields.due_date, range.value.endMin);
        }
      }
    } catch (error) {
      back(error instanceof Error ? error.message : "Could not move the calendar block.");
    }
  } else if (range.ok && range.value) {
    if (!fields.due_date) back("Choose a date to put it on the calendar.");
    createBlock = range.value;
  }

  const { error } = await supabase.from("todos").update(update).eq("id", id);
  if (error) back(error.message);

  if (createBlock && fields.due_date) {
    const failure = await attachBlock(supabase, id, fields.title, fields.due_date, createBlock);
    if (failure) {
      revalidateTodoViews();
      back(`Saved, but the calendar block failed: ${failure}`);
    }
  }

  revalidateTodoViews();
  redirect(from ?? todosHref(week));
}

export type QuickAddResult = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * Tambah cepat satu to-do, dengan blok kalender bila jamnya diisi (kotak "Write a new task" di atas). Tanpa redirect: URL (termasuk ?week=)
 * tetap, halaman dirender ulang. To-do tetap tersimpan walau blok kalendernya gagal (dikembalikan sebagai peringatan).
 */
export async function createTodoQuick(formData: FormData): Promise<QuickAddResult> {
  const title = String(formData.get("title") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = isISODate(dateRaw) ? dateRaw : todayISO();
  const goalId = String(formData.get("goal_id") ?? "").trim();
  if (!title) return { ok: false, error: "Write a title first." };
  if (title.length > 500) return { ok: false, error: "The title is too long." };
  const range = parseOptionalRange(formData.get("start_time"), formData.get("end_time"));
  if (!range.ok) return range;

  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("todos")
    .insert({ title, description: null, status: "todo", priority: "medium", due_date: date, goal_id: UUID_RE.test(goalId) ? goalId : null })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Could not save the task." };

  let warning: string | undefined;
  if (range.value) {
    const failure = await attachBlock(supabase, created.id, title, date, range.value);
    if (failure) warning = `Task added, but the calendar block failed: ${failure}`;
  }
  revalidateTodoViews();
  return { ok: true, ...(warning ? { warning } : {}) };
}

export async function deleteTodo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);

  revalidateTodoViews();
  return { error: error?.message ?? null };
}

/** Hapus langsung dari daftar lain (mis. halaman Proyek). Untuk <form action>, jadi tidak mengembalikan nilai. */
export async function removeTodo(id: string): Promise<void> {
  if (!UUID_RE.test(id)) return;
  await deleteTodo(id);
}

// Undo hapus: masukkan lagi baris yang sama (id dan created_at asli dipertahankan,
// jadi urutan di daftar tidak berubah). Argumen datang dari klien, jadi divalidasi.
export async function restoreTodo(todo: Todo) {
  const valid =
    UUID_RE.test(todo.id) &&
    todo.title.trim() !== "" &&
    ["todo", "in_progress", "done"].includes(todo.status) &&
    ["low", "medium", "high"].includes(todo.priority) &&
    (todo.due_date === null || isISODate(todo.due_date)) &&
    (todo.goal_id === null || UUID_RE.test(todo.goal_id)) &&
    (todo.project_id === null || UUID_RE.test(todo.project_id)) &&
    (todo.phase_id === null || UUID_RE.test(todo.phase_id)) &&
    !Number.isNaN(Date.parse(todo.created_at));
  if (!valid) return { error: "Invalid task data." };

  const supabase = await createClient();
  const row = {
    id: todo.id,
    title: todo.title.trim(),
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    due_date: todo.due_date,
    goal_id: todo.goal_id,
    project_id: todo.project_id,
    phase_id: todo.phase_id,
    completed_at: todo.completed_at,
    created_at: todo.created_at,
  };
  let { error } = await supabase.from("todos").insert(row);

  // Goal, proyek, atau fasenya sudah dihapus sejak tugas ini dihapus -> kembalikan tugasnya tanpa
  // tautan yang hilang. Dicoba dari yang paling kecil dilepas: fase, lalu goal, lalu proyek.
  const fallbacks = [
    { ...row, phase_id: null },
    { ...row, phase_id: null, goal_id: null },
    { ...row, phase_id: null, goal_id: null, project_id: null },
  ];
  for (const attempt of fallbacks) {
    if (error?.code !== "23503") break;
    ({ error } = await supabase.from("todos").insert(attempt));
  }

  revalidateTodoViews();
  return { error: error?.message ?? null };
}

// Checkbox: selesai <-> belum. Status "In progress" tetap bisa diatur lewat form edit.
export async function toggleTodoDone(id: string, currentStatus: TodoStatus) {
  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({ status: currentStatus === "done" ? "todo" : "done" })
    .eq("id", id);

  revalidateTodoViews();
}

/**
 * Tambah cepat satu to-do ke tanggal tertentu (kolom hari di papan mingguan dan kotak "tugas baru" di Beranda). Tanpa redirect: URL
 * (termasuk ?week=) tetap, halaman cuma dirender ulang. Mengembalikan hasil supaya tampilan bisa langsung menampilkan tugasnya dan
 * baru menyesuaikan setelah server selesai, atau menampilkan pesan bila gagal.
 */
export async function addTodoForDay(date: string, rawTitle: string): Promise<QuickAddResult> {
  const title = String(rawTitle ?? "").trim();
  if (!title) return { ok: false, error: "Write a title first." };
  if (title.length > 500) return { ok: false, error: "The title is too long." };
  if (!isISODate(date)) return { ok: false, error: "Unknown day." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const supabase = await createClient();
  const { error } = await supabase.from("todos").insert({ title, description: null, status: "todo", priority: "medium", due_date: date, goal_id: null });
  if (error) return { ok: false, error: error.message };
  revalidateTodoViews();
  return { ok: true };
}

// Tugas yang terlewat (belum selesai) dipindah ke hari ini. Tidak mengubah status/goal.
export async function moveTodoToToday(id: string, today: string) {
  if (!isISODate(today)) return;

  const supabase = await createClient();
  await supabase.from("todos").update({ due_date: today }).eq("id", id).neq("status", "done");

  revalidateTodoViews();
}

// ---- Seret di papan mingguan ---------------------------------------------------------------------

export type PlaceResult = { ok: true } | { ok: false; error: string };

/**
 * Taruh `todoId` di hari `date` pada urutan `orderedIds` (id semua to-do hari itu, dari atas ke bawah). Dipakai saat
 * memindahkan ke hari lain DAN saat mengubah urutan dalam satu hari. Urutan disimpan sebagai sort_order 1..n.
 *
 * To-do yang tertaut ke blok kalender ikut memindahkan blok Google-nya ke hari itu (jam sama), karena acara adalah sumber
 * kebenaran tanggal. Itu dikerjakan DULU: bila Google menolak, tidak ada yang berubah. (Bila penulisan database gagal setelah
 * itu, tanggal to-do disamakan lagi dengan acaranya saat bagian Calendar dibuka.)
 */
export async function placeTodo(todoId: unknown, date: unknown, orderedIds: unknown): Promise<PlaceResult> {
  if (typeof todoId !== "string" || !UUID_RE.test(todoId)) return { ok: false, error: "Unknown to-do." };
  if (typeof date !== "string" || !isISODate(date)) return { ok: false, error: "Invalid date." };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > 200) return { ok: false, error: "Invalid order." };
  const ids = orderedIds as unknown[];
  if (!ids.every((id): id is string => typeof id === "string" && UUID_RE.test(id)) || new Set(ids).size !== ids.length || !ids.includes(todoId)) {
    return { ok: false, error: "Invalid order." };
  }
  const order = ids as string[];

  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const supabase = await createClient();
  const { data: todo, error: readError } = await supabase
    .from("todos")
    .select("id, due_date, calendar_event_id")
    .eq("id", todoId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!todo) return { ok: false, error: "That to-do no longer exists." };

  let patch: Partial<Omit<Todo, "id">> = { due_date: date };
  if (todo.calendar_event_id && todo.due_date !== date) {
    try {
      const token = await getAccessToken(user.id);
      if (!token) return { ok: false, error: "This to-do is linked to a calendar block, but Google Calendar is not connected." };
      bustCalendar(user.id);
      const event = await getEvent(token, todo.calendar_event_id);
      if (event === null) {
        patch = { due_date: date, calendar_event_id: null, scheduled_start: null, scheduled_end: null }; // acaranya sudah dihapus di Google
      } else {
        const start = event.allDay ? null : toWib(event.start);
        const end = event.allDay ? null : toWib(event.end);
        if (!start || !end || start.date !== end.date) {
          return { ok: false, error: "Its calendar block is an all-day or multi-day event. Move it in Google Calendar." };
        }
        await rescheduleEvent(token, todo.calendar_event_id, date, start.minutes, end.minutes);
        const iso = (minutes: number) => new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+07:00`).toISOString();
        patch = { due_date: date, scheduled_start: iso(start.minutes), scheduled_end: iso(end.minutes) };
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not move the calendar block." };
    }
  }

  const results = await Promise.all(
    order.map((id, index) =>
      supabase
        .from("todos")
        .update(id === todoId ? { ...patch, sort_order: index + 1 } : { sort_order: index + 1 })
        .eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidateTodoViews();
  return { ok: true };
}

// ---- Edit massal ---------------------------------------------------------------------------------------------------

export type BatchResult = { ok: true; updated: number; keptDate: number } | { ok: false; error: string };

/**
 * Ubah beberapa to-do sekaligus. Masukan divalidasi di server (parseBatchInput). To-do yang tertaut ke blok kalender
 * tetap mengikuti blok untuk tanggalnya: tanggalnya tidak diubah (dihitung di `keptDate`), kolom lain tetap berubah.
 * Proyek/fase baru harus ada dan fase harus milik proyek itu.
 */
export async function batchUpdateTodos(raw: unknown): Promise<BatchResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const parsed = parseBatchInput(raw);
  if (!parsed.ok) return parsed;
  const { ids, patch } = parsed;
  const supabase = await createClient();

  if (patch.goal_id) {
    const { data } = await supabase.from("goals").select("id").eq("id", patch.goal_id).maybeSingle();
    if (!data) return { ok: false, error: "That goal no longer exists." };
  }
  if (patch.project_id) {
    const { data } = await supabase.from("projects").select("id").eq("id", patch.project_id).maybeSingle();
    if (!data) return { ok: false, error: "That project no longer exists." };
    if (patch.phase_id) {
      const { data: phase } = await supabase.from("project_phases").select("id").eq("id", patch.phase_id).eq("project_id", patch.project_id).maybeSingle();
      if (!phase) return { ok: false, error: "That phase does not belong to the chosen project." };
    }
  }

  const { data: rows, error: readError } = await supabase.from("todos").select("id, calendar_event_id").in("id", ids);
  if (readError) return { ok: false, error: readError.message };
  const found = rows ?? [];
  if (found.length === 0) return { ok: false, error: "The selected tasks no longer exist." };
  const linked = found.filter((r) => r.calendar_event_id).map((r) => r.id);
  const free = found.filter((r) => !r.calendar_event_id).map((r) => r.id);

  if (free.length > 0) {
    const { error } = await supabase.from("todos").update(patch).in("id", free);
    if (error) return { ok: false, error: error.message };
  }
  let keptDate = 0;
  if (linked.length > 0) {
    if ("due_date" in patch) keptDate = linked.length;
    const rest = patchForLinked(patch);
    if (rest) {
      const { error } = await supabase.from("todos").update(rest).in("id", linked);
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidateTodoViews();
  return { ok: true, updated: found.length, keptDate };
}

export async function batchDeleteTodos(raw: unknown): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const ids = Array.isArray(raw) ? Array.from(new Set(raw.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))) : [];
  if (ids.length === 0) return { ok: false, error: "Select at least one task." };
  if (ids.length > BATCH_MAX) return { ok: false, error: `Select at most ${BATCH_MAX} tasks at a time.` };
  const supabase = await createClient();
  const { data, error } = await supabase.from("todos").delete().in("id", ids).select("id");
  if (error) return { ok: false, error: error.message };
  revalidateTodoViews();
  return { ok: true, deleted: (data ?? []).length };
}
