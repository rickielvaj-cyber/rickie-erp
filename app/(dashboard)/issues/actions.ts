"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function readIssueFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const clientName = String(formData.get("client_name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const resolution = String(formData.get("resolution") ?? "").trim();
  const dateResolved = String(formData.get("date_resolved") ?? "").trim();

  return {
    title,
    client_name: clientName || null,
    category: category || null,
    description,
    resolution: resolution || null,
    date_resolved: dateResolved || null,
  };
}

export async function createIssue(formData: FormData) {
  const fields = readIssueFields(formData);
  if (!fields.title || !fields.description) {
    redirect("/issues?new=1&error=" + encodeURIComponent("Judul dan deskripsi wajib diisi."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("issue_log").insert(fields);

  if (error) {
    redirect("/issues?new=1&error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/issues");
  revalidatePath("/summary");
  redirect("/issues");
}

export async function updateIssue(id: string, formData: FormData) {
  const fields = readIssueFields(formData);
  if (!fields.title || !fields.description) {
    redirect(`/issues?edit=${id}&error=` + encodeURIComponent("Judul dan deskripsi wajib diisi."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("issue_log").update(fields).eq("id", id);

  if (error) {
    redirect(`/issues?edit=${id}&error=` + encodeURIComponent(error.message));
  }

  revalidatePath("/issues");
  revalidatePath("/summary");
  redirect("/issues");
}

export async function deleteIssue(id: string) {
  const supabase = await createClient();
  await supabase.from("issue_log").delete().eq("id", id);

  revalidatePath("/issues");
  revalidatePath("/summary");
}
