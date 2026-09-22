"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  revalidatePath("/todos");
  revalidatePath("/summary");
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

  revalidatePath("/todos");
  revalidatePath("/summary");
  redirect("/todos");
}

export async function deleteTodo(id: string) {
  const supabase = await createClient();
  await supabase.from("todos").delete().eq("id", id);

  revalidatePath("/todos");
  revalidatePath("/summary");
}

const STATUS_CYCLE: Record<TodoStatus, TodoStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export async function cycleTodoStatus(id: string, currentStatus: TodoStatus) {
  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({ status: STATUS_CYCLE[currentStatus] })
    .eq("id", id);

  revalidatePath("/todos");
  revalidatePath("/summary");
}
