"use client";

import { EVENT_COLORS } from "@/lib/google/color";
import { useLegend } from "@/components/calendar/legend-store";

/** Baris legenda warna (hanya warna yang diberi nama). Tidak menampilkan apa pun bila belum ada nama. */
export function ColorLegendRow({ className = "" }: { className?: string }) {
  const legend = useLegend();
  const named = EVENT_COLORS.filter((c) => legend[c.id]);
  if (named.length === 0) return null;
  return (
    <ul aria-label="Color legend" className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted ${className}`}>
      {named.map((c) => (
        <li key={c.id} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
          {legend[c.id]}
        </li>
      ))}
    </ul>
  );
}
