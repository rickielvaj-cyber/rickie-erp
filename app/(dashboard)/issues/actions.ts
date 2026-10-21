"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncSearchAfterWrite } from "@/lib/search/sync";
import { isISODate, todayISO } from "@/lib/date";
import { defaultIssueTitle, isIssueCategory } from "@/lib/issues";
import { getAuthUser } from "@/lib/supabase/auth";
import { isKbModuleSlug } from "@/lib/kb/modules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readIssueFields(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const category = text("category");
  const date = text("date_resolved");
  const description = text("description");

  return {
    // Judul hanya label internal website (tidak ada di sheet): kosong = diambil dari deskripsi.
    title: text("title") || defaultIssueTitle(description),
    module: text("module") || null,
    // Database menolak kategori di luar 10 pilihan; di sini diperiksa dulu supaya pesannya jelas.
    category: isIssueCategory(category) ? category : null,
    categoryInvalid: category !== "" && !isIssueCategory(category),
    description,
    root_cause: text("root_cause") || null,
    resolution: text("resolution") || null,
    // Tanggal kosong = hari ini (zona Asia/Jakarta).
    date_resolved: isISODate(date) ? date : todayISO(),
    clientId: text("client_id"),
    projectId: text("project_id"),
    // Issue lama yang namanya belum cocok dengan daftar klien: teksnya dipertahankan
    // kalau tidak ada klien yang dipilih, supaya menyimpan form tidak menghapus data.
    legacyClientName: text("legacy_client_name"),
  };
}

function revalidateIssueViews() {
  syncSearchAfterWrite();
  revalidatePath("/issues");
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/summary");
  revalidatePath("/");
}

function validate(fields: ReturnType<typeof readIssueFields>): string | null {
  if (!fields.description) return "Description is required.";
  if (fields.categoryInvalid) return "Invalid category.";
  if (fields.clientId && !UUID_RE.test(fields.clientId)) return "Invalid client.";
  if (fields.projectId && !UUID_RE.test(fields.projectId)) return "Invalid project.";
  return null;
}

/** Nama klien + id yang disimpan di issue. client_name selalu = nama kanonik (persis Sheet1). */
async function resolveClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: ReturnType<typeof readIssueFields>,
): Promise<{ client_id: string | null; client_name: string | null; error?: string }> {
  if (!fields.clientId) {
    return { client_id: null, client_name: fields.legacyClientName || null };
  }
  const { data, error } = await supabase
    .from("clients")
    .select("id, canonical_name")
    .eq("id", fields.clientId)
    .maybeSingle();
  if (error) return { client_id: null, client_name: null, error: error.message };
  if (!data) return { client_id: null, client_name: null, error: "Client not found. Add it under Clients first." };
  return { client_id: data.id, client_name: data.canonical_name };
}

function dbFields(fields: ReturnType<typeof readIssueFields>, client: { client_id: string | null; client_name: string | null }) {
  const { categoryInvalid, clientId, legacyClientName, projectId, ...rest } = fields;
  void categoryInvalid;
  void clientId;
  void legacyClientName;
  // Proyek opsional: tautan saja, tidak dipakai untuk sheet (tidak ikut Copy).
  return { ...rest, client_id: client.client_id, client_name: client.client_name, project_id: projectId || null };
}

export async function createIssue(formData: FormData) {
  const fields = readIssueFields(formData);
  const problem = validate(fields);
  if (problem) redirect("/issues?new=1&error=" + encodeURIComponent(problem));

  const supabase = await createClient();
  const client = await resolveClient(supabase, fields);
  if (client.error) redirect("/issues?new=1&error=" + encodeURIComponent(client.error));

  const { error } = await supabase.from("issue_log").insert(dbFields(fields, client));
  if (error) redirect("/issues?new=1&error=" + encodeURIComponent(error.message));

  revalidateIssueViews();
  redirect("/issues");
}

export async function updateIssue(id: string, formData: FormData) {
  const fields = readIssueFields(formData);
  const problem = validate(fields);
  if (problem) redirect(`/issues?edit=${id}&error=` + encodeURIComponent(problem));

  const supabase = await createClient();
  const client = await resolveClient(supabase, fields);
  if (client.error) redirect(`/issues?edit=${id}&error=` + encodeURIComponent(client.error));

  const next = dbFields(fields, client);

  // Kalau salah satu dari 6 kolom sheet berubah sejak disalin, tanda "sudah disalin" dicabut:
  // isi di sheet sudah tidak sama dengan isi di sini.
  const { data: before } = await supabase
    .from("issue_log")
    .select("client_name, module, category, description, root_cause, resolution")
    .eq("id", id)
    .maybeSingle();
  const sheetChanged =
    !before ||
    before.client_name !== next.client_name ||
    before.module !== next.module ||
    before.category !== next.category ||
    before.description !== next.description ||
    before.root_cause !== next.root_cause ||
    before.resolution !== next.resolution;

  const { error } = await supabase
    .from("issue_log")
    .update(sheetChanged ? { ...next, copied_to_sheet_at: null } : next)
    .eq("id", id);
  if (error) redirect(`/issues?edit=${id}&error=` + encodeURIComponent(error.message));

  revalidateIssueViews();
  redirect("/issues");
}

export async function deleteIssue(id: string) {
  const supabase = await createClient();
  await supabase.from("issue_log").delete().eq("id", id);

  revalidateIssueViews();
}

// Penanda manual "isi issue ini sudah ada di sheet" (website tidak bisa melihat sheet).
export async function setIssueCopied(id: string, copied: boolean) {
  if (!UUID_RE.test(id)) return;
  const supabase = await createClient();
  await supabase
    .from("issue_log")
    .update({ copied_to_sheet_at: copied ? new Date().toISOString() : null })
    .eq("id", id);

  revalidatePath("/issues");
}

/**
 * Buat entri Knowledge Base dari issue (isi sudah diperiksa/diedit di formulir) dan simpan tautannya di issue.
 * Tidak membuat duplikat: issue yang sudah punya entri ditolak. Entri baru ikut terindeks (sync-on-save).
 */
export async function createKbEntryFromIssue(issueId: string, formData: FormData) {
  const back = (message: string): never => redirect(`/issues?kb=${issueId}&error=` + encodeURIComponent(message));
  if (!UUID_RE.test(issueId)) redirect("/issues");

  const kbModule = String(formData.get("kb_module") ?? "");
  const title = String(formData.get("kb_title") ?? "").trim();
  const content = String(formData.get("kb_content") ?? "").trim();
  if (!isKbModuleSlug(kbModule)) back("Choose a chapter.");
  if (!title) back("Title is required.");
  if (!content) back("Content is required.");

  const user = await getAuthUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: issue } = await supabase.from("issue_log").select("id, kb_entry_id").eq("id", issueId).maybeSingle();
  if (!issue) redirect("/issues");
  if (issue.kb_entry_id) back("This issue is already in the Knowledge Base.");

  const { data: entry, error } = await supabase
    .from("kb_entries")
    .insert({ user_id: user.id, module: kbModule, title, content })
    .select("id")
    .single();
  if (error || !entry) back(error?.message ?? "Could not create the entry.");

  const { error: linkError } = await supabase.from("issue_log").update({ kb_entry_id: entry!.id }).eq("id", issueId);
  if (linkError) {
    // Tanpa tautan, klik berikutnya akan membuat duplikat: batalkan entri yang baru dibuat.
    await supabase.from("kb_entries").delete().eq("id", entry!.id);
    back(linkError.message);
  }

  syncSearchAfterWrite();
  revalidatePath("/issues");
  revalidatePath("/knowledge-base", "layout");
  redirect(`/knowledge-base/${kbModule}`);
}
