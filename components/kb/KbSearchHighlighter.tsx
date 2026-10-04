"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { highlightKbPhrase } from "@/lib/kb/highlight";
import { KB_HIGHLIGHT_EVENT, type KbHighlightDetail } from "@/components/kb/KbSearch";

function run(anchor: string, phrase: string) {
  // Dua frame: tunggu layout + scroll-ke-hash bawaan Next selesai dulu.
  requestAnimationFrame(() => requestAnimationFrame(() => highlightKbPhrase(anchor, phrase)));
}

// Dipasang di halaman bab. Dua jalur masuk:
// - navigasi dari bab lain: /knowledge-base/x?hl=<frasa>#<anchor>
// - hasil search di bab yang sama: event KB_HIGHLIGHT_EVENT (tanpa ganti URL)
export function KbSearchHighlighter() {
  const searchParams = useSearchParams();
  const phrase = searchParams.get("hl");

  useEffect(() => {
    if (phrase === null) return;
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (anchor) run(anchor, phrase);

    // Buang ?hl dari URL biar refresh/share nggak nge-highlight ulang.
    const url = new URL(window.location.href);
    url.searchParams.delete("hl");
    window.history.replaceState(window.history.state, "", url);
  }, [phrase]);

  useEffect(() => {
    function onHighlight(e: Event) {
      const { anchor, phrase } = (e as CustomEvent<KbHighlightDetail>).detail;
      window.history.replaceState(window.history.state, "", `#${encodeURIComponent(anchor)}`);
      run(anchor, phrase);
    }
    window.addEventListener(KB_HIGHLIGHT_EVENT, onHighlight);
    return () => window.removeEventListener(KB_HIGHLIGHT_EVENT, onHighlight);
  }, []);

  return null;
}
