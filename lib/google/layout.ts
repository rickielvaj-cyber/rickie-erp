import { addDaysISO } from "@/lib/date";

// Menata acara kalender ke grid minggu. Semua murni (tanpa jaringan) supaya mudah diuji.
// Zona waktu aplikasi: Asia/Jakarta (WIB, UTC+7, tanpa DST), sama seperti seluruh situs.
const WIB_OFFSET_MIN = 7 * 60;

export type CalendarEvent = {
  id: string;
  title: string;
  allDay: boolean;
  /** Acara berjam: instan ISO dari Google. Acara seharian: tanggal YYYY-MM-DD (end = hari SETELAH hari terakhir, aturan Google). */
  start: string;
  end: string;
  link?: string;
};

export type TimedBlock = { event: CalendarEvent; startMin: number; endMin: number; lane: number; lanes: number };
export type DayLayout = { date: string; allDay: CalendarEvent[]; blocks: TimedBlock[] };

const MIN_BLOCK_MIN = 20;

/** Instan ISO -> { tanggal WIB, menit sejak 00:00 WIB }. */
export function toWib(iso: string): { date: string; minutes: number } {
  const shifted = new Date(new Date(iso).getTime() + WIB_OFFSET_MIN * 60_000);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/** Atur acara yang saling tumpang tindih ke "lajur" berdampingan. Mengisi lane dan lanes per kelompok yang bersambung. */
function assignLanes(blocks: Omit<TimedBlock, "lane" | "lanes">[]): TimedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: TimedBlock[] = [];
  let group: TimedBlock[] = [];
  let groupEnd = -1;
  const laneEnds: number[] = [];

  const closeGroup = () => {
    for (const b of group) b.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds.length = 0;
  };

  for (const b of sorted) {
    if (group.length > 0 && b.startMin >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = b.endMin;
    groupEnd = Math.max(groupEnd, b.endMin);
    group.push({ ...b, lane, lanes: 1 });
  }
  closeGroup();
  return out;
}

/** Acara dibagi per hari (WIB) untuk 7 hari mulai `weekStart`; acara lintas tengah malam dipotong per hari. */
export function layoutWeek(events: CalendarEvent[], weekStart: string): DayLayout[] {
  const days: DayLayout[] = Array.from({ length: 7 }, (_, i) => ({ date: addDaysISO(weekStart, i), allDay: [], blocks: [] }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const raw = new Map<string, Omit<TimedBlock, "lane" | "lanes">[]>();

  for (const event of events) {
    if (event.allDay) {
      // end eksklusif: acara 3 hari berakhir "hari ke-4".
      for (let date = event.start; date < event.end; date = addDaysISO(date, 1)) byDate.get(date)?.allDay.push(event);
      continue;
    }
    const s = toWib(event.start);
    const e = toWib(event.end);
    for (let date = s.date; date <= e.date; date = addDaysISO(date, 1)) {
      if (!byDate.has(date)) continue;
      const startMin = date === s.date ? s.minutes : 0;
      let endMin = date === e.date ? e.minutes : 24 * 60;
      if (date === e.date && e.minutes === 0 && date !== s.date) continue; // berakhir tepat 00:00: tidak masuk hari itu
      endMin = Math.max(endMin, startMin + MIN_BLOCK_MIN);
      raw.set(date, [...(raw.get(date) ?? []), { event, startMin, endMin: Math.min(endMin, 24 * 60) }]);
    }
  }
  for (const day of days) day.blocks = assignLanes(raw.get(day.date) ?? []);
  return days;
}

/** Jam yang ditampilkan paling atas saat kalender dibuka: 07:00, atau satu jam sebelum acara paling awal bila ada yang lebih pagi. */
export function initialScrollHour(days: DayLayout[], defaultHour = 7): number {
  let hour = defaultHour;
  for (const day of days) for (const b of day.blocks) hour = Math.min(hour, Math.floor(b.startMin / 60) - 1);
  return Math.max(0, hour);
}

/** "09:00–10:30" (WIB) dari dua instan ISO; null bila salah satunya kosong atau tidak valid. */
export function formatScheduled(start: string | null, end: string | null): string | null {
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
  const hhmm = (iso: string) => {
    const { minutes } = toWib(iso);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  return `${hhmm(start)}–${hhmm(end)}`;
}
