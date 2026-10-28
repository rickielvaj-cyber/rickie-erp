import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanText, buildSummaryText, formatDuration } from "./summary";

const base = { weekStart: "2026-10-12", weekEnd: "2026-10-16", issues: [] };

test("summary groups tasks by project first, then goal, then Other", () => {
  const text = buildSummaryText({
    ...base,
    done: [
      { title: "Cek file UAT", goalTitle: "Learn YonSuite", projectTitle: "PT WXD — UAT", phaseTitle: "UAT" },
      { title: "Migrasi data", goalTitle: null, projectTitle: "PT WXD — Nagiya", phaseTitle: "Data migration" },
      { title: "Baca modul AR", goalTitle: "Learn YonSuite" },
      { title: "Beres-beres", goalTitle: null },
    ],
  });
  const lines = text.split("\n");
  const idx = (needle: string) => lines.findIndex((l) => l.includes(needle));
  assert.ok(idx("Project: PT WXD — Nagiya") < idx("Project: PT WXD — UAT"));
  assert.ok(idx("Project: PT WXD — UAT") < idx("Goal: Learn YonSuite"));
  assert.ok(idx("Goal: Learn YonSuite") < idx("Other:"));
  assert.ok(text.includes("- Migrasi data [Data migration]"));
  assert.ok(text.includes("- Baca modul AR"));
  assert.ok(!text.includes("Baca modul AR ["));
});

test("summary lists status of running projects, omitted when there are none", () => {
  const without = buildSummaryText({ ...base, done: [] });
  assert.ok(!without.includes("Project status"));
  const text = buildSummaryText({
    ...base,
    done: [],
    projects: [
      { name: "Nagiya", clientName: "PT WXD", currentPhase: "Configuration", phasesDone: 1, phasesTotal: 6, targetDate: "2026-11-27" },
      { name: "Empty", clientName: null, currentPhase: null, phasesDone: 0, phasesTotal: 0, targetDate: null },
    ],
  });
  assert.ok(text.includes("Project status (2)"));
  assert.ok(text.includes("- Nagiya (PT WXD): now Configuration, 1 of 6 phases done, target"));
  assert.ok(text.includes("- Empty\n") || text.endsWith("- Empty"));
});

test("plan groups by project and keeps phase and due date", () => {
  const text = buildPlanText({
    nextStart: "2026-10-19",
    nextEnd: "2026-10-23",
    tasks: [{ title: "Training key user", dueDate: "2026-10-20", goalTitle: null, projectTitle: "PT WXD — Nagiya", phaseTitle: "Training" }],
  });
  assert.ok(text.includes("Project: PT WXD — Nagiya"));
  assert.ok(text.includes("- Training key user [Training] (due "));
});

test("formatDuration renders hours and minutes", () => {
  assert.equal(formatDuration(45), "45 m");
  assert.equal(formatDuration(120), "2 h");
  assert.equal(formatDuration(390), "6 h 30 m");
  assert.equal(formatDuration(0), "0 m");
});

test("summary totals time blocked per project, goal and other, most hours first within a kind", () => {
  const text = buildSummaryText({
    ...base,
    done: [],
    timeBlocks: [
      { minutes: 60, goalTitle: null, projectTitle: "PT WXD — Nagiya" },
      { minutes: 90, goalTitle: null, projectTitle: "PT WXD — Nagiya" },
      { minutes: 120, goalTitle: null, projectTitle: "PT ABC — Rollout" },
      { minutes: 45, goalTitle: "Learn YonSuite" },
      { minutes: 30, goalTitle: null },
    ],
  });
  const lines = text.split("\n");
  assert.ok(lines.includes("Time blocked (5 h 45 m)"));
  const at = (l: string) => lines.indexOf(l);
  assert.ok(at("- Project: PT WXD — Nagiya: 2 h 30 m") < at("- Project: PT ABC — Rollout: 2 h"));
  assert.ok(at("- Project: PT ABC — Rollout: 2 h") < at("- Goal: Learn YonSuite: 45 m"));
  assert.ok(at("- Goal: Learn YonSuite: 45 m") < at("- Other: 30 m"));
});

test("time blocked is hidden when the calendar is not used or has no blocks", () => {
  assert.ok(!buildSummaryText({ ...base, done: [] }).includes("Time blocked"));
  assert.ok(!buildSummaryText({ ...base, done: [], timeBlocks: [] }).includes("Time blocked"));
});

test("unlinked calendar events are listed only when passed in, and count toward the total", () => {
  const text = buildSummaryText({
    ...base,
    done: [],
    timeBlocks: [{ minutes: 60, goalTitle: null }],
    otherEvents: [{ date: "2026-10-13", time: "09:00–09:30", title: "Standup", minutes: 30 }],
  });
  assert.ok(text.includes("Time blocked (1 h 30 m)"));
  assert.ok(text.includes("Other calendar events (30 m)"));
  assert.ok(text.includes("- 13 Oct 2026 09:00–09:30 · Standup"), text);
  const only = buildSummaryText({
    ...base,
    done: [],
    timeBlocks: [],
    otherEvents: [{ date: "2026-10-13", time: "09:00–09:30", title: "Standup", minutes: 30 }],
  });
  assert.ok(only.includes("Time blocked (30 m)"));
});

test("plan shows the block time of linked to-dos next to the due date", () => {
  const text = buildPlanText({
    nextStart: "2026-10-19",
    nextEnd: "2026-10-23",
    tasks: [{ title: "Workshop", dueDate: "2026-10-22", time: "13:00–14:30", goalTitle: null }],
  });
  assert.ok(text.includes("- Workshop (due 22 Oct 2026 13:00–14:30)"), text);
});

// ---- rekap bulanan ----
import { buildMonthlyText, monthTitle } from "./summary";

test("monthTitle", () => {
  assert.equal(monthTitle("2026-10"), "October 2026");
  assert.equal(monthTitle("2027-01"), "January 2027");
});

test("monthly recap counts tasks per project/goal/other and issues per client, module and category", () => {
  const text = buildMonthlyText({
    month: "2026-10",
    done: [
      { title: "a", goalTitle: null, projectTitle: "PT X — Nagiya" },
      { title: "b", goalTitle: null, projectTitle: "PT X — Nagiya" },
      { title: "c", goalTitle: "Learn YonSuite" },
      { title: "d", goalTitle: null },
    ],
    issues: [
      { client: "PT A", module: "General Ledger", title: "1", category: "Configuration" },
      { client: "PT A", module: "Accounts Payable", title: "2", category: "Configuration" },
      { client: "PT B", module: "General Ledger", title: "3", category: "Report" },
      { client: null, module: null, title: "4" },
    ],
    timeBlocks: [
      { minutes: 90, goalTitle: null, projectTitle: "PT X — Nagiya" },
      { minutes: 30, goalTitle: "Learn YonSuite" },
    ],
  });
  const lines = text.split("\n");
  assert.equal(lines[0], "Monthly Summary (October 2026)");
  assert.ok(lines.includes("Tasks completed (4)"));
  assert.ok(lines.includes("- Project: PT X — Nagiya: 2"));
  assert.ok(lines.includes("- Goal: Learn YonSuite: 1"));
  assert.ok(lines.includes("- Other: 1"));
  assert.ok(lines.includes("Issues handled (4)"));
  assert.ok(lines.includes("- PT A: 2") && lines.includes("- No client: 1"));
  assert.ok(lines.indexOf("- PT A: 2") < lines.indexOf("- No client: 1"));
  assert.ok(lines.includes("- General Ledger: 2") && lines.includes("- No module: 1"));
  assert.ok(lines.includes("By category:") && lines.includes("- Configuration: 2") && lines.includes("- No category: 1"));
  assert.ok(lines.includes("Time blocked (2 h)"));
  assert.ok(lines.includes("- Project: PT X — Nagiya: 1 h 30 m") && lines.includes("- Goal: Learn YonSuite: 30 m"));
  assert.ok(!text.includes("a\n") && !text.includes("- b"), "task titles are not listed in the monthly recap");
});

test("monthly recap handles an empty month and hides empty sections", () => {
  const text = buildMonthlyText({ month: "2026-11", done: [], issues: [] });
  assert.ok(text.includes("- No completed tasks recorded.") && text.includes("- None."));
  assert.ok(!text.includes("Time blocked") && !text.includes("By category") && !text.includes("Project status"));
});
