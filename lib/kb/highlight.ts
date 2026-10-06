import { lowerSameLength } from "@/lib/kb/search-index";

// Highlight ala Ctrl+F di halaman bab: cari frasa di DOM yang sudah di-render
// (bisa nyebar ke beberapa elemen inline), scroll ke situ, lalu tempel overlay
// sementara di atas rect-nya. Overlay di luar tree React — DOM konten nggak
// diubah sama sekali, jadi aman dari re-render/hydration.
//
// Halaman bab bisa berisi ratusan gambar lazy-load tanpa dimensi, jadi tinggi
// halaman terus bertambah setelah scroll dihitung. Karena itu semua lompatan
// (hasil search, "Di halaman ini", link anchor) lewat pinTo(): posisi tujuan
// dijaga sampai tata letak stabil, baru highlight digambar.

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

// Gambar lazy di atas tujuan dipaksa load sekarang, biar tinggi halaman di atas
// tujuan cepat final (kalau nggak, tujuan terus bergeser ke bawah saat gambar
// di sekitar layar baru ketemu dimuat).
function loadImagesAbove(root: HTMLElement, target: Element): HTMLImageElement[] {
  const pending: HTMLImageElement[] = [];
  for (const img of root.querySelectorAll("img")) {
    if (!(img.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    if (!img.complete) {
      img.loading = "eager";
      pending.push(img);
    }
  }
  return pending;
}

let cancelPin: (() => void) | null = null;

// Scroll supaya tujuan ada `desired` px dari atas layar, lalu jaga di situ sampai
// semua gambar di atasnya (`pending`) selesai dimuat dan tata letak diam 500ms
// (maks 12 detik). Mengandalkan "diam sesaat" saja nggak cukup: di kunjungan
// pertama gambar butuh waktu unduh lebih lama dari itu. Hasil true = stabil;
// false = pengguna keburu scroll/ketik sendiri.
function pinTo(getTop: () => number | null, desired: number, pending: HTMLImageElement[] = []): Promise<boolean> {
  cancelPin?.();
  return new Promise((resolve) => {
    const root = document.querySelector<HTMLElement>("[data-kb-chapter]") ?? document.body;
    const userEvents = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    let remaining = pending.length;
    let quiet = 0;
    let finished = false;

    const finish = (settled: boolean) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      for (const e of userEvents) window.removeEventListener(e, onUser);
      cancelPin = null;
      resolve(settled);
    };
    const onUser = () => finish(false);

    const apply = () => {
      if (finished) return;
      const top = getTop();
      if (top === null) return;
      const delta = top - desired;
      if (Math.abs(delta) > 2) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
    };

    const armQuiet = () => {
      clearTimeout(quiet);
      if (remaining === 0) quiet = window.setTimeout(() => finish(true), 500);
    };
    const onImage = () => {
      remaining -= 1;
      apply();
      armQuiet();
    };

    const observer = new ResizeObserver(() => {
      apply();
      armQuiet();
    });
    const cap = window.setTimeout(() => finish(true), 12000);

    for (const e of userEvents) window.addEventListener(e, onUser, { passive: true });
    for (const img of pending) {
      img.addEventListener("load", onImage, { once: true });
      img.addEventListener("error", onImage, { once: true });
    }
    cancelPin = () => finish(false);
    observer.observe(root);
    apply();
    armQuiet();
  });
}

function flashRects(rects: DOMRect[]) {
  document.querySelectorAll(".kb-flash-layer").forEach((layer) => layer.remove());

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

// Lompat ke heading (tanpa highlight frasa), dengan koreksi posisi.
export async function jumpToKbAnchor(anchor: string): Promise<boolean> {
  const heading = document.getElementById(anchor);
  const root = heading?.closest<HTMLElement>("[data-kb-chapter]");
  if (!heading || !root) return false;

  const pending = loadImagesAbove(root, heading);
  await pinTo(() => heading.getBoundingClientRect().top, 24, pending);
  return true;
}

// true = frasa ketemu & di-highlight; false = fallback ke heading.
export async function highlightKbPhrase(anchor: string, phrase: string): Promise<boolean> {
  const heading = document.getElementById(anchor);
  const root = heading?.closest<HTMLElement>("[data-kb-chapter]");
  if (!heading || !root) return false;

  document.querySelectorAll(".kb-flash-layer").forEach((layer) => layer.remove());
  const pending = loadImagesAbove(root, heading);

  const range = phrase ? findRange(heading, root, phrase) : null;
  if (range) {
    const settled = await pinTo(() => range.getBoundingClientRect().top, window.innerHeight / 3, pending);
    if (settled) flashRects(Array.from(range.getClientRects()));
    return true;
  }

  const settled = await pinTo(() => heading.getBoundingClientRect().top, 24, pending);
  if (settled) flashRects([heading.getBoundingClientRect()]);
  return false;
}
