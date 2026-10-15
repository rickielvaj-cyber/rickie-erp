import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExcerpt,
  contentHash,
  EXCERPT_MAX_CHARS,
  groupHits,
  mergeRanked,
  pickSemantic,
  normalizeQuery,
  plainText,
  snippetOf,
  truncate,
  vectorLiteral,
} from "./search/text";

test("plainText strips markdown, images, code blocks and html but keeps link text", () => {
  const md = "## Judul\n\nIsi **tebal** dengan [tautan](http://x.y) dan ![gambar](a.png).\n\n```mermaid\ngraph TD\n```\n\n- butir <b>satu</b>\n| a | b |";
  const out = plainText(md);
  assert.ok(out.includes("Judul Isi tebal dengan tautan dan"));
  assert.ok(!out.includes("http"));
  assert.ok(!out.includes("a.png"));
  assert.ok(!out.includes("mermaid"));
  assert.ok(!out.includes("<b>"));
  assert.ok(out.includes("butir satu"));
  assert.ok(!out.includes("\n"));
});

test("truncate cuts on a word boundary and marks the cut", () => {
  assert.equal(truncate("short", 20), "short");
  const out = truncate("satu dua tiga empat lima enam", 17);
  assert.equal(out, "satu dua tiga…");
  assert.ok(truncate("x".repeat(100), 10).length <= 11);
});

test("buildExcerpt starts with the title and never exceeds the limit", () => {
  const long = "kata ".repeat(2000);
  const out = buildExcerpt("Judul", long);
  assert.ok(out.startsWith("Judul. kata"));
  assert.ok(out.length <= EXCERPT_MAX_CHARS + 1);
  assert.equal(buildExcerpt("Hanya judul", ""), "Hanya judul");
});

test("contentHash changes with title, excerpt or url, and is stable otherwise", () => {
  const base = { title: "T", excerpt: "T. isi", urlPath: "/a" };
  assert.equal(contentHash(base), contentHash({ ...base }));
  assert.notEqual(contentHash(base), contentHash({ ...base, title: "T2" }));
  assert.notEqual(contentHash(base), contentHash({ ...base, excerpt: "T. isi lain" }));
  assert.notEqual(contentHash(base), contentHash({ ...base, urlPath: "/b" }));
  assert.match(contentHash(base), /^[0-9a-f]{64}$/);
});

test("normalizeQuery collapses spaces, caps length and rejects very short input", () => {
  assert.equal(normalizeQuery("  voucher   gagal  posting "), "voucher gagal posting");
  assert.equal(normalizeQuery("a"), null);
  assert.equal(normalizeQuery("   "), null);
  assert.equal(normalizeQuery(null), null);
  assert.equal(normalizeQuery("x".repeat(500))?.length, 200);
});

test("vectorLiteral and snippetOf", () => {
  assert.equal(vectorLiteral([0.1, -2, 3]), "[0.1,-2,3]");
  assert.equal(snippetOf("Judul", "Judul. isi singkat"), "isi singkat");
  assert.equal(snippetOf("Lain", "Judul. isi"), "Judul. isi");
});

const row = (id: string, type = "kb_entry") => ({
  id,
  source_type: type,
  title: `Title ${id}`,
  content_excerpt: `Title ${id}. body ${id}`,
  url_path: `/p/${id}`,
});

test("mergeRanked puts results found by both searches first, de-duplicates and labels the match", () => {
  const out = mergeRanked([row("a"), row("b"), row("c")], [row("c"), row("d")]);
  assert.deepEqual(
    out.map((r) => r.id),
    ["c", "a", "b", "d"],
  );
  assert.equal(out.find((r) => r.id === "c")?.match, "both");
  assert.equal(out.find((r) => r.id === "a")?.match, "semantic");
  assert.equal(out.find((r) => r.id === "d")?.match, "keyword");
  assert.equal(new Set(out.map((r) => r.id)).size, out.length);
  assert.equal(out[0].snippet, "body c");
});

test("mergeRanked handles empty sides and respects the limit", () => {
  assert.deepEqual(mergeRanked([], []), []);
  assert.equal(mergeRanked([row("a")], []).length, 1);
  const many = Array.from({ length: 40 }, (_, i) => row(String(i)));
  assert.equal(mergeRanked(many, [], 30).length, 30);
});

// `adjusted` = kemiripan setelah hub dikurangkan; di sini hub dianggap 0, jadi adjusted = similarity.
const sem = (id: string, similarity: number, mean = 0.73, sd = 0.04, type = "kb_entry") => ({
  ...row(id, type),
  similarity,
  adjusted: similarity,
  mean_adj: mean,
  sd_adj: sd,
});

test("pickSemantic keeps only results that stand out from the whole index (z-score), not by absolute score", () => {
  // Everything in this index scores ~0.73 against everything: an absolute floor like 0.25 would keep all of it.
  const rows = [sem("a", 0.9), sem("b", 0.82), sem("c", 0.78), sem("d", 0.73), sem("e", 0.70)];
  const kept = pickSemantic(rows, 3.5);
  assert.deepEqual(kept.map((r) => r.id), ["a"], "only the outlier (z = 4.25) survives; 0.82 is z = 2.25");
  assert.ok(Math.abs(kept[0].z - 4.25) < 1e-9);
  assert.deepEqual(pickSemantic(rows, 2).map((r) => r.id), ["a", "b"]);
});

test("pickSemantic returns nothing when there is no usable spread (empty index, one row, identical scores)", () => {
  assert.deepEqual(pickSemantic([]), []);
  assert.deepEqual(pickSemantic([{ ...sem("a", 0.9), sd_adj: null }]), []);
  assert.deepEqual(pickSemantic([sem("a", 0.9, 0.9, 0)]), []);
});

test("a gibberish-like query (all scores within noise) yields no semantic hits", () => {
  const noise = Array.from({ length: 15 }, (_, i) => sem(String(i), 0.74 + i * 0.001));
  assert.deepEqual(pickSemantic(noise), []);
});

test("mergeRanked carries similarity and z only in debug mode, for semantic hits", () => {
  const semantic = pickSemantic([sem("a", 0.95)]);
  const plain = mergeRanked(semantic, [row("k")]);
  assert.ok(plain.every((h) => h.debug === undefined));
  const dbg = mergeRanked(semantic, [row("k")], 30, { debug: true });
  assert.equal(dbg.find((h) => h.id === "a")?.debug?.similarity, 0.95);
  assert.equal(dbg.find((h) => h.id === "k")?.debug, undefined, "keyword-only hits have no similarity");
});

test("groupHits orders groups by their best hit: a client name puts Clients first, a topic puts Knowledge Base first", () => {
  const hits = mergeRanked([], [row("1", "client"), row("2", "kb_entry"), row("3", "client"), row("4", "project")]);
  assert.deepEqual(groupHits(hits).map((g) => g.type), ["client", "kb_entry", "project"]);
  assert.deepEqual(groupHits(hits)[0].hits.map((h) => h.id), ["1", "3"]);
  const topic = mergeRanked([], [row("1", "kb_entry"), row("2", "client")]);
  assert.deepEqual(groupHits(topic).map((g) => g.type), ["kb_entry", "client"]);
  assert.deepEqual(groupHits([]), []);
});

test("a title that equals the query ranks first even if another hit appears in both searches", () => {
  const project = { ...row("p", "project"), title: "PT X — Project Nagiya", content_excerpt: "PT X — Project Nagiya. Partners: Edot." };
  const client = { ...row("c", "client"), title: "Edot", content_excerpt: "Edot. Partner." };
  const withoutQuery = mergeRanked([project], [project, client]);
  assert.equal(withoutQuery[0].id, "p", "baseline: the hit found by both searches wins on RRF alone");
  const withQuery = mergeRanked([project], [project, client], 30, { query: "  edot " });
  assert.deepEqual(withQuery.map((h) => h.id), ["c", "p"], "exact title match comes first (case/space-insensitive)");
  assert.deepEqual(groupHits(withQuery).map((g) => g.type), ["client", "project"]);
});
