import { addDaysISO } from "@/lib/date";
import { wibIso, type BlockInput } from "./block";
import type { CalendarEvent } from "./layout";

const API = () => process.env.GOOGLE_CALENDAR_API ?? "https://www.googleapis.com/calendar/v3";

export class CalendarApiError extends Error {}

type RawEvent = {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

/** Bentuk acara Google -> bentuk minimal yang dipakai situs. Acara batal atau tanpa waktu dibuang. */
export function normalizeEvent(raw: RawEvent): CalendarEvent | null {
  if (!raw.id || raw.status === "cancelled") return null;
  const title = raw.summary?.trim() || "(No title)";
  if (raw.start?.dateTime && raw.end?.dateTime) {
    return { id: raw.id, title, allDay: false, start: raw.start.dateTime, end: raw.end.dateTime, link: raw.htmlLink };
  }
  if (raw.start?.date && raw.end?.date) {
    return { id: raw.id, title, allDay: true, start: raw.start.date, end: raw.end.date, link: raw.htmlLink };
  }
  return null;
}

/** Acara kalender utama untuk minggu (Senin..Minggu WIB) yang dimulai di `weekStart`. Tidak disimpan di mana pun. */
export async function listWeekEvents(accessToken: string, weekStart: string): Promise<CalendarEvent[]> {
  const url = new URL(`${API()}/calendars/primary/events`);
  url.search = new URLSearchParams({
    timeMin: `${weekStart}T00:00:00+07:00`,
    timeMax: `${addDaysISO(weekStart, 7)}T00:00:00+07:00`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: "Asia/Jakarta",
    fields: "items(id,status,summary,htmlLink,start,end)",
  }).toString();

  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new CalendarApiError(`Google Calendar request failed (${response.status}${body.error?.message ? `: ${body.error.message}` : ""}).`);
  }
  const json = (await response.json()) as { items?: RawEvent[] };
  return (json.items ?? []).map(normalizeEvent).filter((e): e is CalendarEvent => e !== null);
}

// ---- Menulis acara (time blocking) ----------------------------------------------------------------
// sendUpdates=none: mengubah atau menghapus acara dari sini tidak mengirim email ke peserta acara itu.

function eventBody(input: BlockInput) {
  return {
    summary: input.title,
    start: { dateTime: wibIso(input.date, input.startMin), timeZone: "Asia/Jakarta" },
    end: { dateTime: wibIso(input.date, input.endMin), timeZone: "Asia/Jakarta" },
  };
}

async function write(accessToken: string, method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<RawEvent | null> {
  const response = await fetch(`${API()}/calendars/primary/events${path}?sendUpdates=none`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    const hint =
      response.status === 403
        ? "You do not have permission to change this event (for example, it belongs to someone else's calendar)."
        : response.status === 404 || response.status === 410
          ? "This event no longer exists in Google Calendar. Refresh the page."
          : (json.error?.message ?? "Google rejected the request.");
    throw new CalendarApiError(`${hint} (${response.status})`);
  }
  return method === "DELETE" ? null : ((await response.json()) as RawEvent);
}

export async function createEvent(accessToken: string, input: BlockInput): Promise<CalendarEvent | null> {
  return normalizeEvent((await write(accessToken, "POST", "", eventBody(input))) ?? {});
}

export async function updateEvent(accessToken: string, eventId: string, input: BlockInput): Promise<CalendarEvent | null> {
  return normalizeEvent((await write(accessToken, "PATCH", `/${encodeURIComponent(eventId)}`, eventBody(input))) ?? {});
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  await write(accessToken, "DELETE", `/${encodeURIComponent(eventId)}`);
}

/**
 * Satu acara menurut id. null = sudah tidak ada (dihapus/dibatalkan di Google); lemparan galat untuk kegagalan lain
 * (jaringan, izin) supaya pemanggil tidak keliru menganggap acaranya hilang.
 */
export async function getEvent(accessToken: string, eventId: string): Promise<CalendarEvent | null> {
  const response = await fetch(`${API()}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new CalendarApiError(`Google Calendar request failed (${response.status}).`);
  return normalizeEvent((await response.json()) as RawEvent);
}
