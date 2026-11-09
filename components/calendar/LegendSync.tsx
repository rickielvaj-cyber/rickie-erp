"use client";

import { useEffect } from "react";
import { saveColorLegend } from "@/app/(dashboard)/todos/legend-actions";
import { legendsEqual, parseLegend, type ServerLegend } from "@/lib/google/legend";
import { hasPendingLegendSave, readLegendRaw, writeLocalLegend } from "@/components/calendar/legend-store";

/**
 * Menyamakan legenda warna antar perangkat. Halaman memberi tahu apa isi database:
 * - ada isinya -> menjadi acuan; cache lokal diperbarui bila berbeda (mis. diubah dari perangkat lain);
 * - belum ada baris tetapi perangkat ini punya legenda (dibuat sebelum sinkron ada) -> diunggah sekali;
 * - tabel/kueri tidak tersedia -> tidak melakukan apa pun (tetap memakai legenda lokal).
 * Tidak merender apa pun.
 */
export function LegendSync({ server }: { server: ServerLegend }) {
  useEffect(() => {
    const local = parseLegend(readLegendRaw());
    if (server.status === "ok") {
      if (!hasPendingLegendSave() && !legendsEqual(local, server.legend)) writeLocalLegend(server.legend);
    } else if (server.status === "none" && Object.keys(local).length > 0 && !hasPendingLegendSave()) {
      void saveColorLegend(local);
    }
  }, [server]);
  return null;
}
