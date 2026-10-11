import assert from "node:assert/strict";
import { test } from "node:test";
import { sheetCell, sheetSegmentDG, sheetSegmentKL, toTsvRow } from "./sheet";
import { defaultIssueTitle } from "./issues";

const issue = {
  client_name: "PT FEIHE INDONESIA",
  module: "Accounts Receivable",
  category: "Configuration",
  description: "Mismatch on account 122102",
  root_cause: "Person auxiliary not mandatory",
  resolution: "Set mandatory; reverse and repost",
};

test("D–G segment has 4 tab-separated cells in sheet order", () => {
  assert.equal(
    sheetSegmentDG(issue),
    "PT FEIHE INDONESIA\tAccounts Receivable\tConfiguration\tMismatch on account 122102",
  );
});

test("K–L segment has 2 cells", () => {
  assert.equal(sheetSegmentKL(issue), "Person auxiliary not mandatory\tSet mandatory; reverse and repost");
});

test("canonical client name overrides the stored text", () => {
  assert.ok(sheetSegmentDG(issue, "PT SLNC").startsWith("PT SLNC\t"));
});

test("empty / null fields become empty cells but keep the column count", () => {
  const row = sheetSegmentKL({ ...issue, root_cause: null, resolution: "  " });
  assert.equal(row, "\t");
  assert.equal(row.split("\t").length, 2);
});

test("multi-line text stays one quoted cell with CRLF normalised", () => {
  assert.equal(sheetCell("Line 1\r\nLine 2"), '"Line 1\nLine 2"');
  assert.equal(toTsvRow(["a", "b\nc"]).split("\t").length, 2);
});

test("quotes are doubled and tabs force quoting", () => {
  assert.equal(sheetCell('Set "Person" mandatory'), '"Set ""Person"" mandatory"');
  assert.equal(sheetCell("a\tb"), '"a\tb"');
});

test("formula-looking text is neutralised, ordinary text is not", () => {
  assert.equal(sheetCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(sheetCell("+62 812"), "'+62 812");
  assert.equal(sheetCell("-5 variance"), "'-5 variance");
  assert.equal(sheetCell("- check voucher"), "- check voucher");
  assert.equal(sheetCell("-Show the capability"), "-Show the capability");
  assert.equal(sheetCell("PT SLNC"), "PT SLNC");
});

test("default title: first non-empty line, collapsed spaces, capped at 80 chars", () => {
  assert.equal(defaultIssueTitle("\n  Posting   failed\nsecond line"), "Posting failed");
  const long = "x".repeat(120);
  const title = defaultIssueTitle(long);
  assert.equal(title.length, 80);
  assert.ok(title.endsWith("…"));
});
