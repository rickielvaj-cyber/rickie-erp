"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { disconnect, getAccessToken } from "@/lib/google/store";
import { createEvent, deleteEvent, updateEvent } from "@/lib/google/calendar";
import { isEventId, parseBlockInput, wibIso } from "@/lib/google/block";
import { GoogleAuthError } from "@/lib/google/oauth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Putuskan Google Calendar: cabut akses di Google (best effort) lalu hapus token tersimpan.
export async function disconnectGoogleCalendar() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  await disconnect(user.id);
  revalidatePath("/todos");
  redirect("/todos?calendar=disconnected#calendar");
}

export type BlockResult = { ok: true } | { ok: false; error: string };

/**
 * Semua penulisan acara lewat sini: pengguna harus login, masukan divalidasi di server (browser tidak dipercaya),
 * dan access token Google diambil dari penyimpanan server; tidak pernah ada di browser.
 */
async function withToken(run: (token: string) => Promise<void>): Promise<BlockResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  try {
    const token = await getAccessToken(user.id);
    if (!token) return { ok: false, error: "Google Calendar is not connected." };
    await run(token);
    revalidatePath("/todos");
    revalidatePath("/summary");
    return { ok: true };
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reconnect) return { ok: false, error: "Google access has expired. Reload the page and reconnect." };
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

const schedule = (v: { date: string; startMin: number; endMin: number }) => ({
  due_date: v.date,
  scheduled_start: new Date(wibIso(v.date, v.startMin)).toISOString(),
  scheduled_end: new Date(wibIso(v.date, v.endMin)).toISOString(),
});

export async function createCalendarBlock(raw: unknown): Promise<BlockResult> {
  const parsed = parseBlockInput(raw);
  if (!parsed.ok) return parsed;
  const todoRaw = (raw as { todoId?: unknown } | null)?.todoId;
  const todoId = typeof todoRaw === "string" && todoRaw !== "" ? todoRaw : null;
  if (todoId !== null && !UUID_RE.test(todoId)) return { ok: false, error: "Unknown to-do." };

  return withToken(async (token) => {
    const db = await createClient();
    if (todoId) {
      const { data: todo, error } = await db.from("todos").select("id, calendar_event_id").eq("id", todoId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!todo) throw new Error("That to-do no longer exists.");
      if (todo.calendar_event_id) throw new Error("This to-do already has a calendar block.");
    }
    const event = await createEvent(token, parsed.value);
    if (!todoId) return;
    const { error } = await db
      .from("todos")
      .update({ calendar_event_id: event?.id ?? null, ...schedule(parsed.value) })
      .eq("id", todoId);
    if (error || !event) {
      // Tautan gagal disimpan: jangan tinggalkan acara yatim di kalender.
      if (event) await deleteEvent(token, event.id).catch(() => undefined);
      throw new Error(error?.message ?? "Could not link the block to the to-do.");
    }
  });
}

export async function updateCalendarBlock(eventId: unknown, raw: unknown): Promise<BlockResult> {
  if (!isEventId(eventId)) return { ok: false, error: "Unknown event." };
  const parsed = parseBlockInput(raw);
  if (!parsed.ok) return parsed;
  return withToken(async (token) => {
    await updateEvent(token, eventId, parsed.value);
    // To-do yang tertaut ikut (tanggal dan jam). Gagal di sini tidak membatalkan perubahan di Google; disamakan lagi saat Calendar dibuka.
    const db = await createClient();
    await db.from("todos").update(schedule(parsed.value)).eq("calendar_event_id", eventId);
  });
}

export async function deleteCalendarBlock(eventId: unknown): Promise<BlockResult> {
  if (!isEventId(eventId)) return { ok: false, error: "Unknown event." };
  return withToken(async (token) => {
    await deleteEvent(token, eventId);
    const db = await createClient();
    await db.from("todos").update({ calendar_event_id: null, scheduled_start: null, scheduled_end: null }).eq("calendar_event_id", eventId);
  });
}
