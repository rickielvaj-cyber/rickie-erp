import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { addDaysISO, formatLongDay, isYearMonth, mondayOfISO, todayISO } from "@/lib/date";
import { monthTitle } from "@/lib/summary";
import { buildDayItems, countDistinct, describeDay, gridRange, limitItems, monthWeeks, shiftMonth, type DayItem } from "@/lib/month-grid";
import { listEventsInRange } from "@/lib/google/calendar";
import { loadExtraEvents } from "@/lib/google/extra-calendars";
import { mergeExtraEvents } from "@/lib/google/calendar-sources";
import { GoogleAuthError, googleConfigured } from "@/lib/google/oauth";
import { getAccessToken, isConnected } from "@/lib/google/store";
import type { CalendarEvent } from "@/lib/google/layout";

export const metadata = { title: "Month" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE = 3;

type EventsResult = { events: CalendarEvent[] | null; note: string | null; notes?: string[] };

/** Acara Google untuk rentang grid. Gagal apa pun = tanpa acara plus catatan; to-do tetap tampil. Hanya membaca, tidak menyinkronkan to-do. */
async function loadEvents(db: Awaited<ReturnType<typeof createClient>>, userId: string, start: string, endExclusive: string): Promise<EventsResult> {
  if (!googleConfigured()) return { events: null, note: "Google Calendar is not set up on the server, so only to-dos are shown." };
  try {
    if (!(await isConnected(userId))) return { events: null, note: "Google Calendar is not connected, so only to-dos are shown." };
    const token = await getAccessToken(userId);
    if (!token) return { events: null, note: "Google access has expired. Reconnect it in the Calendar section; only to-dos are shown for now." };
    const primary = await listEventsInRange(token, start, endExclusive);
    // Kalender tambahan (hanya baca); gagal satu kalender = catatan, bukan error halaman.
    const { extras, notes } = await loadExtraEvents(db, token, start, endExclusive).catch(() => ({ extras: [], notes: [] as string[] }));
    return { events: mergeExtraEvents(primary, extras), note: null, notes };
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reconnect) return { events: null, note: "Google access has expired. Reconnect it in the Calendar section; only to-dos are shown for now." };
    return { events: null, note: "Google Calendar could not be read right now, so only to-dos are shown." };
  }
}

function Item({ item }: { item: DayItem }) {
  const base = "block truncate rounded px-1.5 py-0.5 text-xs leading-snug";
  const done = item.done ? " line-through opacity-60" : "";
  if (item.kind === "todo") {
    return <span className={`${base} border border-border-strong bg-background${done}`}>{item.title}</span>;
  }
  if (item.source) {
    return (
      <span className={`${base} border border-dashed border-border-strong bg-surface text-muted${done}`} title={`${item.title} · ${item.source}`}>
        {item.time ? <span className="mr-1 tabular-nums text-muted">{item.time}</span> : null}
        {item.title}
      </span>
    );
  }
  return (
    <span className={`${base} ${item.allDay ? "bg-accent text-white" : "bg-accent-soft text-accent-ink"}${done}`}>
      {item.time ? <span className="mr-1 tabular-nums text-muted">{item.time}</span> : null}
      {item.title}
    </span>
  );
}

export default async function MonthPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const month = isYearMonth(params.month) ? params.month : thisMonth;

  const weeks = monthWeeks(month);
  const range = gridRange(weeks);
  const authUser = await getAuthUser();
  const supabase = await createClient();

  const [todosResult, eventsResult] = await Promise.all([
    supabase
      .from("todos")
      .select("id, title, status, due_date, calendar_event_id")
      .gte("due_date", range.start)
      .lte("due_date", range.end)
      .order("due_date", { ascending: true })
      .limit(1000),
    authUser ? loadEvents(supabase, authUser.id, range.start, addDaysISO(range.end, 1)) : Promise.resolve<EventsResult>({ events: null, note: null }),
  ]);

  const todos = todosResult.data ?? [];
  const items = buildDayItems(eventsResult.events, todos, range);
  const { events: eventCount, todos: todoCount } = countDistinct(items, (date) => date.startsWith(month));

  const pill = "rounded-full border border-border-strong px-4 py-1.5 text-sm hover:bg-surface";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{monthTitle(month)}</h1>
          <p className="mt-1 text-base text-muted">
            {eventsResult.events ? `${eventCount} ${eventCount === 1 ? "event" : "events"} · ` : ""}
            {todoCount} {todoCount === 1 ? "to-do" : "to-dos"} due · tap a day to open its week
          </p>
        </div>
        <nav aria-label="Select month" className="flex flex-wrap gap-2">
          <Link href={`/todos/month?month=${shiftMonth(month, -1)}`} className={pill}>
            ‹ Previous
          </Link>
          <Link href="/todos/month" className={`${pill} ${month === thisMonth ? "bg-surface font-medium" : ""}`}>
            This month
          </Link>
          <Link href={`/todos/month?month=${shiftMonth(month, 1)}`} className={pill}>
            Next ›
          </Link>
          <Link href="/todos#calendar" className={pill}>
            Week view
          </Link>
        </nav>
      </div>

      {eventsResult.note && <p className="mt-5 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">{eventsResult.note}</p>}
      {(eventsResult.notes ?? []).map((n) => (
        <p key={n} role="status" className="mt-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
          {n}
        </p>
      ))}
      {todosResult.error && <p className="mt-5 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">Failed to load to-dos: {todosResult.error.message}</p>}

      <table className="mt-6 w-full table-fixed border-collapse">
        <caption className="sr-only">{monthTitle(month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="border border-border bg-surface px-1 py-2 text-xs font-medium text-muted sm:text-sm">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((cell, col) => {
                const list = items.get(cell.date) ?? [];
                const { shown, more } = limitItems(list, MAX_VISIBLE);
                const isToday = cell.date === today;
                return (
                  <td key={cell.date} className={`h-20 border border-border p-0 align-top sm:h-28 ${col >= 5 ? "bg-surface" : "bg-background"}`}>
                    <Link
                      href={`/todos?week=${mondayOfISO(cell.date)}#calendar`}
                      aria-label={`${formatLongDay(cell.date)}: ${describeDay(list)}`}
                      aria-current={isToday ? "date" : undefined}
                      className={`block h-full min-h-full p-1 transition-colors hover:bg-surface sm:p-1.5 ${cell.inMonth ? "" : "opacity-45"}`}
                    >
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums sm:text-sm ${
                          isToday ? "bg-accent font-semibold text-white" : "text-foreground"
                        }`}
                      >
                        {Number(cell.date.slice(8))}
                      </span>
                      {/* Layar sempit: hanya jumlah; teks acara tidak muat. */}
                      {list.length > 0 && <span className="mt-1 block text-xs text-muted sm:hidden">{list.length} •</span>}
                      <span className="mt-1 hidden space-y-0.5 sm:block">
                        {shown.map((item) => (
                          <Item key={item.key} item={item} />
                        ))}
                        {more > 0 && <span className="block px-1.5 text-xs text-muted">+{more} more</span>}
                      </span>
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
        <span>
          <span className="mr-1.5 inline-block h-3 w-5 rounded bg-accent align-middle" /> all-day event
        </span>
        <span>
          <span className="mr-1.5 inline-block h-3 w-5 rounded bg-accent-soft align-middle ring-1 ring-accent/30" /> timed event
        </span>
        <span>
          <span className="mr-1.5 inline-block h-3 w-5 rounded border border-border-strong align-middle" /> to-do due
        </span>
        <span>
          <span className="mr-1.5 inline-block h-3 w-5 rounded border border-dashed border-border-strong bg-surface align-middle" /> other calendar (read-only)
        </span>
        <span>A to-do linked to a calendar block shows once, as the block.</span>
      </p>
    </div>
  );
}
