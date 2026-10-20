import { toWib, type CalendarEvent } from "./layout";

// To-do yang tertaut ke acara Google mengikuti acaranya (acara = sumber kebenaran untuk tanggal dan jam):
// digeser di Google -> tanggal dan jam to-do ikut; dihapus di Google -> tautannya dilepas (to-do tetap ada).
// Fungsi di sini murni; pengambilan data dan penulisan ada di pemanggil.

export type LinkedTodo = {
  id: string;
  due_date: string | null;
  calendar_event_id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
};

export type ReconcileChange =
  | { id: string; kind: "unlink" }
  | { id: string; kind: "sync"; due_date: string; scheduled_start: string | null; scheduled_end: string | null };

const sameInstant = (a: string | null, b: string | null) => (a === null || b === null ? a === b : new Date(a).getTime() === new Date(b).getTime());

/**
 * `events`: id acara -> acara, atau null bila sudah tidak ada. Id yang tidak ada di peta (gagal diambil dari Google)
 * dibiarkan apa adanya, supaya gangguan jaringan tidak melepas tautan yang masih sah.
 */
export function planReconcile(linked: LinkedTodo[], events: Map<string, CalendarEvent | null>): ReconcileChange[] {
  const changes: ReconcileChange[] = [];
  for (const todo of linked) {
    if (!events.has(todo.calendar_event_id)) continue;
    const event = events.get(todo.calendar_event_id);
    if (!event) {
      changes.push({ id: todo.id, kind: "unlink" });
      continue;
    }
    const date = event.allDay ? event.start : toWib(event.start).date;
    const start = event.allDay ? null : new Date(event.start).toISOString();
    const end = event.allDay ? null : new Date(event.end).toISOString();
    if (todo.due_date !== date || !sameInstant(todo.scheduled_start, start) || !sameInstant(todo.scheduled_end, end)) {
      changes.push({ id: todo.id, kind: "sync", due_date: date, scheduled_start: start, scheduled_end: end });
    }
  }
  return changes;
}
