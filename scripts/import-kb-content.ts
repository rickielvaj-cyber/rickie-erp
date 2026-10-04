// Reimport isi KB dari dokumen Word (sumber: Supabase Storage) ke kb_entries.
// Jalan LOKAL aja — mode --apply butuh SUPABASE_SERVICE_ROLE_KEY (bypass RLS),
// jangan pernah di Vercel/CI dan jangan di-commit.
//
//   npx tsx scripts/import-kb-content.ts             # dry run (default): nggak nulis apa pun
//   npx tsx scripts/import-kb-content.ts --apply     # upload gambar + UPDATE kb_entries
//   ... --force                                      # timpa juga entri yang sudah punya gambar ("![")
//
// Struktur dokumen: H1 = bab (-> module slug), H2 = entri (-> title),
// H3/H4 = heading di dalam konten. Gambar di-upload ke
// kb-documents/images/<module>/<entry-slug>-<n>.<ext> (bucket public) dan
// ditaruh inline persis di posisinya di dokumen.
//
// Dry run nulis hasil markdown tiap entri ke data/import/preview/ (gitignored)
// dan mencocokkan judul ke data/import/entries-snapshot.tsv kalau service key
// belum diisi.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import mammoth from "mammoth";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import type { Element, ElementContent, Root, RootContent } from "hast";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ROOT = resolve(__dirname, "..");
const DOCX_STORAGE_PATH = "imports/ERP_KB_v2_RAPI_29Sep2026.docx";
const LOCAL_DOCX = resolve(ROOT, "data/import/ERP_KB_v2_RAPI_29Sep2026.docx");
const SNAPSHOT = resolve(ROOT, "data/import/entries-snapshot.tsv");
const PREVIEW_DIR = resolve(ROOT, "data/import/preview");
const BUCKET = "kb-documents";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function loadEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// H1 -> module slug

const BAB_MODULES: Record<number, string> = {
  1: "fondasi-erp",
  2: "digital-modeling",
  3: "master-data",
  4: "purchasing",
  5: "sales",
  6: "inventory",
  7: "inventory-accounting",
  8: "accounting-common",
  9: "ap",
  10: "ar",
  11: "gl",
  12: "fixed-assets",
  13: "expense-service",
  14: "enterprise-report",
  15: "troubleshooting",
  16: "studi-kasus",
};

function moduleForH1(text: string): string | null {
  if (text.startsWith("Pengantar")) return "pengantar";
  // Regex, bukan startsWith("Bab 1") — itu juga cocok ke "Bab 10".."Bab 16".
  const bab = /^Bab (\d+)\b/.exec(text);
  return bab ? (BAB_MODULES[Number(bab[1])] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Helpers

function textOf(node: Root | RootContent | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element" && node.type !== "root") return "";
  return node.children.map(textOf).join("");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function entrySlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleKey(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "—")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// HTML (mammoth) -> markdown

type ImageJob = { path: string; url: string; data: Buffer; contentType: string };

type Ctx = {
  module: string;
  slug: string;
  counter: number;
  images: ImageJob[];
  sourceImages: { data: Buffer; contentType: string }[];
  publicBase: string;
};

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

function imageMd(src: string, ctx: Ctx): string {
  const m = /^kbimg:(\d+)$/.exec(src);
  if (!m) return "";
  const source = ctx.sourceImages[Number(m[1])];
  const ext = EXT[source.contentType] ?? "bin";
  ctx.counter += 1;
  const path = `images/${ctx.module}/${ctx.slug}-${ctx.counter}.${ext}`;
  const url = `${ctx.publicBase}/storage/v1/object/public/${BUCKET}/${path}`;
  ctx.images.push({ path, url, data: source.data, contentType: source.contentType });
  return `![](${url})`;
}

function escapeText(s: string): string {
  return s.replace(/([\\`*_<])/g, "\\$1");
}

// Gabung <strong>a</strong><strong>b</strong> jadi satu biar nggak jadi "**a****b**".
function mergeAdjacent(children: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = [];
  for (const child of children) {
    const prev = out[out.length - 1];
    if (
      child.type === "element" &&
      prev?.type === "element" &&
      prev.tagName === child.tagName &&
      ["strong", "em", "b", "i"].includes(child.tagName)
    ) {
      out[out.length - 1] = { ...prev, children: [...prev.children, ...child.children] };
    } else {
      out.push(child);
    }
  }
  return out;
}

function wrap(marker: string, inner: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  if (!m[2]) return inner;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

function inline(children: ElementContent[], ctx: Ctx): string {
  return mergeAdjacent(children)
    .map((node): string => {
      if (node.type === "text") return escapeText(node.value);
      if (node.type !== "element") return "";
      switch (node.tagName) {
        case "strong":
        case "b":
          return wrap("**", inline(node.children, ctx));
        case "em":
        case "i":
          return wrap("_", inline(node.children, ctx));
        case "br":
          return "\n";
        case "img":
          return imageMd(String(node.properties.src ?? ""), ctx);
        case "a": {
          const inner = inline(node.children, ctx);
          const href = String(node.properties.href ?? "");
          // Anchor internal Word (TOC/bookmark "#_Toc...") nggak berguna di web.
          return href && !href.startsWith("#") && inner.trim() ? `[${inner}](${href})` : inner;
        }
        default:
          return inline(node.children, ctx);
      }
    })
    .join("");
}

// Baris paragraf yang kebetulan diawali sintaks block markdown.
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+])/, "$1\\$2")
    .replace(/^(\s*)-(\s)/, "$1\\-$2")
    .replace(/^(\s*)(\d+)([.)])(\s)/, "$1$2\\$3$4");
}

function rawText(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  if (node.tagName === "br") return "\n";
  return node.children.map(rawText).join("");
}

// Paragraf yang di Word sebenarnya diagram ASCII yang disejajarkan pakai spasi
// (mis. alur "1. ...\n   ↓\n2. ..."): ≥3 baris dan ada indentasi/spasi
// perataan. Jadi code block biar perataannya nggak hancur.
function isAlignedDiagram(node: Element): string | null {
  if (node.children.some((c) => c.type === "element" && c.tagName === "img")) return null;
  const raw = node.children.map(rawText).join("").replace(/\s+$/, "");
  const lines = raw.split("\n");
  if (lines.length < 3) return null;
  return lines.some((l) => /^\s{2,}\S/.test(l) || /\S {3,}\S/.test(l)) ? raw : null;
}

function paragraphMd(node: Element, ctx: Ctx): string {
  const diagram = isAlignedDiagram(node);
  if (diagram) return `\`\`\`\n${diagram.replace(/```/g, "ˋˋˋ")}\n\`\`\``;

  const text = inline(node.children, ctx).replace(/[ \t]+\n/g, "\n").trim();
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // Bullet manual "• teks" di Word -> list item beneran.
      const manual = /^[•·▪◦]\s*/.exec(trimmed);
      if (manual) return `- ${trimmed.slice(manual[0].length)}`;
      return escapeLineStart(line);
    })
    .join("\n");
}

function listMd(list: Element, ctx: Ctx, indent: string): string {
  const lines: string[] = [];
  for (const li of list.children) {
    if (li.type !== "element" || li.tagName !== "li") continue;
    const marker = list.tagName === "ol" ? "1." : "-";
    const cont = indent + " ".repeat(marker.length + 1);

    const textParts: string[] = [];
    const nested: string[] = [];
    let phrasing: ElementContent[] = [];
    const flush = () => {
      const t = inline(phrasing, ctx).trim();
      if (t) textParts.push(t);
      phrasing = [];
    };
    for (const child of li.children) {
      if (child.type === "element" && (child.tagName === "ul" || child.tagName === "ol")) {
        flush();
        nested.push(listMd(child, ctx, cont));
      } else if (child.type === "element" && child.tagName === "p") {
        flush();
        const t = inline(child.children, ctx).trim();
        if (t) textParts.push(t);
      } else {
        phrasing.push(child);
      }
    }
    flush();

    const body = textParts.join("\n").split("\n").join(`\n${cont}`);
    lines.push(`${indent}${marker} ${body}`.trimEnd());
    lines.push(...nested.filter(Boolean));
  }
  return lines.join("\n");
}

function cellText(cell: Element, ctx: Ctx): string {
  const parts: string[] = [];
  const walk = (nodes: ElementContent[]) => {
    let phrasing: ElementContent[] = [];
    const flush = () => {
      const t = inline(phrasing, ctx).replace(/\s*\n\s*/g, " ").trim();
      if (t) parts.push(t);
      phrasing = [];
    };
    for (const n of nodes) {
      if (n.type === "element" && ["p", "li"].includes(n.tagName)) {
        flush();
        const t = inline(n.children, ctx).replace(/\s*\n\s*/g, " ").trim();
        if (t) parts.push(n.tagName === "li" ? `• ${t}` : t);
      } else if (n.type === "element" && ["ul", "ol", "div", "table", "tbody", "tr", "td"].includes(n.tagName)) {
        flush();
        walk(n.children);
      } else {
        phrasing.push(n);
      }
    }
    flush();
  };
  walk(cell.children);
  return parts.join(" ").replace(/\|/g, "\\|");
}

function tableMd(table: Element, ctx: Ctx): string {
  const rows: Element[] = [];
  const collect = (node: Element) => {
    for (const c of node.children) {
      if (c.type !== "element") continue;
      if (c.tagName === "tr") rows.push(c);
      else if (["thead", "tbody", "tfoot"].includes(c.tagName)) collect(c);
    }
  };
  collect(table);
  const cells = rows.map((r) =>
    r.children.filter((c): c is Element => c.type === "element" && (c.tagName === "td" || c.tagName === "th")),
  );
  if (cells.length === 0) return "";

  // Tabel 1x1 di Word = kotak catatan/callout -> blockquote.
  if (cells.length === 1 && cells[0].length === 1) {
    const inner = blocksMd(cells[0][0].children, ctx);
    return inner
      .split("\n")
      .map((l) => (l ? `> ${l}` : ">"))
      .join("\n");
  }

  const width = Math.max(...cells.map((r) => r.length));
  const grid = cells.map((r) => {
    const texts = r.map((c) => cellText(c, ctx) || " ");
    while (texts.length < width) texts.push(" ");
    return `| ${texts.join(" | ")} |`;
  });
  const separator = `| ${Array(width).fill("---").join(" | ")} |`;
  return [grid[0], separator, ...grid.slice(1)].join("\n");
}

function blocksMd(nodes: (RootContent | ElementContent)[], ctx: Ctx): string {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type !== "element") {
      if (node.type === "text" && node.value.trim()) out.push(escapeText(node.value.trim()));
      continue;
    }
    switch (node.tagName) {
      case "p":
        out.push(paragraphMd(node, ctx));
        break;
      case "h3":
        out.push(`### ${clean(inline(node.children, ctx))}`);
        break;
      case "h4":
      case "h5":
      case "h6":
        out.push(`#### ${clean(inline(node.children, ctx))}`);
        break;
      case "ul":
      case "ol":
        out.push(listMd(node, ctx, ""));
        break;
      case "table":
        out.push(tableMd(node, ctx));
        break;
      case "blockquote":
        out.push(
          blocksMd(node.children, ctx)
            .split("\n")
            .map((l) => (l ? `> ${l}` : ">"))
            .join("\n"),
        );
        break;
      case "img":
        out.push(imageMd(String(node.properties.src ?? ""), ctx));
        break;
      default:
        out.push(blocksMd(node.children, ctx));
    }
  }
  return out.filter((b) => b.trim()).join("\n\n");
}

// ---------------------------------------------------------------------------
// Dokumen -> section per H2

type Section = { module: string; title: string; nodes: RootContent[]; preamble: number };

async function loadDocx(supabase: SupabaseClient | null): Promise<Buffer> {
  if (existsSync(LOCAL_DOCX)) return readFileSync(LOCAL_DOCX);
  if (!supabase) throw new Error(`Docx nggak ada di ${LOCAL_DOCX} dan service key belum diisi.`);
  const { data, error } = await supabase.storage.from(BUCKET).download(DOCX_STORAGE_PATH);
  if (error || !data) throw new Error(`Gagal download docx: ${error?.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  mkdirSync(dirname(LOCAL_DOCX), { recursive: true });
  writeFileSync(LOCAL_DOCX, buf);
  return buf;
}

async function parseDocument(docx: Buffer) {
  const sourceImages: { data: Buffer; contentType: string }[] = [];
  const result = await mammoth.convertToHtml(
    { buffer: docx },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = Buffer.from(await image.readAsBase64String(), "base64");
        sourceImages.push({ data, contentType: image.contentType });
        return { src: `kbimg:${sourceImages.length - 1}` };
      }),
    },
  );
  const tree = unified().use(rehypeParse, { fragment: true }).parse(result.value) as Root;

  const sections: Section[] = [];
  const skippedH1: string[] = [];
  let chapterModule: string | null = null;
  let current: Section | null = null;
  let preamble: RootContent[] = [];

  for (const node of tree.children) {
    if (node.type === "element" && node.tagName === "h1") {
      const text = clean(textOf(node));
      chapterModule = moduleForH1(text);
      current = null;
      preamble = [];
      if (!chapterModule) skippedH1.push(text);
      continue;
    }
    if (!chapterModule) continue;
    if (node.type === "element" && node.tagName === "h2") {
      // Konten sebelum H2 pertama di bab -> ikut entri pertama bab itu.
      current = {
        module: chapterModule,
        title: clean(textOf(node)),
        nodes: preamble,
        preamble: preamble.length,
      };
      preamble = [];
      sections.push(current);
      continue;
    }
    (current ? current.nodes : preamble).push(node);
  }

  return { sections, sourceImages, skippedH1, warnings: result.messages };
}

// ---------------------------------------------------------------------------
// Entri yang ada di DB (live) atau snapshot (dry run tanpa service key)

type DbEntry = { id: string | null; module: string; title: string; img: boolean; mermaid: boolean; edited: boolean; content: string | null };

async function loadEntries(supabase: SupabaseClient | null): Promise<{ entries: DbEntry[]; source: string }> {
  if (supabase) {
    const { data, error } = await supabase.from("kb_entries").select("id, module, title, content, created_at, updated_at");
    if (error) throw new Error(`Gagal query kb_entries: ${error.message}`);
    return {
      source: "live database",
      entries: (data ?? []).map((e) => ({
        id: e.id,
        module: e.module,
        title: e.title,
        content: e.content,
        img: e.content.includes("!["),
        mermaid: e.content.includes("```mermaid"),
        edited: new Date(e.updated_at).getTime() > new Date(e.created_at).getTime() + 60_000,
      })),
    };
  }
  const [, ...rows] = readFileSync(SNAPSHOT, "utf-8").trim().split(/\r?\n/);
  return {
    source: "snapshot (data/import/entries-snapshot.tsv)",
    entries: rows.map((row) => {
      const [module, title, img, mermaid, , edited] = row.split("\t");
      return { id: null, module, title, img: img === "1", mermaid: mermaid === "1", edited: edited === "1", content: null };
    }),
  };
}

function mermaidBlocks(content: string | null): string[] {
  return content ? (content.match(/```mermaid[\s\S]*?```/g) ?? []) : [];
}

// ---------------------------------------------------------------------------

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL belum diisi di .env.local");
  if (APPLY && !serviceKey) throw new Error("--apply butuh SUPABASE_SERVICE_ROLE_KEY di .env.local");

  const supabase = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

  console.log(`Mode: ${APPLY ? "APPLY (nulis ke Storage + DB)" : "DRY RUN (nggak nulis apa pun)"}${FORCE ? " + FORCE" : ""}`);
  const docx = await loadDocx(supabase);
  const { sections, sourceImages, skippedH1, warnings } = await parseDocument(docx);
  const { entries, source } = await loadEntries(supabase);
  console.log(`Docx: ${sections.length} H2 di bab yang dipetakan, ${sourceImages.length} gambar total. Entri DB dari ${source}: ${entries.length}.`);
  console.log(`H1 di-skip (nggak ada di mapping): ${skippedH1.map((t) => `"${t}"`).join(", ")}`);
  for (const w of new Set(warnings.map((m) => m.message))) console.log(`mammoth: ${w}`);

  const byExact = new Map(entries.map((e) => [`${e.module}\u0000${e.title}`, e]));
  const byKey = new Map(entries.map((e) => [`${e.module}\u0000${titleKey(e.title)}`, e]));
  const matched = new Set<DbEntry>();
  const issues: string[] = [];
  const plans: { entry: DbEntry; section: Section; markdown: string; images: ImageJob[]; flags: string[] }[] = [];
  const slugsSeen = new Map<string, string>();

  for (const section of sections) {
    let entry = byExact.get(`${section.module}\u0000${section.title}`);
    const flags: string[] = [];
    if (!entry) {
      entry = byKey.get(`${section.module}\u0000${titleKey(section.title)}`);
      if (entry) flags.push(`judul beda tipis: DB "${entry.title}"`);
    }
    if (!entry) {
      issues.push(`H2 tanpa entri: [${section.module}] "${section.title}" — di-skip`);
      continue;
    }
    if (matched.has(entry)) {
      issues.push(`H2 duplikat ke entri yang sama: [${section.module}] "${section.title}" — di-skip`);
      continue;
    }
    matched.add(entry);

    const slug = entrySlug(entry.title);
    const slugKey = `${entry.module}/${slug}`;
    if (slugsSeen.has(slugKey)) issues.push(`Slug gambar bentrok: ${slugKey} ("${slugsSeen.get(slugKey)}" vs "${entry.title}")`);
    slugsSeen.set(slugKey, entry.title);

    const ctx: Ctx = { module: entry.module, slug, counter: 0, images: [], sourceImages, publicBase: url };
    let markdown = blocksMd(section.nodes, ctx);

    if (entry.mermaid) {
      const kept = mermaidBlocks(entry.content);
      flags.push(APPLY ? `mermaid dipertahankan (${kept.length} blok, ditaruh di akhir)` : "punya mermaid — dipertahankan di akhir");
      if (kept.length) markdown = `${markdown}\n\n${kept.join("\n\n")}`;
    }
    if (section.preamble) flags.push(`+${section.preamble} blok intro bab (sebelum H2 pertama)`);
    if (entry.edited) flags.push("pernah diedit di app");
    if (!markdown.trim()) flags.push("KONTEN KOSONG");

    if (entry.img && !FORCE) {
      issues.push(`Sudah punya gambar, di-skip (pakai --force buat timpa): [${entry.module}] "${entry.title}"`);
      continue;
    }

    plans.push({ entry, section, markdown, images: ctx.images, flags });
  }

  const mappedModules = new Set(sections.map((s) => s.module));
  for (const e of entries) {
    if (mappedModules.has(e.module) && !matched.has(e)) {
      issues.push(`Entri DB tanpa H2 di Word (nggak disentuh): [${e.module}] "${e.title}"`);
    }
  }

  // Preview markdown per entri
  for (const p of plans) {
    const file = resolve(PREVIEW_DIR, p.entry.module, `${entrySlug(p.entry.title) || "entri"}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `# ${p.entry.title}\n\n${p.markdown}\n`);
  }

  console.log("\n=== Entri yang akan di-update ===");
  let currentModule = "";
  for (const p of plans) {
    if (p.entry.module !== currentModule) {
      currentModule = p.entry.module;
      console.log(`\n[${currentModule}]`);
    }
    const flags = p.flags.length ? `  ⚑ ${p.flags.join("; ")}` : "";
    console.log(`  ${p.entry.title} — ${p.images.length} gambar, ${p.markdown.length} char${flags}`);
  }

  console.log("\n=== Warning ===");
  for (const i of issues) console.log(`  ! ${i}`);
  if (!issues.length) console.log("  (tidak ada)");

  const totalImages = plans.reduce((n, p) => n + p.images.length, 0);
  const placed = sourceImages.length;
  console.log(
    `\nRingkasan: ${plans.length} entri akan di-update, ${totalImages} gambar akan di-upload ` +
      `(dari ${placed} di dokumen; sisanya ada di bagian yang di-skip), ${issues.length} warning.`,
  );
  console.log(`Preview markdown: ${PREVIEW_DIR}`);

  if (!APPLY) return;
  if (!supabase) return;

  // Upload gambar
  let uploaded = 0;
  const failures: string[] = [];
  const jobs = plans.flatMap((p) => p.images);
  await pool(jobs, 6, async (job) => {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(job.path, job.data, { contentType: job.contentType, upsert: true, cacheControl: "31536000" });
    if (error) failures.push(`${job.path}: ${error.message}`);
    else uploaded++;
    if (uploaded % 100 === 0) console.log(`  ... ${uploaded}/${jobs.length} gambar`);
  });

  // Entri yang gambarnya gagal upload nggak di-update, biar nggak ada link mati.
  const failedPaths = new Set(failures.map((f) => f.split(":")[0]));
  let updated = 0;
  for (const p of plans) {
    if (p.images.some((img) => failedPaths.has(img.path))) {
      failures.push(`Entri di-skip karena upload gambar gagal: [${p.entry.module}] "${p.entry.title}"`);
      continue;
    }
    const { error } = await supabase
      .from("kb_entries")
      .update({ content: p.markdown, updated_at: new Date().toISOString() })
      .eq("id", p.entry.id!);
    if (error) failures.push(`UPDATE gagal [${p.entry.module}] "${p.entry.title}": ${error.message}`);
    else updated++;
  }

  console.log(`\nSelesai: ${updated} entri di-update, ${uploaded} gambar di-upload, ${issues.length + failures.length} warning/error.`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
