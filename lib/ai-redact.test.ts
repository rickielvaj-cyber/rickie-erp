import test from "node:test";
import assert from "node:assert/strict";
import { describeCounts, nameVariants, redact, type KnownName } from "./ai/redact";

const names: KnownName[] = [
  { value: "PT WANXINDA INDONESIA", kind: "CLIENT" },
  { value: "PT FEIHE INDONESIA", kind: "CLIENT" },
  { value: "Project Nagiya", kind: "PROJECT" },
  { value: "Edot", kind: "CLIENT" },
];

test("nameVariants adds the name without PT/CV and sorts longest first", () => {
  const v = nameVariants([{ value: "PT Maju Jaya", kind: "CLIENT" }, { value: "CV Ab", kind: "CLIENT" }]).map((x) => x.value);
  assert.deepEqual(v, ["PT Maju Jaya", "Maju Jaya", "CV Ab"]);
});

test("known client and project names are replaced consistently and restored", () => {
  const r = redact("Meeting with PT WANXINDA INDONESIA about Project Nagiya. wanxinda indonesia agreed; Edot will join.", names);
  assert.ok(!/wanxinda|nagiya|edot/i.test(r.text), r.text);
  assert.equal((r.text.match(/\[CLIENT_1\]/g) ?? []).length, 2, "same client = same placeholder (case-insensitive, with or without PT)");
  assert.ok(r.text.includes("[PROJECT_1]") && r.text.includes("[CLIENT_2]"));
  assert.equal(r.restore("Follow up with [CLIENT_1] on [PROJECT_1]; ask [CLIENT_2]."), "Follow up with PT WANXINDA INDONESIA on Project Nagiya; ask Edot.");
  assert.equal(r.restore("[CLIENT_9] unknown stays"), "[CLIENT_9] unknown stays");
});

test("names inside other words are left alone", () => {
  const r = redact("Edoting is not Edot; Credot too.", names);
  assert.equal(r.text, "Edoting is not [CLIENT_1]; Credot too.");
});

test("emails, links and phone numbers", () => {
  const r = redact("Mail budi@wanxinda.co.id, see https://drive.google.com/file/d/abc123 or call +62 812-3456-7890 / 021 5551 2345.", names);
  assert.ok(!/budi@|drive\.google|812|5551/.test(r.text), r.text);
  assert.ok(r.text.includes("[EMAIL_1]") && r.text.includes("[URL_1]") && r.text.includes("[PHONE_1]") && r.text.includes("[PHONE_2]"));
  assert.ok(r.restore(r.text).includes("budi@wanxinda.co.id"));
});

test("amounts and big numbers are hidden but dates, years and small numbers stay", () => {
  const r = redact("Budget Rp 1.500.000.000, 25 juta lagi, USD 4,000, total 12345 rows. Due 2026-10-28 and 28/10/2026, in 2026, 3 items, 15 users.", names);
  assert.ok(!/1\.500|25 juta|4,000|12345/.test(r.text), r.text);
  assert.ok(r.text.includes("2026-10-28") && r.text.includes("28/10/2026") && r.text.includes("in 2026") && r.text.includes("3 items") && r.text.includes("15 users"), r.text);
  assert.equal(r.counts.NUM, 4);
});

test("NPWP and invoice-like codes", () => {
  const r = redact("NPWP 01.234.567.8-901.000 and invoice INV-2026-00123, PO/ABC/2026/009.", names);
  assert.ok(!/01\.234|00123|ABC\/2026/.test(r.text), r.text);
  assert.ok(r.text.includes("[ID_1]") && r.text.includes("[CODE_1]") && r.text.includes("[CODE_2]"));
});

test("plain text without sensitive parts is unchanged and counts are empty", () => {
  const text = "Discuss the cut-off for month end and send the draft on Friday.";
  const r = redact(text, names);
  assert.equal(r.text, text);
  assert.deepEqual(r.counts, {});
  assert.equal(describeCounts(r.counts), "");
});

test("describeCounts", () => {
  assert.equal(describeCounts({ CLIENT: 3, NUM: 1, CODE: 0 }), "3 client names, 1 numbers or amounts");
});
