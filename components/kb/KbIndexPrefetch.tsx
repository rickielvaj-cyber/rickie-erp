"use client";

import { useEffect } from "react";
import { prefetchKbSearchIndex } from "@/lib/kb/search-index";

// Bangun indeks search di background (saat browser idle) begitu user masuk
// section Knowledge Base — nggak di-load di section lain.
export function KbIndexPrefetch() {
  useEffect(() => prefetchKbSearchIndex(), []);
  return null;
}
