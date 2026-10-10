"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/date";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readTodoFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TodoStatus;
  const priority = String(formData.get("priority") ?? "medium") as TodoPriority;
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const goalId = String(formData.get("goal_id") ?? "").trim();

  return {
    title,
    description: description || null,
    status,
    priority,
    due_date: dueDate || null,
    goal_id: UUID_RE.test(goalId) ? goalId : null,
  };
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
  const { error } = await supabase.from("todos").insert(fields);

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
  const { error } = await supabase.from("todos").update(fields).eq("id", id);

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
    completed_at: todo.completed_at,
    created_at: todo.created_at,
  };
  let { error } = await supabase.from("todos").insert(row);

  // Goal-nya sudah dihapus sejak tugas ini dihapus -> kembalikan tugasnya tanpa goal.
  if (error?.code === "23503" && row.goal_id) {
    ({ error } = await supabase.from("todos").insert({ ...row, goal_id: null }));
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
