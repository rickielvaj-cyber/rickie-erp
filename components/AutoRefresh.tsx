"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { shouldPauseRefresh } from "@/lib/auto-refresh";

/** Elemen yang berarti "ada yang sedang dikerjakan di sini": seleksi batch, dialog, dan apa pun yang diberi data-pause-refresh. */
const PAUSE_SELECTOR = '[data-pause-refresh], [role="dialog"]';

/**
 * Menjaga halaman tetap mutakhir tanpa muat ulang manual (mis. catatan atau to-do yang baru diketik di HP): ambil data baru saat
 * tab kembali dibuka/difokuskan dan tiap `intervalMs` selama tab terlihat. Tab yang tersembunyi tidak memanggil server. Bukan push
 * real time: paling lambat `intervalMs` setelah perubahan.
 *
 * Menunggu (tidak me-refresh) selama kamu sedang mengerjakan sesuatu: kolom teks sedang fokus, form terbuka (parameter URL
 * di `pauseParams`, mis. "new"/"edit"), ada dialog atau seleksi, atau tombol mouse/jari sedang ditekan (menyeret).
 */
const NO_PARAMS: readonly string[] = [];

export function AutoRefresh({ intervalMs = 8000, pauseParams = NO_PARAMS }: { intervalMs?: number; pauseParams?: readonly string[] }) {
  const router = useRouter();
  useEffect(() => {
    let pointerDown = false;
    const down = () => {
      pointerDown = true;
    };
    const up = () => {
      pointerDown = false;
    };

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const active = document.activeElement as HTMLElement | null;
      const pause = shouldPauseRefresh({
        activeTag: active?.tagName ?? null,
        activeType: active instanceof HTMLInputElement ? active.type : null,
        activeEditable: Boolean(active?.isContentEditable),
        search: window.location.search,
        pauseParams,
        hasPauseElement: document.querySelector(PAUSE_SELECTOR) !== null,
        pointerDown,
      });
      if (!pause) router.refresh();
    };

    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [router, intervalMs, pauseParams]);
  return null;
}
