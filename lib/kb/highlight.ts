import { lowerSameLength } from "@/lib/kb/search-index";

// Highlight ala Ctrl+F di halaman bab: cari frasa di DOM yang sudah di-render
// (bisa nyebar ke beberapa elemen inline), scroll ke situ, lalu tempel overlay
// sementara di atas rect-nya. Overlay di luar tree React — DOM konten nggak
// diubah sama sekali, jadi aman dari re-render/hydration.

const HEADING = /^H[1-6]$/;
const BLOCK = /^(P|DIV|SECTION|UL|OL|LI|TABLE|THEAD|TBODY|TR|TD|TH|BLOCKQUOTE|PRE|HR|H[1-6]|BR)$/;

type CharPos = { node: Text; offset: number } | null;

// Teks section (heading s/d heading berikutnya) dengan whitespace dinormalisasi
// persis seperti normalizeWhitespace() di indeks, plus peta tiap char -> posisi
// di text node aslinya.
function collectSectionText(heading: HTMLElement, root: HTMLElement) {
  const chars: string[] = [];
  const map: CharPos[] = [];
  let pendingSpace = false;

  const pushSpace = () => {
    if (chars.length) pendingSpace = true;
  };

  // UI non-konten (tombol Edit, dll.) ditandai data-kb-skip — nggak ada di indeks.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).hasAttribute("data-kb-skip")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  walker.currentNode = heading;
  let node: Node | null = heading;
  let started = false;

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (started && HEADING.test(el.tagName) && !heading.contains(el)) break;
      if (BLOCK.test(el.tagName)) pushSpace();
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const value = text.data;
      for (let i = 0; i < value.length; i++) {
        if (/\s/.test(value[i])) {
          pushSpace();
          continue;
        }
        if (pendingSpace) {
          chars.push(" ");
          map.push(null);
          pendingSpace = false;
        }
        chars.push(value[i]);
        map.push({ node: text, offset: i });
      }
    }
    started = true;
    node = walker.nextNode();
  }

  return { text: chars.join(""), map };
}

function findRange(heading: HTMLElement, root: HTMLElement, phrase: string): Range | null {
  const needle = lowerSameLength(phrase.replace(/\s+/g, " ").trim());
  if (!needle) return null;

  const { text, map } = collectSectionText(heading, root);
  const start = lowerSameLength(text).indexOf(needle);
  if (start < 0) return null;
  const end = start + needle.length - 1;

  const first = map[start];
  const last = map[end];
  if (!first || !last) return null;

  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

function flashRects(rects: DOMRect[]) {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.className = "kb-flash-layer";
  for (const rect of rects) {
    if (!rect.width || !rect.height) continue;
    const mark = document.createElement("div");
    mark.className = "kb-flash";
    mark.style.left = `${rect.left + window.scrollX - 2}px`;
    mark.style.top = `${rect.top + window.scrollY - 1}px`;
    mark.style.width = `${rect.width + 4}px`;
    mark.style.height = `${rect.height + 2}px`;
    layer.appendChild(mark);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

function scrollToRect(rect: DOMRect) {
  const top = rect.top + window.scrollY - window.innerHeight / 3;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

// true = frasa ketemu & di-highlight; false = fallback ke heading.
export function highlightKbPhrase(anchor: string, phrase: string): boolean {
  const heading = document.getElementById(anchor);
  const root = heading?.closest<HTMLElement>("[data-kb-chapter]");
  if (!heading || !root) return false;

  const range = phrase ? findRange(heading, root, phrase) : null;
  if (range) {
    const rects = Array.from(range.getClientRects());
    scrollToRect(range.getBoundingClientRect());
    // Posisi dihitung dalam koordinat dokumen, jadi valid walau smooth scroll
    // masih jalan.
    flashRects(rects);
    return true;
  }

  heading.scrollIntoView({ block: "start", behavior: "smooth" });
  flashRects([heading.getBoundingClientRect()]);
  return false;
}
