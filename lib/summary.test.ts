import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanText, buildSummaryText } from "./summary";

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
