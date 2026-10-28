import test from "node:test";
import assert from "node:assert/strict";
import { groupByMonth, parseSaveInput, statsFromSummaryText, SUMMARY_MAX_CHARS } from "./summary-history";

test("parseSaveInput accepts a Monday with text and rejects everything else", () => {
  const ok = parseSaveInput({ weekStart: "2026-10-26", summary: "S\r\nx", plan: "P" });
  assert.ok(ok.ok && ok.value.summary === "S\nx" && ok.value.plan === "P");
  assert.ok(!parseSaveInput({ weekStart: "2026-10-27", summary: "S", plan: "P" }).ok, "Tuesday");
  assert.ok(!parseSaveInput({ weekStart: "2026-02-31", summary: "S", plan: "P" }).ok, "invalid date");
  assert.ok(!parseSaveInput({ weekStart: "2026-10-26", summary: "  ", plan: "P" }).ok, "empty summary");
  assert.ok(!parseSaveInput({ weekStart: "2026-10-26", summary: "S" }).ok, "missing plan");
  assert.ok(!parseSaveInput({ weekStart: "2026-10-26", summary: "x".repeat(SUMMARY_MAX_CHARS + 1), plan: "" }).ok, "too long");
  assert.ok(parseSaveInput({ weekStart: "2026-10-26", summary: "S", plan: "" }).ok, "empty plan is fine");
  assert.ok(!parseSaveInput(null).ok);
});

test("statsFromSummaryText reads the section titles", () => {
  const text = "Summary of This Week (…)\n\nTasks completed (12)\nProject: X\n- a\n\nIssues handled (3)\n\nTime blocked (6 h 30 m)\n- Project: X: 6 h 30 m";
  assert.deepEqual(statsFromSummaryText(text), { tasks: 12, issues: 3, blocked: "6 h 30 m" });
  assert.deepEqual(statsFromSummaryText("edited by hand"), { tasks: null, issues: null, blocked: null });
});

test("groupByMonth uses the Friday of the week and lists the newest first", () => {
  const rows = [
    { week_start: "2026-09-28" }, // Mon 28 Sep .. Fri 2 Oct -> October
    { week_start: "2026-10-05" },
    { week_start: "2026-10-26" }, // Fri 30 Oct -> October
    { week_start: "2026-09-21" }, // Fri 25 Sep -> September
  ];
  const g = groupByMonth(rows);
  assert.deepEqual(g.map((x) => x.month), ["2026-10", "2026-09"]);
  assert.deepEqual(g[0].rows.map((r) => r.week_start), ["2026-10-26", "2026-10-05", "2026-09-28"]);
  assert.deepEqual(g[1].rows.map((r) => r.week_start), ["2026-09-21"]);
});
