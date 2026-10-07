"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/date";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";

function readTodoFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "todo") as TodoStatus;
  const priority = String(formData.get("priority") ?? "medium") as TodoPriority;
  const dueDate = String(formData.get("due_date") ?? "").trim();

  return {
    title,
    description: description || null,
    status,
    priority,
    due_date: dueDate || null,
  };
}

function revalidateTodoViews() {
  revalidatePath("/todos");
  revalidatePath("/summary");
  revalidatePath("/");
}

export async function createTodo(formData: FormData) {
  const fields = readTodoFields(formData);
  if (!fields.title) {
    redirect("/todos?new=1&error=" + encodeURIComponent("Judul wajib diisi."));
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
    redirect(`/todos?edit=${id}&error=` + encodeURIComponent("Judul wajib diisi."));
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Undo hapus: masukkan lagi baris yang sama (id dan created_at asli dipertahankan,
// jadi urutan di daftar tidak berubah). Argumen datang dari klien, jadi divalidasi.
export async function restoreTodo(todo: Todo) {
  const valid =
    UUID_RE.test(todo.id) &&
    todo.title.trim() !== "" &&
    ["todo", "in_progress", "done"].includes(todo.status) &&
    ["low", "medium", "high"].includes(todo.priority) &&
    (todo.due_date === null || isISODate(todo.due_date)) &&
    !Number.isNaN(Date.parse(todo.created_at));
  if (!valid) return { error: "Data tugas tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.from("todos").insert({
    id: todo.id,
    title: todo.title.trim(),
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    due_date: todo.due_date,
    created_at: todo.created_at,
  });

  revalidateTodoViews();
  return { error: error?.message ?? null };
}

// Checkbox: selesai <-> belum. Status "Dikerjakan" tetap bisa diatur lewat form edit.
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
  if (!title || !isISODate(date)) return;

  const supabase = await createClient();
  await supabase.from("todos").insert({
    title,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: date,
  });

  revalidateTodoViews();
}
