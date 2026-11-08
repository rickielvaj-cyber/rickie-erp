import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_WORK_HOURS, parseWorkHours, shadedRanges, weekdayIndex, workHoursFromInputs } from "./google/work-hours";

test("weekdayIndex: Monday is 0 and Sunday is 6", () => {
  assert.equal(weekdayIndex("2026-11-09"), 0); // Monday
  assert.equal(weekdayIndex("2026-11-13"), 4); // Friday
  assert.equal(weekdayIndex("2026-11-15"), 6); // Sunday
});

test("shadedRanges: outside work hours on work days, the whole day otherwise, nothing when disabled", () => {
  const wh = DEFAULT_WORK_HOURS; // 09:00-17:00 Mon-Fri
  assert.deepEqual(shadedRanges("2026-11-10", wh), [{ from: 0, to: 540 }, { from: 1020, to: 1440 }]);
  assert.deepEqual(shadedRanges("2026-11-14", wh), [{ from: 0, to: 1440 }], "Saturday is not a work day");
  assert.deepEqual(shadedRanges("2026-11-10", { ...wh, enabled: false }), []);
  assert.deepEqual(shadedRanges("2026-11-10", { ...wh, startMin: 0, endMin: 1440 }), [], "a 24h work day shades nothing");
});

test("parseWorkHours falls back to the default for missing or broken values", () => {
  assert.deepEqual(parseWorkHours(null), DEFAULT_WORK_HOURS);
  assert.deepEqual(parseWorkHours("not json"), DEFAULT_WORK_HOURS);
  assert.deepEqual(parseWorkHours(JSON.stringify({ startMin: 600, endMin: 500 })), DEFAULT_WORK_HOURS, "end before start");
  assert.deepEqual(parseWorkHours(JSON.stringify({ enabled: true, startMin: 480, endMin: 960, days: [0, 2, 2, 9, "x"] })), { enabled: true, startMin: 480, endMin: 960, days: [0, 2] });
  assert.equal(parseWorkHours(JSON.stringify({ enabled: false, startMin: 480, endMin: 960, days: [] })).enabled, false);
});

test("workHoursFromInputs validates the two times", () => {
  assert.deepEqual(workHoursFromInputs("08:00", "16:30", [4, 0, 0], true), { enabled: true, startMin: 480, endMin: 990, days: [0, 4] });
  assert.equal(workHoursFromInputs("17:00", "09:00", [0], true), null);
  assert.equal(workHoursFromInputs("", "09:00", [0], true), null);
});
