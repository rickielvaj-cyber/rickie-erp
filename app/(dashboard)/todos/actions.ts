"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/date";
import { getAuthUser } from "@/lib/supabase/auth";
import { getAccessToken } from "@/lib/google/store";
import { getEvent, rescheduleEvent } from "@/lib/google/calendar";
import { toWib } from "@/lib/google/layout";
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
  revalidatePath("/summary");
  revalidatePath("/");
}

export async function createTodo(formData: FormData) {
  const fields = readTodoFields(formData);
  if (!fields.title) {
    redirect("/todos?new=1&error=" + encodeURIComponent("Title is required."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("todos").insert(await withValidPhase(supabase, fields));

  if (error) {
    redirect("/todos?new=1&error=" + encodeURIComponent(error.message));
  }

  revalidateTodoViews();
  redirect("/todos");
}

export async function updateTodo(id: string, formData: FormData) {
  const fields = readTodoFields(formData);
  if (!fields.title) {
    redirect(`/todos?edit=${id}&error=` + encodeURIComponent("Title is required."));
  }

  const supabase = await createClient();
  // To-do yang tertaut ke blok kalender: tanggalnya mengikuti blok (geser bloknya untuk mengubah tanggal), jadi isian
  // tanggal dari form diabaikan di server (formulir menampilkannya hanya-baca).
  const { data: current } = await supabase.from("todos").select("calendar_event_id").eq("id", id).maybeSingle();
  const valid = await withValidPhase(supabase, fields);
  const update: Partial<typeof valid> = { ...valid };
  if (current?.calendar_event_id) delete update.due_date;
  const { error } = await supabase.from("todos").update(update).eq("id", id);

  if (error) {
    redirect(`/todos?edit=${id}&error=` + encodeURIComponent(error.message));
  }

  revalidateTodoViews();
  redirect("/todos");
}

export async function deleteTodo(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);

  revalidateTodoViews();
  return { error: error?.message ?? null };
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

// Tambah cepat satu tugas ke tanggal tertentu (kolom hari di pelacak mingguan,
// atau kotak "tugas baru" di panel Hari ini). Tanpa redirect: URL (termasuk
// ?week=) tetap, halaman cuma dirender ulang.
export async function createTodoForDay(date: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const goalId = String(formData.get("goal_id") ?? "").trim();
  if (!title || !isISODate(date)) return;

  const supabase = await createClient();
  await supabase.from("todos").insert({
    title,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: date,
    goal_id: UUID_RE.test(goalId) ? goalId : null,
  });

  revalidateTodoViews();
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
