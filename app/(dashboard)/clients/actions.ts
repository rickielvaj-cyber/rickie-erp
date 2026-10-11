"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readClientFields(formData: FormData) {
  const name = String(formData.get("canonical_name") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  // Alias: dipisah koma atau baris baru; nama kanonik sendiri dan duplikat dibuang.
  const aliases = Array.from(
    new Set(
      String(formData.get("aliases") ?? "")
        .split(/[,\n]/)
        .map((a) => a.replace(/\s+/g, " ").trim())
        .filter((a) => a && a.toLowerCase() !== name.toLowerCase()),
    ),
  );
  const kind = formData.get("kind") === "partner" ? ("partner" as const) : ("client" as const);
  return { name, aliases, kind };
}

function revalidateClientViews() {
  revalidatePath("/clients");
  revalidatePath("/issues");
  revalidatePath("/summary");
}

function failure(error: { code?: string; message: string }) {
  return error.code === "23505" ? "A client or partner with this name already exists." : error.message;
}

export async function addClient(formData: FormData) {
  const { name, aliases, kind } = readClientFields(formData);
  if (!name) redirect("/clients?error=" + encodeURIComponent("Name is required."));

  const supabase = await createClient();
  // Klien baru dari website belum terbukti ada di Sheet1, jadi mulai sebagai "belum terverifikasi".
  const { error } = await supabase.from("clients").insert({ canonical_name: name, aliases, kind, verified_in_sheet: false });
  if (error) redirect("/clients?error=" + encodeURIComponent(failure(error)));

  revalidateClientViews();
  redirect("/clients");
}

export async function updateClient(id: string, formData: FormData) {
  if (!UUID_RE.test(id)) redirect("/clients");
  const { name, aliases, kind } = readClientFields(formData);
  if (!name) redirect(`/clients?edit=${id}&error=` + encodeURIComponent("Name is required."));

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ canonical_name: name, aliases, kind }).eq("id", id);
  if (error) redirect(`/clients?edit=${id}&error=` + encodeURIComponent(failure(error)));

  // client_name di issue adalah salinan nama kanonik (dipakai Ringkasan Mingguan dan Export CSV);
  // ikut diperbarui supaya tidak ada issue yang tertinggal dengan ejaan lama.
  const { error: cascadeError } = await supabase.from("issue_log").update({ client_name: name }).eq("client_id", id);
  if (cascadeError) redirect(`/clients?edit=${id}&error=` + encodeURIComponent(cascadeError.message));

  revalidateClientViews();
  redirect("/clients");
}

export async function setClientVerified(id: string, verified: boolean) {
  if (!UUID_RE.test(id)) return;
  const supabase = await createClient();
  await supabase.from("clients").update({ verified_in_sheet: verified }).eq("id", id);
  revalidateClientViews();
}

// Nonaktif = tidak muncul di pilihan form issue baru; issue lama tetap tertaut. Tidak ada hapus.
export async function setClientActive(id: string, active: boolean) {
  if (!UUID_RE.test(id)) return;
  const supabase = await createClient();
  await supabase.from("clients").update({ active }).eq("id", id);
  revalidateClientViews();
}
