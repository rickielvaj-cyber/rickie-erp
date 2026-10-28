"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { isISODate, mondayOfISO } from "@/lib/date";
import { parseSaveInput } from "@/lib/summary-history";

export type SaveSummaryResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** Simpan (timpa) teks Weekly Summary satu minggu. Satu baris per minggu; menyimpan lagi memperbarui baris yang sama. */
export async function saveWeeklySummary(raw: unknown): Promise<SaveSummaryResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const parsed = parseSaveInput(raw);
  if (!parsed.ok) return parsed;
  const { weekStart, summary, plan } = parsed.value;

  const db = await createClient();
  const { data, error } = await db
    .from("weekly_summaries")
    .upsert(
      { user_id: user.id, week_start: weekStart, summary_text: summary, plan_text: plan },
      { onConflict: "user_id,week_start" },
    )
    .select("updated_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save the summary." };

  revalidatePath("/summary/history");
  return { ok: true, savedAt: data.updated_at };
}

/** Hapus teks tersimpan satu minggu (data asli tidak disentuh; halaman kembali membuat dari template). */
export async function deleteWeeklySummary(weekStart: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  if (!isISODate(weekStart) || mondayOfISO(weekStart) !== weekStart) return { ok: false, error: "Unknown week." };

  const db = await createClient();
  const { error } = await db.from("weekly_summaries").delete().eq("week_start", weekStart);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/summary/history");
  return { ok: true };
}
