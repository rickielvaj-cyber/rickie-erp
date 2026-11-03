"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { addDaysISO, todayISO } from "@/lib/date";
import { POINTS_PER_SESSION, parseFocusInput } from "@/lib/focus";

export type RecordResult = { ok: true; points: number; duplicate: boolean; sessionsToday: number } | { ok: false; error: string };

/**
 * Catat satu sesi fokus yang selesai. Browser hanya mengirim waktu mulai, lama, dan label; server memeriksa bahwa sesinya benar-benar
 * sudah lewat (lihat parseFocusInput) dan MENENTUKAN poinnya sendiri. Dicatat dua kali (mis. dua tab) = satu baris (unik per started_at).
 */
export async function recordFocusSession(raw: unknown): Promise<RecordResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const parsed = parseFocusInput(raw, Date.now());
  if (!parsed.ok) return parsed;

  const db = await createClient();
  const { error } = await db.from("focus_sessions").insert({
    user_id: user.id,
    started_at: parsed.value.startedAt,
    minutes: parsed.value.minutes,
    label: parsed.value.label,
    points: POINTS_PER_SESSION,
  });
  if (error && error.code !== "23505") return { ok: false, error: "Could not save the session. Your points were not added." };
  revalidatePath("/focus");
  // Jumlah sesi hari ini (WIB) termasuk yang baru dicatat, supaya panel langsung tahu apakah istirahat berikutnya panjang.
  const today = todayISO();
  const { count } = await db
    .from("focus_sessions")
    .select("id", { count: "exact", head: true })
    .gte("started_at", `${today}T00:00:00+07:00`)
    .lt("started_at", `${addDaysISO(today, 1)}T00:00:00+07:00`);
  return { ok: true, points: POINTS_PER_SESSION, duplicate: Boolean(error), sessionsToday: count ?? 0 };
}

/** Hapus satu sesi (salah catat); poinnya ikut hilang. */
export async function removeFocusSession(id: string): Promise<void> {
  const user = await getAuthUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = await createClient();
  await db.from("focus_sessions").delete().eq("id", id);
  revalidatePath("/focus");
}
