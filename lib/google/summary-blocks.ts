import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { addDaysISO } from "@/lib/date";
import { listWeekEvents } from "@/lib/google/calendar";
import { formatScheduled, toWib } from "@/lib/google/layout";
import { GoogleAuthError, googleConfigured } from "@/lib/google/oauth";
import { syncLinkedTodos } from "@/lib/google/sync-todos";
import { getAccessToken, isConnected } from "@/lib/google/store";
import type { OtherEvent } from "@/lib/summary";

const WIB = "+07:00";

export type LinkedBlock = {
  todoId: string;
  title: string;
  goal_id: string | null;
  project_id: string | null;
  phase_id: string | null;
  minutes: number;
};

export type SummaryCalendar = {
  blocks: LinkedBlock[];
  otherEvents: OtherEvent[];
  /** Pesan singkat bila Google tidak bisa dibaca dan angka diambil dari data tersimpan. */
  note: string | null;
};

const minutesBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 60_000);

/**
 * Blok waktu Senin–Jumat (WIB) untuk Weekly Summary. Acuan utama: to-do yang tertaut ke acara kalender
 * (todos.calendar_event_id); jam diambil dari Google bila tersambung (to-do disinkronkan dulu, sama seperti halaman To-Do),
 * kalau tidak, dari jam yang tersimpan terakhir. Acara yang TIDAK tertaut ke to-do (rapat, pribadi) hanya ikut bila
 * `includeOthers` aktif, karena bisa berisi hal yang tidak ingin masuk laporan.
 */
export async function loadSummaryCalendar(
  db: SupabaseClient<Database>,
  userId: string,
  weekStart: string,
  weekEnd: string,
  includeOthers: boolean,
): Promise<SummaryCalendar> {
  let note: string | null = null;
  let events: Awaited<ReturnType<typeof listWeekEvents>> | null = null;

  if (googleConfigured()) {
    try {
      if (await isConnected(userId)) {
        const token = await getAccessToken(userId);
        if (token) {
          events = await listWeekEvents(token, weekStart);
          await syncLinkedTodos(db, token, events).catch(() => 0);
        } else {
          note = "Google Calendar needs to be reconnected; showing the last saved block times.";
        }
      }
    } catch (error) {
      note =
        error instanceof GoogleAuthError && error.reconnect
          ? "Google Calendar needs to be reconnected; showing the last saved block times."
          : "Google Calendar could not be read; showing the last saved block times.";
      events = null;
    }
  }

  const { data } = await db
    .from("todos")
    .select("id, title, goal_id, project_id, phase_id, calendar_event_id, scheduled_start, scheduled_end")
    .not("calendar_event_id", "is", null)
    .gte("scheduled_start", `${weekStart}T00:00:00${WIB}`)
    .lt("scheduled_start", `${addDaysISO(weekEnd, 1)}T00:00:00${WIB}`)
    .order("scheduled_start", { ascending: true });

  const rows = data ?? [];
  const blocks: LinkedBlock[] = [];
  for (const t of rows) {
    if (!t.scheduled_start || !t.scheduled_end) continue;
    const minutes = minutesBetween(t.scheduled_start, t.scheduled_end);
    if (minutes > 0) blocks.push({ todoId: t.id, title: t.title, goal_id: t.goal_id, project_id: t.project_id, phase_id: t.phase_id, minutes });
  }

  const otherEvents: OtherEvent[] = [];
  if (includeOthers && events) {
    const linked = new Set(rows.map((t) => t.calendar_event_id));
    for (const e of events) {
      if (e.allDay || linked.has(e.id)) continue;
      const date = toWib(e.start).date;
      const minutes = minutesBetween(e.start, e.end);
      const time = formatScheduled(e.start, e.end);
      if (date < weekStart || date > weekEnd || minutes <= 0 || !time) continue;
      otherEvents.push({ date, time, title: e.title, minutes });
    }
  }

  return { blocks, otherEvents, note };
}
