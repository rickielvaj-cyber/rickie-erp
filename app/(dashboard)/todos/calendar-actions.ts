"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { disconnect, getAccessToken } from "@/lib/google/store";
import { createEvent, deleteEvent, updateEvent } from "@/lib/google/calendar";
import { isEventId, parseBlockInput } from "@/lib/google/block";
import { GoogleAuthError } from "@/lib/google/oauth";

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
    return { ok: true };
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reconnect) return { ok: false, error: "Google access has expired. Reload the page and reconnect." };
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function createCalendarBlock(raw: unknown): Promise<BlockResult> {
  const parsed = parseBlockInput(raw);
  if (!parsed.ok) return parsed;
  return withToken(async (token) => {
    await createEvent(token, parsed.value);
  });
}

export async function updateCalendarBlock(eventId: unknown, raw: unknown): Promise<BlockResult> {
  if (!isEventId(eventId)) return { ok: false, error: "Unknown event." };
  const parsed = parseBlockInput(raw);
  if (!parsed.ok) return parsed;
  return withToken(async (token) => {
    await updateEvent(token, eventId, parsed.value);
  });
}

export async function deleteCalendarBlock(eventId: unknown): Promise<BlockResult> {
  if (!isEventId(eventId)) return { ok: false, error: "Unknown event." };
  return withToken((token) => deleteEvent(token, eventId));
}
