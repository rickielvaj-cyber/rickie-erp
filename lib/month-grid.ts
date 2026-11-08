import { addDaysISO, mondayOfISO } from "@/lib/date";
import { toWib, type CalendarEvent } from "@/lib/google/layout";

// Tampilan bulan (/todos/month): grid minggu penuh (Senin–Minggu) dan isi tiap harinya dari acara Google dan to-do jatuh tempo.
// Murni (tanpa jaringan) supaya mudah diuji. Semua tanggal WIB.

export type MonthCell = { date: string; inMonth: boolean };

/** "2026-10" digeser `delta` bulan -> "2026-11". */
export function shiftMonth(yyyyMm: string, delta: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Minggu-minggu yang menutupi satu bulan, Senin dulu. Hari di luar bulan ikut (inMonth=false) supaya baris minggu penuh. */
export function monthWeeks(yyyyMm: string): MonthCell[][] {
  const first = `${yyyyMm}-01`;
  const lastDay = new Date(Date.UTC(Number(yyyyMm.slice(0, 4)), Number(yyyyMm.slice(5, 7)), 0)).getUTCDate();
  const last = `${yyyyMm}-${String(lastDay).padStart(2, "0")}`;
  const weeks: MonthCell[][] = [];
  for (let monday = mondayOfISO(first); monday <= last; monday = addDaysISO(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDaysISO(monday, i);
      return { date, inMonth: date.startsWith(yyyyMm) };
    }));
  }
  return weeks;
}

/** Rentang yang dicakup grid: tanggal pertama dan terakhir (inklusif). */
export function gridRange(weeks: MonthCell[][]): { start: string; end: string } {
  return { start: weeks[0][0].date, end: weeks[weeks.length - 1][6].date };
}

export type MonthTodo = { id: string; title: string; status: string; due_date: string | null; calendar_event_id: string | null };

export type DayItem = {
  key: string;
  /** Id acara atau to-do asalnya; sama untuk setiap hari yang dilalui acara lintas hari (untuk menghitung yang unik). */
  ref: string;
  kind: "event" | "todo";
  /** Label kalender tambahan (hanya baca) asal acara ini; null = kalender utama atau to-do. */
  source: string | null;
  title: string;
  /** "09:00" untuk acara berjam pada hari mulainya; null untuk acara seharian, hari lanjutan, dan to-do. */
  time: string | null;
  allDay: boolean;
  done: boolean;
  /** colorId Google ("1".."11") untuk acara kalender utama yang diberi warna; kosong = warna bawaan. */
  colorId?: string;
};

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Isi tiap hari: acara (seharian dulu, lalu berjam menurut jam mulai) lalu to-do (yang belum selesai dulu).
 * Acara seharian dan lintas hari muncul di setiap harinya. To-do yang tertaut ke acara yang ada di `events` tidak ditulis dua kali:
 * acaranya yang tampil, dicoret bila to-do-nya selesai. `events` null = Google tidak terbaca, jadi semua to-do tampil sendiri.
 */
export function buildDayItems(events: CalendarEvent[] | null, todos: MonthTodo[], range: { start: string; end: string }): Map<string, DayItem[]> {
  const days = new Map<string, (DayItem & { order: number })[]>();
  const push = (date: string, item: DayItem, order: number) => {
    if (date < range.start || date > range.end) return;
    days.set(date, [...(days.get(date) ?? []), { ...item, order }]);
  };

  // To-do hanya bisa tertaut ke acara kalender UTAMA; acara kalender tambahan tidak ikut aturan tautan.
  const todoByEvent = new Map<string, MonthTodo>();
  for (const t of todos) if (t.calendar_event_id) todoByEvent.set(t.calendar_event_id, t);
  const eventIds = new Set((events ?? []).filter((e) => !e.source).map((e) => e.id));

  for (const e of events ?? []) {
    const done = !e.source && todoByEvent.get(e.id)?.status === "done";
    const ref = `${e.source ?? ""}|${e.id}`;
    const src = e.source ?? null;
    const colorId = e.source ? undefined : e.colorId; // kalender tambahan tetap abu-abu putus-putus
    if (e.allDay) {
      for (let date = e.start; date < e.end; date = addDaysISO(date, 1)) {
        push(date, { key: `e-${ref}-${date}`, ref, kind: "event", source: src, title: e.title, time: null, allDay: true, done, ...(colorId ? { colorId } : {}) }, -1);
      }
      continue;
    }
    const s = toWib(e.start);
    const f = toWib(e.end);
    for (let date = s.date; date <= f.date; date = addDaysISO(date, 1)) {
      if (date === f.date && f.minutes === 0 && date !== s.date) continue; // berakhir tepat 00:00: bukan hari ini
      const first = date === s.date;
      push(date, { key: `e-${ref}-${date}`, ref, kind: "event", source: src, title: e.title, time: first ? hhmm(s.minutes) : null, allDay: false, done, ...(colorId ? { colorId } : {}) }, first ? s.minutes : 0);
    }
  }

  for (const t of todos) {
    if (!t.due_date) continue;
    if (t.calendar_event_id && eventIds.has(t.calendar_event_id)) continue;
    const done = t.status === "done";
    push(t.due_date, { key: `t-${t.id}`, ref: t.id, kind: "todo", source: null, title: t.title, time: null, allDay: false, done }, 2000 + (done ? 1 : 0));
  }

  const out = new Map<string, DayItem[]>();
  for (const [date, items] of days) {
    out.set(date, items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)).map(({ order, ...item }) => (void order, item)));
  }
  return out;
}

/** Potong ke `max` item; sisanya dihitung sebagai "+N more". */
export function limitItems<T>(items: T[], max: number): { shown: T[]; more: number } {
  return items.length <= max ? { shown: items, more: 0 } : { shown: items.slice(0, max), more: items.length - max };
}

/** Ringkasan satu hari untuk label aksesibilitas: "2 events, 1 to-do". */
export function describeDay(items: DayItem[]): string {
  const events = items.filter((i) => i.kind === "event").length;
  const todos = items.length - events;
  const parts = [events ? `${events} ${events === 1 ? "event" : "events"}` : null, todos ? `${todos} ${todos === 1 ? "to-do" : "to-dos"}` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing scheduled";
}

/** Jumlah acara dan to-do yang BERBEDA (acara tiga hari dihitung satu) pada tanggal yang lolos `include`. */
export function countDistinct(items: Map<string, DayItem[]>, include: (date: string) => boolean): { events: number; todos: number } {
  const events = new Set<string>();
  const todos = new Set<string>();
  for (const [date, list] of items) {
    if (!include(date)) continue;
    for (const i of list) (i.kind === "event" ? events : todos).add(i.ref);
  }
  return { events: events.size, todos: todos.size };
}
