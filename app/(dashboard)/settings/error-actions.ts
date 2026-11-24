"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEntry, parseClientReport } from "@/lib/error-log";
import { currentRelease, writeEntry } from "@/lib/error-report";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Laporan galat dari browser (components/ErrorReporter.tsx). Hanya untuk pengguna yang login (supaya orang luar tidak bisa memenuhi tabel); masukan divalidasi. */
export async function logClientError(raw: unknown): Promise<void> {
  const user = await getAuthUser();
  if (!user) return;
  const report = parseClientReport(raw);
  if (!report) return;
  const entry = buildEntry({ source: "client", route: report.path, name: report.name, message: report.message, stack: report.stack, release: currentRelease() });
  if (entry) await writeEntry(entry);
}

export async function deleteErrorLogRow(id: string): Promise<void> {
  const user = await getAuthUser();
  if (!user || !UUID_RE.test(id)) return;
  await createAdminClient().from("error_log").delete().eq("id", id);
  revalidatePath("/settings/errors");
  revalidatePath("/settings");
}

export async function clearErrorLog(): Promise<void> {
  const user = await getAuthUser();
  if (!user) return;
  await createAdminClient().from("error_log").delete().gte("occurrences", 1);
  revalidatePath("/settings/errors");
  revalidatePath("/settings");
}
