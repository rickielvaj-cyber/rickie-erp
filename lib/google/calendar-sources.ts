import type { CalendarEvent } from "./layout";

// Kalender Google tambahan (hanya baca). Bagian murni: validasi ID yang ditempel, label, dan menggabungkan acara. Tanpa jaringan.

export const MAX_EXTRA_CALENDARS = 3;
export const LABEL_MAX = 80;

// ID kalender Google: alamat email (mis. nama@gmail.com) atau ID grup (mis. abc123@group.calendar.google.com,
// en.indonesian#holiday@group.v.calendar.google.com).
const ID_RE = /^[a-z0-9._%+#-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/** Rapikan ID yang ditempel dan periksa bentuknya. ID disimpan huruf kecil (ID kalender Google tidak peka huruf besar/kecil). */
export function parseCalendarId(raw: unknown): { ok: true; id: string } | { ok: false; error: string } {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (id === "") return { ok: false, error: "Paste the calendar ID." };
  if (id === "primary") return { ok: false, error: "That is your main calendar; it is already shown." };
  if (/\s/.test(id) || id.length < 3 || id.length > 200 || !ID_RE.test(id)) {
    return { ok: false, error: "That does not look like a calendar ID. It looks like name@gmail.com or abc123@group.calendar.google.com." };
  }
  return { ok: true, id };
}

/** Label yang ditampilkan: yang diketik pengguna, kalau kosong judul kalender dari Google, kalau kosong bagian depan ID. */
export function calendarLabel(typed: unknown, googleTitle: string | null | undefined, id: string): string {
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LABEL_MAX) : "");
  return clean(typed) || clean(googleTitle) || id.split("@")[0].slice(0, LABEL_MAX);
}

export type ExtraEvents = { label: string; events: CalendarEvent[] };

/**
 * Gabungkan acara kalender utama dengan acara kalender tambahan. Acara tambahan diberi `source` (labelnya) dan DIBUANG bila
 * acara yang sama sudah ada (iCalUID sama dengan acara utama atau kalender tambahan sebelumnya): undangan rapat yang muncul
 * di dua kalender cukup tampil sekali, sebagai acara kalender utama.
 */
export function mergeExtraEvents(primary: CalendarEvent[], extras: ExtraEvents[]): CalendarEvent[] {
  const seen = new Set<string>();
  for (const e of primary) if (e.uid) seen.add(e.uid);
  const out = [...primary];
  for (const { label, events } of extras) {
    for (const e of events) {
      if (e.uid) {
        if (seen.has(e.uid)) continue;
        seen.add(e.uid);
      }
      out.push({ ...e, source: label });
    }
  }
  return out;
}

/** Pesan singkat untuk satu kalender tambahan yang gagal dibaca (tanpa membocorkan isi respons Google). */
export function describeCalendarFailure(label: string, status: number | undefined): string {
  if (status === 404) return `“${label}” was not found (the ID may be wrong, or the calendar was deleted).`;
  if (status === 403 || status === 401) return `“${label}” could not be read: this Google account has no access to it.`;
  return `“${label}” could not be read right now.`;
}
