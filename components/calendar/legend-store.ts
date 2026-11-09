"use client";

import { useMemo, useSyncExternalStore } from "react";
import { saveColorLegend, type SaveLegendResult } from "@/app/(dashboard)/todos/legend-actions";
import { LEGEND_KEY, parseLegend, type Legend } from "@/lib/google/legend";

// Legenda warna: sumber kebenarannya database (sama di laptop dan HP). localStorage hanya cache supaya tampil seketika tanpa berkedip dan
// tetap jalan bila server tidak terjangkau atau tabelnya belum ada. Semua tampilan kalender (minggu dan bulan) membacanya dari sini.
const EVENT = "color-legend-change";

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
};

export const readLegendRaw = () => {
  try {
    return window.localStorage.getItem(LEGEND_KEY);
  } catch {
    return null;
  }
};

export function useLegend(): Legend {
  const raw = useSyncExternalStore(subscribe, readLegendRaw, () => null);
  return useMemo(() => parseLegend(raw), [raw]);
}

/** Tulis ke cache lokal dan beri tahu semua tampilan. */
export function writeLocalLegend(next: Legend): void {
  try {
    window.localStorage.setItem(LEGEND_KEY, JSON.stringify(next));
  } catch {
    // penyimpanan browser tidak tersedia: perubahan tidak tersimpan di cache
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Jumlah penyimpanan ke server yang sedang berjalan: selama ada, data server (yang masih lama) tidak boleh menimpa cache lokal. */
let pendingSaves = 0;
export const hasPendingLegendSave = () => pendingSaves > 0;

/** Simpan: cache lokal langsung (tampil seketika), lalu ke database. Mengembalikan hasil penyimpanan server. */
export async function saveLegend(next: Legend): Promise<SaveLegendResult> {
  writeLocalLegend(next);
  pendingSaves++;
  try {
    return await saveColorLegend(next);
  } catch {
    return { ok: false, error: "Could not reach the server." };
  } finally {
    pendingSaves--;
  }
}
