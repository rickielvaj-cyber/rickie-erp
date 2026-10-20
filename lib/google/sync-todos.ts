import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { getEvent } from "./calendar";
import type { CalendarEvent } from "./layout";
import { planReconcile, type LinkedTodo } from "./reconcile";

const MAX_LOOKUPS = 25;

/**
 * Samakan to-do yang tertaut ke acara Google dengan acaranya (tanggal dan jam mengikuti acara; acara yang dihapus
 * melepas tautan). `weekEvents` sudah diambil untuk grid, jadi hanya acara di luar minggu itu yang dicari satu per satu.
 * Mengembalikan jumlah to-do yang berubah. Gangguan jaringan pada satu acara tidak melepas tautannya.
 */
export async function syncLinkedTodos(db: SupabaseClient<Database>, token: string, weekEvents: CalendarEvent[]): Promise<number> {
  const { data, error } = await db
    .from("todos")
    .select("id, due_date, calendar_event_id, scheduled_start, scheduled_end")
    .not("calendar_event_id", "is", null)
    .neq("status", "done");
  if (error || !data) return 0;
  const linked = data.filter((t): t is LinkedTodo => t.calendar_event_id !== null);
  if (linked.length === 0) return 0;

  const known = new Map<string, CalendarEvent | null>(weekEvents.map((e) => [e.id, e]));
  const missing = Array.from(new Set(linked.map((t) => t.calendar_event_id))).filter((id) => !known.has(id)).slice(0, MAX_LOOKUPS);
  await Promise.all(
    missing.map(async (id) => {
      try {
        known.set(id, await getEvent(token, id));
      } catch {
        // tidak diketahui: tautan dibiarkan
      }
    }),
  );

  const changes = planReconcile(linked, known);
  for (const c of changes) {
    const patch =
      c.kind === "unlink"
        ? { calendar_event_id: null, scheduled_start: null, scheduled_end: null }
        : { due_date: c.due_date, scheduled_start: c.scheduled_start, scheduled_end: c.scheduled_end };
    await db.from("todos").update(patch).eq("id", c.id);
  }
  return changes.length;
}
