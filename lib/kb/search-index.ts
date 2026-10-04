import MiniSearch from "minisearch";
import type { KbSearchSection } from "@/lib/kb/chapter";

// Indeks search KB di browser. Section-nya dibuat server dari jalur render yang
// sama dengan halaman bab (lib/kb/chapter.ts) — di sini cuma di-index.
// Dibangun lazy: prefetch saat idle di layout /knowledge-base, atau saat
// palette search dibuka; di-reset tiap entri disimpan.

type KbIndex = MiniSearch<KbSearchSection>;

let indexPromise: Promise<KbIndex> | null = null;

async function buildIndex(): Promise<KbIndex> {
  const res = await fetch("/api/knowledge-base/search-index", { cache: "no-store" });
  if (!res.ok) throw new Error(`Gagal memuat indeks (${res.status})`);
  const { sections } = (await res.json()) as { sections: KbSearchSection[] };

  const index = new MiniSearch<KbSearchSection>({
    fields: ["heading", "text", "chapter"],
    storeFields: ["module", "chapter", "anchor", "heading", "text"],
    searchOptions: {
      boost: { heading: 3, chapter: 0.5 },
      prefix: true,
      fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
      combineWith: "AND",
    },
  });
  await index.addAllAsync(sections, { chunkSize: 50 });
  return index;
}

export function loadKbSearchIndex(): Promise<KbIndex> {
  if (!indexPromise) {
    indexPromise = buildIndex();
    indexPromise.catch(() => {
      indexPromise = null; // biar bisa dicoba lagi
    });
  }
  return indexPromise;
}

export function invalidateKbSearchIndex() {
  indexPromise = null;
}

export function prefetchKbSearchIndex(): () => void {
  const run = () => void loadKbSearchIndex().catch(() => {});
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 1500);
  return () => clearTimeout(handle);
}

export type KbSearchHit = {
  id: string;
  module: string;
  chapter: string;
  anchor: string;
  heading: string;
  // Teks persis (case asli) yang di-highlight di halaman, plus potongan snippet.
  phrase: string;
  snippet: { before: string; match: string; after: string } | null;
};

// Lowercase yang menjaga panjang string, supaya index hasil indexOf di versi
// lowercase tetap valid di teks asli (beberapa char Unicode berubah panjang).
export function lowerSameLength(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

function findAtWordStart(haystackLower: string, needle: string): number {
  let from = 0;
  while (needle) {
    const i = haystackLower.indexOf(needle, from);
    if (i < 0) return -1;
    if (i === 0 || !WORD_CHAR.test(haystackLower[i - 1])) return i;
    from = i + 1;
  }
  return -1;
}

// Cari rentang yang mau di-highlight: frasa query utuh dulu, kalau nggak ada
// pakai term dokumen yang cocok (hasil prefix/fuzzy MiniSearch), terpanjang dulu.
function locate(text: string, query: string, terms: string[]): { start: number; end: number } | null {
  const lower = lowerSameLength(text);
  const q = lowerSameLength(query.replace(/\s+/g, " ").trim());
  if (q.length >= 2) {
    const i = findAtWordStart(lower, q);
    if (i >= 0) return { start: i, end: i + q.length };
  }
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const i = findAtWordStart(lower, term);
    if (i >= 0) {
      let end = i + term.length;
      while (end < text.length && WORD_CHAR.test(text[end])) end++;
      return { start: i, end };
    }
  }
  return null;
}

function makeSnippet(text: string, start: number, end: number) {
  const ctxBefore = 60;
  const ctxAfter = 90;
  let from = Math.max(0, start - ctxBefore);
  let to = Math.min(text.length, end + ctxAfter);
  if (from > 0) from = text.indexOf(" ", from) + 1 || from;
  if (to < text.length) to = text.lastIndexOf(" ", to) > end ? text.lastIndexOf(" ", to) : to;
  return {
    before: (from > 0 ? "…" : "") + text.slice(from, start),
    match: text.slice(start, end),
    after: text.slice(end, to) + (to < text.length ? "…" : ""),
  };
}

export function searchKb(index: KbIndex, query: string, limit = 20): KbSearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return index.search(trimmed).slice(0, limit).map((result) => {
    const section = result as unknown as KbSearchSection & { terms: string[] };
    const inText = locate(section.text, trimmed, result.terms);
    const inHeading = inText ? null : locate(section.heading, trimmed, result.terms);

    let phrase = "";
    let snippet: KbSearchHit["snippet"] = null;
    if (inText) {
      phrase = section.text.slice(inText.start, inText.end);
      snippet = makeSnippet(section.text, inText.start, inText.end);
    } else if (inHeading) {
      phrase = section.heading.slice(inHeading.start, inHeading.end);
      snippet = section.text ? makeSnippet(section.text, 0, 0) : null;
    }

    return {
      id: String(result.id),
      module: section.module,
      chapter: section.chapter,
      anchor: section.anchor,
      heading: section.heading,
      phrase,
      snippet,
    };
  });
}
