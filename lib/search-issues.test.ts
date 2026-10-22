import test from "node:test";
import assert from "node:assert/strict";
import { issueSnippet, matchIssue, rankIssues, requiredMatches, searchTerms, type SearchableIssue } from "./search/issues";

const base: SearchableIssue = {
  id: "1",
  title: "Posting Failed untuk Inventory Gain & Loss",
  client_name: "PT SHUANGFEI ELECTRIC INDONESIA",
  module: "Finance",
  category: "Configuration",
  description: "Gagal Closing inventory karna belum mapping untuk inv loss dan receipt",
  root_cause: null,
  resolution: "Mapping akun inventory loss dan receipt di Account Mapping",
};
const other: SearchableIssue = {
  id: "2",
  title: "PO exchange rate not shown",
  client_name: "Weefer Partner",
  module: "UI Template",
  category: "Interface",
  description: "PO doc not show the exc. rate field",
  root_cause: "Not designed in the UI template",
  resolution: "Display exc. rate from PO UI template",
};

test("searchTerms drops connecting words but keeps them when nothing else is left", () => {
  assert.deepEqual(searchTerms("gagal closing karena belum mapping"), ["gagal", "closing", "mapping"]);
  assert.deepEqual(searchTerms("Why is the PO rate not shown?"), ["po", "rate", "shown"]);
  assert.deepEqual(searchTerms("yang dan di"), ["yang", "dan", "di"]);
  assert.deepEqual(searchTerms("a x 报销"), ["报销"]);
});

test("one or two words must all match, longer queries need 60% (at least two)", () => {
  assert.equal(requiredMatches(1), 1);
  assert.equal(requiredMatches(2), 2);
  assert.equal(requiredMatches(3), 2);
  assert.equal(requiredMatches(5), 3);
  assert.ok(matchIssue(base, ["posting", "failed"]));
  assert.equal(matchIssue(base, ["posting", "voucher"]), null);
});

test("a long natural sentence finds the issue although some words are not in it", () => {
  // Query nyata yang tidak menemukan apa pun lewat search_keyword karena "karena" tidak ada di issue (tertulis "karna").
  const ranked = rankIssues([other, base], "gagal closing karena belum mapping");
  assert.deepEqual(ranked.map((m) => m.issue.id), ["1"]);
  assert.equal(ranked[0].matched, 3);
  assert.equal(rankIssues([other, base], "voucher tidak bisa posting kemarin").length, 0);
});

test("title and metadata matches rank above body-only matches, ties keep the given order", () => {
  const bodyOnly: SearchableIssue = { ...other, id: "3", description: "masalah posting failed di modul lain" };
  assert.deepEqual(rankIssues([bodyOnly, base], "posting failed").map((m) => m.issue.id), ["1", "3"]);
  const a = { ...other, id: "a", title: "rate x" };
  const b = { ...other, id: "b", title: "rate y" };
  assert.deepEqual(rankIssues([a, b], "rate").map((m) => m.issue.id), ["a", "b"]);
});

test("client, module and category are searchable", () => {
  assert.equal(rankIssues([base, other], "shuangfei").length, 1);
  assert.equal(rankIssues([base, other], "finance").length, 1);
  assert.equal(rankIssues([base, other], "interface").length, 1);
});

test("snippet shows client, module and the first field that contains a term", () => {
  const s = issueSnippet(base, ["mapping"]);
  assert.ok(s.startsWith("PT SHUANGFEI ELECTRIC INDONESIA · Finance — "));
  assert.ok(s.includes("Resolution: Mapping akun"));
  const t = issueSnippet(other, ["template"]);
  assert.ok(t.includes("Root cause: Not designed in the UI template"));
  assert.ok(issueSnippet({ ...other, client_name: null, module: null }, ["zzz"]).startsWith("PO doc not show"));
});
