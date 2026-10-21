import test from "node:test";
import assert from "node:assert/strict";
import { buildKbDraft, canBecomeKbEntry, suggestKbModule } from "./issue-kb";

const issue = {
  title: "Account 122102 mismatch",
  module: "Accounts Receivable",
  category: "Configuration",
  description: "Detail pinjaman tidak sama dengan saldo auxiliary.",
  root_cause: "Auxiliary Person tidak mandatory.",
  resolution: "Set Person mandatory, reversal lalu repost.",
};

test("suggestKbModule maps clear modules and falls back to Troubleshooting", () => {
  assert.equal(suggestKbModule("Accounts Receivable"), "ar");
  assert.equal(suggestKbModule("  general ledger "), "gl");
  assert.equal(suggestKbModule("Fixed Asset"), "fixed-assets");
  assert.equal(suggestKbModule("Tax"), "troubleshooting");
  assert.equal(suggestKbModule(null), "troubleshooting");
});

test("draft has problem, cause and solution and never the client or project", () => {
  const { title, content } = buildKbDraft({ ...issue, client_name: "PT SECRET", project: "Proyek X" } as typeof issue);
  assert.equal(title, "Account 122102 mismatch");
  assert.ok(content.startsWith("**Accounts Receivable · Configuration**"));
  assert.ok(content.includes("### Masalah\nDetail pinjaman"));
  assert.ok(content.includes("### Penyebab\nAuxiliary Person"));
  assert.ok(content.includes("### Solusi\nSet Person"));
  assert.ok(!content.includes("SECRET") && !content.includes("Proyek X"));
});

test("draft skips empty sections and metadata", () => {
  const { content } = buildKbDraft({ ...issue, module: null, category: null, root_cause: "  ", resolution: "Fix it" });
  assert.ok(!content.includes("Penyebab"));
  assert.ok(!content.startsWith("**"));
  assert.ok(content.includes("### Solusi\nFix it"));
});

test("only issues with a cause or resolution can become entries", () => {
  assert.equal(canBecomeKbEntry({ root_cause: null, resolution: null }), false);
  assert.equal(canBecomeKbEntry({ root_cause: " ", resolution: "" }), false);
  assert.equal(canBecomeKbEntry({ root_cause: "x", resolution: null }), true);
});
