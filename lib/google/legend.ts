// Legenda warna: arti yang Anda berikan pada tiap warna blok (mis. merah = "Urgent", hijau = "Belajar"). Hanya nama; warnanya sendiri tersimpan
// di Google. Disimpan di browser perangkat ini (tanpa migrasi), seperti jam kerja.

import { EVENT_COLORS } from "./color";

export const LEGEND_KEY = "color-legend-v1";
export const LEGEND_NAME_MAX = 24;

/** colorId ("1".."11") -> nama buatan pengguna. Warna tanpa nama tidak ada di objek. */
export type Legend = Record<string, string>;

/** Nama yang aman: spasi dirapikan, karakter kontrol dibuang, dipotong ke batas. */
export function cleanLegendName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LEGEND_NAME_MAX).trim();
}

/** Baca nilai tersimpan (JSON) dengan aman; yang rusak atau bukan warna dikenal diabaikan. */
export function parseLegend(raw: string | null | undefined): Legend {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Legend = {};
    for (const c of EVENT_COLORS) {
      const name = cleanLegendName((v as Record<string, unknown>)[c.id]);
      if (name) out[c.id] = name;
    }
    return out;
  } catch {
    return {};
  }
}

/** Dari isian form (satu nama per warna); nama kosong dibuang. */
export function legendFromInputs(names: Record<string, string>): Legend {
  const out: Legend = {};
  for (const c of EVENT_COLORS) {
    const name = cleanLegendName(names[c.id]);
    if (name) out[c.id] = name;
  }
  return out;
}

/** Usulan pembagian (bisa diubah): urgensi dari merah ke abu-abu, plus beberapa konteks. */
export const SUGGESTED_LEGEND: Legend = {
  "11": "Urgent",
  "6": "Important",
  "5": "Waiting",
  "10": "Learning",
  "7": "Meeting",
  "3": "Client",
  "8": "Admin",
};

/** Nama yang ditampilkan untuk sebuah warna: arti buatan pengguna bila ada, kalau tidak nama warna Google. */
export function legendLabel(legend: Legend, colorId: string): string {
  return legend[colorId] ?? EVENT_COLORS.find((c) => c.id === colorId)?.name ?? "";
}
