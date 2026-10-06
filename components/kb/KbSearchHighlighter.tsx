"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { highlightKbPhrase, jumpToKbAnchor } from "@/lib/kb/highlight";
import { KB_HIGHLIGHT_EVENT, type KbHighlightDetail } from "@/components/kb/KbSearch";

// Tunggu 2 frame: layout + scroll-ke-hash bawaan browser selesai dulu.
function afterLayout(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

// Dipasang di halaman bab. Tiga jalur masuk:
// - navigasi dari bab lain lewat search: /knowledge-base/x?hl=<frasa>#<anchor>
// - hasil search di bab yang sama: event KB_HIGHLIGHT_EVENT (tanpa ganti URL)
// - buka bab dengan #<anchor> saja (redirect URL lama, dll.): lompat dengan
//   koreksi posisi, karena gambar lazy-load menggeser tata letak.
export function KbSearchHighlighter() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const phrase = searchParams.get("hl");
  const handledPath = useRef<string | null>(null);

  useEffect(() => {
    // Membuang ?hl dari URL (di bawah) bikin effect ini jalan lagi dengan
    // phrase = null — itu bukan kunjungan baru, jangan lompat lagi (lompatan
    // kedua membatalkan highlight yang sedang jalan).
    const firstForPath = handledPath.current !== pathname;
    handledPath.current = pathname;

    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (!anchor) return;

    if (phrase !== null) {
      afterLayout(() => void highlightKbPhrase(anchor, phrase));
      // Buang ?hl dari URL biar refresh/share nggak nge-highlight ulang.
      const url = new URL(window.location.href);
      url.searchParams.delete("hl");
      window.history.replaceState(window.history.state, "", url);
    } else if (firstForPath) {
      afterLayout(() => void jumpToKbAnchor(anchor));
    }
  }, [phrase, pathname]);

  useEffect(() => {
    function onHighlight(e: Event) {
      const { anchor, phrase } = (e as CustomEvent<KbHighlightDetail>).detail;
      window.history.replaceState(window.history.state, "", `#${encodeURIComponent(anchor)}`);
      afterLayout(() => void highlightKbPhrase(anchor, phrase));
    }
    window.addEventListener(KB_HIGHLIGHT_EVENT, onHighlight);
    return () => window.removeEventListener(KB_HIGHLIGHT_EVENT, onHighlight);
  }, []);

  return null;
}
