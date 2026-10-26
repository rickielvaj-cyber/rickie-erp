"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Menjaga halaman yang hanya dibaca tetap mutakhir tanpa muat ulang manual (mis. catatan yang baru diketik di HP):
 * ambil data baru saat tab kembali dibuka/difokuskan dan tiap `intervalMs` selama tab terlihat. Tab yang tersembunyi tidak
 * memanggil server. Bukan push real time: paling lambat `intervalMs` setelah perubahan.
 */
export function AutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router, intervalMs]);
  return null;
}
