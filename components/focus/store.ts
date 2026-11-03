"use client";

import { useCallback, useSyncExternalStore } from "react";

// Status timer fokus yang sedang berjalan hidup di localStorage (satu tab atau banyak tab membacanya), bukan di database: hanya sesi
// SELESAI yang dicatat (lihat app/(dashboard)/focus/actions.ts). Perubahan di tab yang sama disiarkan lewat event kustom.

const KEY = "focus-timer-v1";
const EVENT = "focus-timer-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function snapshot(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Isi mentah localStorage (string stabil, aman untuk useSyncExternalStore). Di server selalu null. */
export function useTimerRaw(): string | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function writeTimer(state: object | null): void {
  try {
    if (state) window.localStorage.setItem(KEY, JSON.stringify(state));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* penyimpanan diblokir: timer tidak bisa dipertahankan, tidak ada yang bisa dilakukan */
  }
  window.dispatchEvent(new Event(EVENT));
}

// Detak waktu: satu nilai "sekarang" yang diperbarui tiap detik hanya selama ada timer berjalan. 0 = belum diketahui (server / sebelum langganan).
let tickAt = 0;
const nowSnapshot = () => tickAt;

/** Waktu sekarang (ms), diperbarui tiap detik selama `active`. 0 sampai klien siap: tampilkan "--:--" saat 0. */
export function useNow(active: boolean): number {
  const subscribeNow = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      tickAt = Date.now();
      onChange();
      const id = setInterval(() => {
        tickAt = Date.now();
        onChange();
      }, 1000);
      return () => clearInterval(id);
    },
    [active],
  );
  return useSyncExternalStore(subscribeNow, nowSnapshot, () => 0);
}

/** Bunyi pendek dua nada saat sesi/istirahat selesai. Bisa diblokir browser bila halaman belum pernah disentuh; abaikan saja. */
export function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.22);
      osc.stop(ctx.currentTime + i * 0.22 + 0.22);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* tanpa bunyi */
  }
}
