"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncSearchAfterWrite } from "@/lib/search/sync";
import { isISODate, todayISO } from "@/lib/date";
import { isPhaseStatus, isProjectStatus, STANDARD_PHASES } from "@/lib/projects";
import type { PhaseStatus } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateProjectViews(projectId?: string) {
  syncSearchAfterWrite();
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/todos");
  revalidatePath("/issues");
  revalidatePath("/summary");
}

function dateOrNull(value: string) {
  return isISODate(value) ? value : null;
}

function readProjectFields(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const clientId = text("client_id");
  const status = text("status");
  const startDate = dateOrNull(text("start_date"));
  const targetDate = dateOrNull(text("target_date"));
  const partnerIds = Array.from(
    new Set(formData.getAll("partner_ids").map(String).filter((id) => UUID_RE.test(id) && id !== clientId)),
  );

  let error: string | null = null;
  if (!text("name")) error = "Project name is required.";
  else if (!UUID_RE.test(clientId)) error = "Choose a client for this project.";
  else if (startDate && targetDate && targetDate < startDate) error = "The target date is before the start date.";

  return {
    error,
    fields: {
      name: text("name"),
      client_id: clientId,
      status: isProjectStatus(status) ? status : ("active" as const),
      start_date: startDate,
      target_date: targetDate,
      note: text("note") || null,
    },
    partnerIds,
    withStandardPhases: formData.get("standard_phases") === "on",
  };
}

// Samakan daftar partner proyek dengan pilihan di form: tambah yang baru dulu, baru hapus yang dilepas,
// supaya kegagalan di tengah jalan tidak membuat partner yang sudah ada hilang.
async function syncPartners(supabase: Supabase, projectId: string, partnerIds: string[]) {
  const { data: existing, error } = await supabase.from("project_partners").select("partner_id").eq("project_id", projectId);
  if (error) return error.message;
  const have = new Set((existing ?? []).map((r) => r.partner_id));
  const toAdd = partnerIds.filter((id) => !have.has(id));
  const toRemove = Array.from(have).filter((id) => !partnerIds.includes(id));

  if (toAdd.length > 0) {
    const { error: addError } = await supabase
      .from("project_partners")
      .insert(toAdd.map((partner_id) => ({ project_id: projectId, partner_id })));
    if (addError) return addError.message;
  }
  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from("project_partners")
      .delete()
      .eq("project_id", projectId)
      .in("partner_id", toRemove);
    if (removeError) return removeError.message;
  }
  return null;
}

export async function createProject(formData: FormData) {
  const { error: problem, fields, partnerIds, withStandardPhases } = readProjectFields(formData);
  if (problem) redirect("/projects?new=1&error=" + encodeURIComponent(problem));

  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").insert(fields).select("id").single();
  if (error || !project) redirect("/projects?new=1&error=" + encodeURIComponent(error?.message ?? "Could not create the project."));

  let followUpError = await syncPartners(supabase, project.id, partnerIds);
  if (!followUpError && withStandardPhases) {
    const { error: phaseError } = await supabase
      .from("project_phases")
      .insert(STANDARD_PHASES.map((name, position) => ({ project_id: project.id, name, position })));
    followUpError = phaseError?.message ?? null;
  }
  if (followUpError) {
    // Jangan tinggalkan proyek setengah jadi.
    await supabase.from("projects").delete().eq("id", project.id);
    redirect("/projects?new=1&error=" + encodeURIComponent(followUpError));
  }

  revalidateProjectViews(project.id);
  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  if (!UUID_RE.test(id)) redirect("/projects");
  const { error: problem, fields, partnerIds } = readProjectFields(formData);
  if (problem) redirect(`/projects/${id}?edit=1&error=` + encodeURIComponent(problem));

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(fields).eq("id", id);
  if (error) redirect(`/projects/${id}?edit=1&error=` + encodeURIComponent(error.message));

  const partnerError = await syncPartners(supabase, id, partnerIds);
  if (partnerError) redirect(`/projects/${id}?edit=1&error=` + encodeURIComponent(partnerError));

  revalidateProjectViews(id);
  redirect(`/projects/${id}`);
}

// To-do dan issue yang tertaut tidak ikut terhapus (project_id jadi kosong); fase ikut terhapus.
export async function deleteProject(id: string) {
  if (!UUID_RE.test(id)) return;
  const supabase = await createClient();
  await supabase.from("projects").delete().eq("id", id);
  revalidateProjectViews();
  redirect("/projects");
}

// ---- Fase ------------------------------------------------------------------

export async function addPhase(projectId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!UUID_RE.test(projectId)) return;
  if (!name) redirect(`/projects/${projectId}?error=` + encodeURIComponent("Phase name is required."));

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("project_phases")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("project_phases")
    .insert({ project_id: projectId, name, position: (last?.position ?? -1) + 1 });
  if (error) redirect(`/projects/${projectId}?error=` + encodeURIComponent(error.message));

  revalidateProjectViews(projectId);
}

export async function updatePhase(projectId: string, phaseId: string, formData: FormData) {
  if (!UUID_RE.test(projectId) || !UUID_RE.test(phaseId)) return;
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const status = text("status");
  const startDate = dateOrNull(text("start_date"));
  const targetDate = dateOrNull(text("target_date"));

  const back = `/projects/${projectId}?phase=${phaseId}`;
  if (!text("name")) redirect(`${back}&error=` + encodeURIComponent("Phase name is required."));
  if (startDate && targetDate && targetDate < startDate) {
    redirect(`${back}&error=` + encodeURIComponent("The target date is before the start date."));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_phases")
    .update({
      name: text("name"),
      status: isPhaseStatus(status) ? status : "not_started",
      start_date: startDate,
      target_date: targetDate,
      note: text("note") || null,
    })
    .eq("id", phaseId)
    .eq("project_id", projectId);
  if (error) redirect(`${back}&error=` + encodeURIComponent(error.message));

  revalidateProjectViews(projectId);
  redirect(`/projects/${projectId}`);
}

const NEXT_PHASE_STATUS: Record<PhaseStatus, PhaseStatus> = {
  not_started: "in_progress",
  in_progress: "done",
  done: "not_started",
};

// Satu klik pada status fase: Not started -> In progress -> Done -> Not started.
export async function cyclePhaseStatus(projectId: string, phaseId: string, current: PhaseStatus) {
  if (!UUID_RE.test(projectId) || !UUID_RE.test(phaseId) || !isPhaseStatus(current)) return;
  const supabase = await createClient();
  await supabase
    .from("project_phases")
    .update({ status: NEXT_PHASE_STATUS[current] })
    .eq("id", phaseId)
    .eq("project_id", projectId);
  revalidateProjectViews(projectId);
}

export async function deletePhase(projectId: string, phaseId: string) {
  if (!UUID_RE.test(projectId) || !UUID_RE.test(phaseId)) return;
  const supabase = await createClient();
  await supabase.from("project_phases").delete().eq("id", phaseId).eq("project_id", projectId);
  revalidateProjectViews(projectId);
}

// Naik/turun: tukar `position` dengan tetangganya (pola sama dengan item checklist Goals).
export async function movePhase(projectId: string, phaseId: string, direction: "up" | "down") {
  if (!UUID_RE.test(projectId) || !UUID_RE.test(phaseId)) return;

  const supabase = await createClient();
  const { data: phases } = await supabase
    .from("project_phases")
    .select("id, position")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (!phases) return;

  const index = phases.findIndex((p) => p.id === phaseId);
  const neighbor = phases[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !neighbor) return;
  const current = phases[index];

  // Posisi bisa kembar: beri nilai berbeda saat bertukar.
  const [a, b] =
    current.position === neighbor.position
      ? direction === "up"
        ? [neighbor.position, neighbor.position + 1]
        : [neighbor.position + 1, neighbor.position]
      : [neighbor.position, current.position];

  await Promise.all([
    supabase.from("project_phases").update({ position: a }).eq("id", current.id),
    supabase.from("project_phases").update({ position: b }).eq("id", neighbor.id),
  ]);
  revalidateProjectViews(projectId);
}

// ---- To-do yang tertaut ke proyek ---------------------------------------------

// Tambah cepat to-do untuk proyek ini (tanggal kosong = hari ini, WIB). Tetap to-do harian biasa.
export async function createTodoForProject(projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("due_date") ?? "").trim();
  const phaseRaw = String(formData.get("phase_id") ?? "").trim();
  if (!title || !UUID_RE.test(projectId)) return;

  const supabase = await createClient();
  // Fase hanya dipakai kalau memang milik proyek ini.
  let phaseId: string | null = null;
  if (UUID_RE.test(phaseRaw)) {
    const { data } = await supabase
      .from("project_phases")
      .select("id")
      .eq("id", phaseRaw)
      .eq("project_id", projectId)
      .maybeSingle();
    phaseId = data?.id ?? null;
  }
  await supabase.from("todos").insert({
    title,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: isISODate(date) ? date : todayISO(),
    project_id: projectId,
    phase_id: phaseId,
  });
  revalidateProjectViews(projectId);
}
