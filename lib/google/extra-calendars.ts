import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { CalendarApiError, listCalendarEvents } from "./calendar";
import { calendarLabel, describeCalendarFailure, MAX_EXTRA_CALENDARS, type ExtraEvents } from "./calendar-sources";

/**
 * Acara dari kalender TAMBAHAN pengguna (tabel calendar_sources, hanya baca) untuk rentang tanggal. Tiap kalender diambil terpisah:
 * yang gagal (ID salah, tidak dibagikan, Google error) jadi satu catatan singkat dan tidak mengganggu yang lain atau kalender utama.
 * `db` = klien pengguna (RLS memastikan hanya baris miliknya).
 */
export async function loadExtraEvents(
  db: SupabaseClient<Database>,
  token: string,
  start: string,
  endExclusive: string,
): Promise<{ extras: ExtraEvents[]; notes: string[] }> {
  const { data } = await db.from("calendar_sources").select("calendar_id, label").order("created_at", { ascending: true }).limit(MAX_EXTRA_CALENDARS);
  const rows = data ?? [];

  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        const r = await listCalendarEvents(token, row.calendar_id, start, endExclusive);
        return { extra: { label: calendarLabel(row.label, r.title, row.calendar_id), events: r.events } as ExtraEvents, note: null as string | null };
      } catch (error) {
        const label = calendarLabel(row.label, null, row.calendar_id);
        return { extra: null, note: describeCalendarFailure(label, error instanceof CalendarApiError ? error.status : undefined) };
      }
    }),
  );
  return {
    extras: results.flatMap((r) => (r.extra ? [r.extra] : [])),
    notes: results.flatMap((r) => (r.note ? [r.note] : [])),
  };
}
