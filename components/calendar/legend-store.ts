"use client";

import { useMemo, useSyncExternalStore } from "react";
import { LEGEND_KEY, parseLegend, type Legend } from "@/lib/google/legend";

// Legenda warna disimpan di localStorage browser ini; semua tampilan kalender (minggu dan bulan) membacanya dari sini.
const EVENT = "color-legend-change";

const subscribe = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
};

const readRaw = () => {
  try {
    return window.localStorage.getItem(LEGEND_KEY);
  } catch {
    return null;
  }
};

export function useLegend(): Legend {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseLegend(raw), [raw]);
}

export function saveLegend(next: Legend): void {
  try {
    window.localStorage.setItem(LEGEND_KEY, JSON.stringify(next));
  } catch {
    // penyimpanan browser tidak tersedia: perubahan tidak tersimpan
  }
  window.dispatchEvent(new Event(EVENT));
}
