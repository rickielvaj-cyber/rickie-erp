"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { CalendarApiError, listCalendarEvents } from "@/lib/google/calendar";
import { calendarLabel, MAX_EXTRA_CALENDARS, parseCalendarId } from "@/lib/google/calendar-sources";
import { GoogleAuthError, googleConfigured } from "@/lib/google/oauth";
import { getAccessToken, isConnected } from "@/lib/google/store";
import { addDaysISO, todayISO } from "@/lib/date";

export type CalendarSourceState = { ok: boolean; message: string } | null;

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/todos");
  revalidatePath("/todos/month");
}

/**
 * Tambah kalender Google tambahan (hanya baca) dari ID yang ditempel. Sebelum disimpan, ID diuji dengan membaca satu hari acara
 * kalender itu lewat akun Google yang tersambung (izin `calendar.events` cukup): ID salah, kalender yang tidak dibagikan ke akun ini,
 * atau Google yang sedang bermasalah ditolak dengan pesan yang jelas, bukan disimpan lalu diam-diam kosong.
 */
export async function addCalendarSource(_prev: CalendarSourceState, formData: FormData): Promise<CalendarSourceState> {
  const user = await getAuthUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const parsed = parseCalendarId(formData.get("calendar_id"));
  if (!parsed.ok) return { ok: false, message: parsed.error };
  if (!googleConfigured()) return { ok: false, message: "Google Calendar is not set up on the server yet." };

  const db = await createClient();
  const { data: existing } = await db.from("calendar_sources").select("calendar_id");
  if ((existing ?? []).length >= MAX_EXTRA_CALENDARS) return { ok: false, message: `You can add at most ${MAX_EXTRA_CALENDARS} other calendars. Remove one first.` };
  if ((existing ?? []).some((c) => c.calendar_id === parsed.id)) return { ok: false, message: "That calendar is already added." };

  let title: string | null = null;
  try {
    if (!(await isConnected(user.id))) return { ok: false, message: "Connect Google Calendar first (To-Do → Calendar → Connect Google Calendar)." };
    const token = await getAccessToken(user.id);
    if (!token) return { ok: false, message: "Google access has expired. Reconnect it in To-Do → Calendar, then try again." };
    const today = todayISO();
    title = (await listCalendarEvents(token, parsed.id, today, addDaysISO(today, 1))).title;
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reconnect) return { ok: false, message: "Google access has expired. Reconnect it in To-Do → Calendar, then try again." };
    if (error instanceof CalendarApiError && error.status === 404) return { ok: false, message: "Google could not find that calendar. Check the ID." };
    if (error instanceof CalendarApiError && (error.status === 403 || error.status === 401)) {
      return { ok: false, message: "Your Google account has no access to that calendar. Ask its owner to share it with you, then try again." };
    }
    return { ok: false, message: "Could not check that calendar with Google right now. Try again in a moment." };
  }

  const label = calendarLabel(formData.get("label"), title, parsed.id);
  const { error } = await db.from("calendar_sources").insert({ user_id: user.id, calendar_id: parsed.id, label });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: `Added “${label}”. Its events now show on the week and month views, read-only.` };
}

export async function removeCalendarSource(id: string): Promise<void> {
  const user = await getAuthUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const db = await createClient();
  await db.from("calendar_sources").delete().eq("id", id);
  refresh();
}
