"use client";

import type { KbHeading } from "@/lib/kb/chapter";
import { jumpToKbAnchor } from "@/lib/kb/highlight";

// "Di halaman ini" — daftar heading bab yang sedang dibuka saja (bukan nav global).
export function KbOnThisPage({ headings, defaultOpen }: { headings: KbHeading[]; defaultOpen: boolean }) {
  if (headings.length === 0) return null;

  // Lompat lewat jumpToKbAnchor (bukan anchor bawaan browser) supaya posisinya
  // dikoreksi saat gambar lazy-load menggeser tata letak.
  function onClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.history.replaceState(window.history.state, "", `#${encodeURIComponent(id)}`);
    void jumpToKbAnchor(id);
  }

  return (
    <details open={defaultOpen} className="group rounded-md border border-border bg-surface">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium marker:text-muted">
        Di halaman ini
      </summary>
      <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto px-3 pb-3 text-sm">
        {headings.map((h) => (
          <li key={h.id} className={h.depth > 2 ? "pl-3" : "pt-1"}>
            <a
              href={`#${encodeURIComponent(h.id)}`}
              onClick={(e) => onClick(e, h.id)}
              className={`block truncate hover:text-brand-red ${
                h.depth > 2 ? "text-xs text-muted" : "font-medium"
              }`}
              title={h.text}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
