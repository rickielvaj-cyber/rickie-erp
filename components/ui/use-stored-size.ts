"use client";

import { useCallback, useSyncExternalStore } from "react";

// Ukuran yang diatur pengguna dengan menarik (tinggi kotak kalender / papan mingguan), disimpan per perangkat di browser.
// null = belum pernah diatur: pakai ukuran bawaan dari CSS.

const EVENT = "stored-size-change";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(EVENT, notify);
  };
}

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Angka tersimpan yang valid (px), atau null. */
export function parseStoredSize(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}

export function useStoredSize(key: string, min: number, max: number): [number | null, (px: number | null) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const set = useCallback(
    (px: number | null) => {
      try {
        if (px === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, String(Math.round(px)));
      } catch {
        // penyimpanan browser tidak tersedia: berlaku sampai halaman ditutup saja
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [parseStoredSize(raw, min, max), set];
}
