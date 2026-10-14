import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExcerpt,
  contentHash,
  EXCERPT_MAX_CHARS,
  mergeRanked,
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
