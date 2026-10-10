"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate, todayISO } from "@/lib/date";
import type { GoalStatus, GoalType } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readGoalFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type: GoalType = formData.get("type") === "work" ? "work" : "learning";
  return { title, description: description || null, type };
}

function readItemFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const groupName = String(formData.get("group_name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  return { title, group_name: groupName || null, note: note || null };
}

// Goal tampil di daftar, detail, dan dropdown/filter To-Do.
function revalidateGoalViews(goalId?: string) {
  revalidatePath("/goals");
  if (goalId) revalidatePath(`/goals/${goalId}`);
  revalidatePath("/todos");
  revalidatePath("/summary");
}

// ---- Goal ---------------------------------------------------------------

export async function createGoal(formData: FormData) {
  const fields = readGoalFields(formData);
  if (!fields.title) {
    redirect("/goals?new=1&error=" + encodeURIComponent("Title is required."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("goals").insert(fields);
  if (error) {
    redirect("/goals?new=1&error=" + encodeURIComponent(error.message));
  }

  revalidateGoalViews();
  redirect("/goals");
}

export async function updateGoal(id: string, formData: FormData) {
  const fields = readGoalFields(formData);
  if (!fields.title) {
    redirect(`/goals/${id}?edit=1&error=` + encodeURIComponent("Title is required."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("goals").update(fields).eq("id", id);
  if (error) {
    redirect(`/goals/${id}?edit=1&error=` + encodeURIComponent(error.message));
  }

  revalidateGoalViews(id);
  redirect(`/goals/${id}`);
}

// Goal diselesaikan MANUAL lewat checkbox ini; tidak ada yang menutup goal otomatis
// (bukan dari item, bukan dari to-do). completed_at diisi trigger di database.
export async function toggleGoalDone(id: string, currentStatus: GoalStatus) {
  const supabase = await createClient();
  await supabase
    .from("goals")
    .update({ status: currentStatus === "done" ? "active" : "done" })
    .eq("id", id);

  revalidateGoalViews(id);
}

export async function deleteGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("goals").delete().eq("id", id);
  if (error) {
    redirect(`/goals/${id}?error=` + encodeURIComponent(error.message));
  }

  revalidateGoalViews();
  redirect("/goals");
}

// ---- To-do yang tertaut ke goal -----------------------------------------------

// Tambah to-do baru yang langsung tertaut ke goal ini (tanggal kosong = hari ini, WIB).
// To-do ini tetap tugas harian biasa: muncul di /todos dan tidak mengubah checklist goal.
export async function createTodoForGoal(goalId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("due_date") ?? "").trim();
  if (!title || !UUID_RE.test(goalId)) return;

  const supabase = await createClient();
  await supabase.from("todos").insert({
    title,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: isISODate(date) ? date : todayISO(),
    goal_id: goalId,
  });

  revalidateGoalViews(goalId);
  revalidatePath("/summary");
}

// ---- Item checklist -------------------------------------------------------

export async function addGoalItem(goalId: string, formData: FormData) {
  const fields = readItemFields(formData);
  if (!fields.title) {
    redirect(`/goals/${goalId}?error=` + encodeURIComponent("Item title is required."));
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("goal_items")
    .select("position")
    .eq("goal_id", goalId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("goal_items")
    .insert({ goal_id: goalId, ...fields, position: (last?.position ?? 0) + 1 });
  if (error) {
    redirect(`/goals/${goalId}?error=` + encodeURIComponent(error.message));
  }

  revalidateGoalViews(goalId);
}

export async function updateGoalItem(goalId: string, itemId: string, formData: FormData) {
  const fields = readItemFields(formData);
  if (!fields.title) {
    redirect(`/goals/${goalId}?item=${itemId}&error=` + encodeURIComponent("Item title is required."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("goal_items").update(fields).eq("id", itemId).eq("goal_id", goalId);
  if (error) {
    redirect(`/goals/${goalId}?item=${itemId}&error=` + encodeURIComponent(error.message));
  }

  revalidateGoalViews(goalId);
  redirect(`/goals/${goalId}`);
}

export async function toggleGoalItem(goalId: string, itemId: string, isDone: boolean) {
  const supabase = await createClient();
  await supabase.from("goal_items").update({ is_done: !isDone }).eq("id", itemId).eq("goal_id", goalId);

  revalidateGoalViews(goalId);
}

export async function deleteGoalItem(goalId: string, itemId: string) {
  const supabase = await createClient();
  await supabase.from("goal_items").delete().eq("id", itemId).eq("goal_id", goalId);

  revalidateGoalViews(goalId);
}

// Naik/turun di dalam grup yang sama: tukar `position` dengan tetangganya.
export async function moveGoalItem(goalId: string, itemId: string, direction: "up" | "down") {
  if (!UUID_RE.test(goalId) || !UUID_RE.test(itemId)) return;

  const supabase = await createClient();
  const { data: items } = await supabase
    .from("goal_items")
    .select("id, group_name, position")
    .eq("goal_id", goalId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  if (!items) return;

  const current = items.find((i) => i.id === itemId);
  if (!current) return;

  const siblings = items.filter((i) => i.group_name === current.group_name);
  const index = siblings.findIndex((i) => i.id === itemId);
  const neighbor = siblings[direction === "up" ? index - 1 : index + 1];
  if (!neighbor) return;

  // Posisi bisa kembar (data lama / default 0): beri nilai berbeda saat bertukar.
  const [a, b] =
    current.position === neighbor.position
      ? direction === "up"
        ? [neighbor.position, neighbor.position + 1]
        : [neighbor.position + 1, neighbor.position]
      : [neighbor.position, current.position];

  await Promise.all([
    supabase.from("goal_items").update({ position: a }).eq("id", current.id),
    supabase.from("goal_items").update({ position: b }).eq("id", neighbor.id),
  ]);

  revalidateGoalViews(goalId);
}
