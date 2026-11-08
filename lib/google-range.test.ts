import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOptionalRange } from "./google/block";

test("parseOptionalRange: both empty means no calendar block", () => {
  assert.deepEqual(parseOptionalRange("", ""), { ok: true, value: null });
  assert.deepEqual(parseOptionalRange(null, undefined), { ok: true, value: null });
  assert.deepEqual(parseOptionalRange("  ", " "), { ok: true, value: null });
});

test("parseOptionalRange: a valid range becomes minutes", () => {
  assert.deepEqual(parseOptionalRange("09:30", "11:00"), { ok: true, value: { startMin: 570, endMin: 660 } });
});

test("parseOptionalRange: only one side filled is an error", () => {
  assert.equal(parseOptionalRange("09:00", "").ok, false);
  assert.equal(parseOptionalRange("", "10:00").ok, false);
});

test("parseOptionalRange: bad times and end <= start are rejected", () => {
  assert.equal(parseOptionalRange("25:00", "26:00").ok, false);
  assert.equal(parseOptionalRange("9:00", "10:00").ok, false);
  const same = parseOptionalRange("10:00", "10:00");
  assert.equal(same.ok, false);
  const reversed = parseOptionalRange("11:00", "10:00");
  assert.equal(reversed.ok && reversed.value, false);
});
