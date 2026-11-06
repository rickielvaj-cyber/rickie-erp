import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDateTimeWIB } from "./date";

test("formatDateTimeWIB shows WIB, not UTC", () => {
  assert.equal(formatDateTimeWIB("2026-11-05T10:05:00Z"), "5 Nov 2026, 17:05");
});

test("formatDateTimeWIB rolls the date forward after 17:00 UTC (the old slice(0, 10) showed yesterday)", () => {
  assert.equal(formatDateTimeWIB("2026-11-05T18:30:00+00:00"), "6 Nov 2026, 01:30");
  assert.equal(formatDateTimeWIB("2026-11-05T16:59:00Z"), "5 Nov 2026, 23:59");
});

test("formatDateTimeWIB handles Postgres timestamptz with microseconds and empty or invalid input", () => {
  assert.equal(formatDateTimeWIB("2026-10-07T03:53:22.737846+00:00"), "7 Oct 2026, 10:53");
  assert.equal(formatDateTimeWIB(null), "-");
  assert.equal(formatDateTimeWIB("not a date"), "-");
});

test("formatDateTimeWIB writes September as Sep", () => {
  assert.equal(formatDateTimeWIB("2026-09-15T05:00:00Z"), "15 Sep 2026, 12:00");
});
