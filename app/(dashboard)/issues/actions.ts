"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISODate, todayISO } from "@/lib/date";
import { isIssueCategory } from "@/lib/issues";

function readIssueFields(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const category = text("category");
  const date = text("date_resolved");

  return {
    title: text("title"),
    client_name: text("client_name") || null,
    module: text("module") || null,
    // Database menolak kategori di luar 10 pilihan; di sini diperiksa dulu supaya pesannya jelas.
    category: isIssueCategory(category) ? category : null,
    categoryInvalid: category !== "" && !isIssueCategory(category),
    description: text("description"),
    root_cause: text("root_cause") || null,
    resolution: text("resolution") || null,
    // Tanggal kosong = hari ini (zona Asia/Jakarta).
    date_resolved: isISODate(date) ? date : todayISO(),
  };
}

function revalidateIssueViews() {
  revalidatePath("/issues");
  revalidatePath("/summary");
  revalidatePath("/");
}

function validate(fields: ReturnType<typeof readIssueFields>): string | null {
  if (!fields.title || !fields.description) return "Judul dan deskripsi wajib diisi.";
  if (fields.categoryInvalid) return "Kategori tidak valid.";
  return null;
}

export async function createIssue(formData: FormData) {
  const { categoryInvalid, ...fields } = readIssueFields(formData);
  const problem = validate({ ...fields, categoryInvalid });
  if (problem) redirect("/issues?new=1&error=" + encodeURIComponent(problem));

  const supabase = await createClient();
  const { error } = await supabase.from("issue_log").insert(fields);
  if (error) redirect("/issues?new=1&error=" + encodeURIComponent(error.message));

  revalidateIssueViews();
  redirect("/issues");
}

export async function updateIssue(id: string, formData: FormData) {
  const { categoryInvalid, ...fields } = readIssueFields(formData);
  const problem = validate({ ...fields, categoryInvalid });
  if (problem) redirect(`/issues?edit=${id}&error=` + encodeURIComponent(problem));

  const supabase = await createClient();
  const { error } = await supabase.from("issue_log").update(fields).eq("id", id);
  if (error) redirect(`/issues?edit=${id}&error=` + encodeURIComponent(error.message));

  revalidateIssueViews();
  redirect("/issues");
}

export async function deleteIssue(id: string) {
  const supabase = await createClient();
  await supabase.from("issue_log").delete().eq("id", id);

  revalidateIssueViews();
}
