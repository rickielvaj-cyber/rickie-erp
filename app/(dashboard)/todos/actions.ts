"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate } from "@/lib/date";
import type { TodoPriority, TodoStatus } from "@/lib/types";

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
  await supabase.from("todos").delete().eq("id", id);

  revalidateTodoViews();
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
