"use client";

import { useEffect } from "react";
import { runSyncOnce } from "@/components/focus/sync";

const INTERVAL_MS = 20_000;

/**
 * Tanpa tampilan. Menyamakan timer fokus perangkat ini dengan server: sekali saat halaman dibuka, tiap 20 detik selama tab terlihat, dan
 * segera saat tab dibuka/difokuskan lagi. Tab tersembunyi tidak memanggil server. Dipasang sekali di menu atas (semua halaman).
 */
export function FocusSync() {
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        await runSyncOnce();
      } finally {
        busy = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), INTERVAL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return null;
}
