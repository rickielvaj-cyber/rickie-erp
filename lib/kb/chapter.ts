import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import { defaultUrlTransform } from "react-markdown";
import type { Element, ElementContent, Root, RootContent } from "hast";
import { createSlugger } from "@/lib/kb/slug";
import { kbModuleLabel, type KbModuleSlug } from "@/lib/kb/modules";

// SATU-SATUNYA jalur render konten KB. Halaman bab (/knowledge-base/[module])
// me-render hast dari sini, dan indeks pencarian (/api/knowledge-base/search-index)
// mengekstrak teks dari hast yang sama — jadi anchor heading di hasil search
// dijamin sama dengan id di DOM. Jangan bikin parser/slugger kedua.

export type KbChapterEntryInput = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
};

export type KbHeading = {
  id: string;
  text: string;
  depth: number; // 2 = judul entri, 3+ = heading di dalam konten
  entryId: string;
};

export type KbChapterSection = {
  entry: KbChapterEntryInput;
  anchor: string; // id heading judul entri
  tree: Root; // judul entri (h2) + konten
};

export type KbChapter = {
  module: KbModuleSlug;
  sections: KbChapterSection[];
  headings: KbHeading[];
};

// remark-breaks: konten sumber pakai single newline antar baris (mis. baris
// "• bullet"), bukan blank-line paragraph markdown — tanpa ini semua baris
// nyatu jadi satu paragraf. Sama persis dengan setup react-markdown sebelumnya
// (tanpa raw HTML).
const processor = unified().use(remarkParse).use(remarkBreaks).use(remarkRehype);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCK_TAGS = new Set([
  "p", "div", "section", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "pre", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
]);

function isHeading(node: RootContent | ElementContent): node is Element {
  return node.type === "element" && HEADING_TAGS.has(node.tagName);
}

function compareTitles(a: { title: string }, b: { title: string }): number {
  // numeric: "6.2" sebelum "6.10" (sort string biasa kebalik).
  return a.title.localeCompare(b.title, "id", { numeric: true, sensitivity: "base" });
}

function markdownToHast(markdown: string): Root {
  return processor.runSync(processor.parse(markdown)) as Root;
}

// Judul entri = h2, jadi heading di dalam konten minimal h3 biar hierarki
// "on this page" tetap benar.
function demoteHeadings(node: Root | Element) {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "h1" || child.tagName === "h2") child.tagName = "h3";
    demoteHeadings(child);
  }
}

// Ekuivalen urlTransform default react-markdown (blokir javascript: dll).
function sanitizeUrls(node: Root | Element) {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    for (const key of ["href", "src"] as const) {
      const value = child.properties[key];
      if (typeof value === "string") child.properties[key] = defaultUrlTransform(value);
    }
    sanitizeUrls(child);
  }
}

// ```mermaid -> <div data-kb-mermaid="<source>"> tanpa children. KbContent
// me-render jadi <MermaidDiagram>. Source diagram sengaja nggak jadi text
// node, jadi nggak ikut ke indeks search (snippet nggak berisi kode mermaid).
function extractMermaid(node: Root | Element) {
  node.children = node.children.map((child) => {
    if (child.type !== "element") return child;
    const code = child.tagName === "pre" ? child.children.find((c) => c.type === "element") : undefined;
    const classes = code?.type === "element" ? code.properties.className : undefined;
    if (code && Array.isArray(classes) && classes.includes("language-mermaid")) {
      const chart = hastText(code).replace(/\n$/, "");
      return { type: "element", tagName: "div", properties: { dataKbMermaid: chart }, children: [] };
    }
    extractMermaid(child);
    return child;
  }) as typeof node.children;
}

export function hastText(node: Root | RootContent | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element" && node.tagName === "br") return "\n";
  if (node.type !== "element" && node.type !== "root") return "";
  const inner = node.children.map(hastText).join("");
  return node.type === "element" && BLOCK_TAGS.has(node.tagName) ? `\n${inner}\n` : inner;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildKbChapter(module: KbModuleSlug, entries: KbChapterEntryInput[]): KbChapter {
  const slug = createSlugger();
  const headings: KbHeading[] = [];

  const sections = [...entries].sort(compareTitles).map((entry) => {
    const content = markdownToHast(entry.content);
    demoteHeadings(content);
    sanitizeUrls(content);
    extractMermaid(content);

    const title: Element = {
      type: "element",
      tagName: "h2",
      properties: {},
      children: [{ type: "text", value: entry.title }],
    };
    const tree: Root = { type: "root", children: [title, ...content.children] };

    // Id di-assign dalam urutan dokumen di seluruh bab, jadi duplikat lintas
    // entri (mis. dua "### Contoh") tetap unik di satu halaman.
    const assign = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (isHeading(child)) {
          const text = normalizeWhitespace(hastText(child));
          const id = slug(text);
          child.properties.id = id;
          headings.push({ id, text, depth: Number(child.tagName[1]), entryId: entry.id });
        } else {
          assign(child);
        }
      }
    };
    assign(tree);

    return { entry, anchor: String(title.properties.id), tree };
  });

  return { module, sections, headings };
}

export type KbSearchSection = {
  id: string; // `${module}#${anchor}` — unik di seluruh KB
  module: KbModuleSlug;
  chapter: string;
  anchor: string;
  heading: string;
  text: string; // plain text section, whitespace dinormalisasi
};

// Potong bab jadi section per heading (judul entri & tiap heading konten).
// Teks sebelum heading konten pertama ikut section judul entrinya.
export function kbChapterSearchSections(chapter: KbChapter): KbSearchSection[] {
  const chapterLabel = kbModuleLabel(chapter.module);
  const result: KbSearchSection[] = [];

  for (const { tree } of chapter.sections) {
    let current: { anchor: string; heading: string; parts: string[] } | null = null;
    const flush = () => {
      if (!current) return;
      result.push({
        id: `${chapter.module}#${current.anchor}`,
        module: chapter.module,
        chapter: chapterLabel,
        anchor: current.anchor,
        heading: current.heading,
        text: normalizeWhitespace(current.parts.join("")),
      });
    };

    for (const node of tree.children) {
      if (isHeading(node)) {
        flush();
        current = {
          anchor: String(node.properties.id),
          heading: normalizeWhitespace(hastText(node)),
          parts: [],
        };
      } else if (current) {
        current.parts.push(hastText(node));
      }
    }
    flush();
  }

  return result;
}
