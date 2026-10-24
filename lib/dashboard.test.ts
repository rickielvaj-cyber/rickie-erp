import test from "node:test";
import assert from "node:assert/strict";
import { blockedMinutes, buildToday, issueAttention, runningProjects, weekOf, type DashTodo } from "./dashboard";

const t = (over: Partial<DashTodo> & { id: string }): DashTodo => ({
  title: over.id,
  priority: "medium",
  due_date: null,
  status: "todo",
  calendar_event_id: null,
  scheduled_start: null,
  scheduled_end: null,
  project_id: null,
  goal_id: null,
  ...over,
});

test("weekOf runs Monday to Sunday", () => {
  assert.deepEqual(weekOf("2026-10-24"), { start: "2026-10-19", end: "2026-10-25", nextStart: "2026-10-26" });
  assert.equal(weekOf("2026-10-19").start, "2026-10-19");
});

test("buildToday: overdue, then today, then undated; future and done are left out", () => {
  const r = buildToday(
    [
      t({ id: "future", due_date: "2026-10-30" }),
      t({ id: "undated" }),
      t({ id: "today", due_date: "2026-10-24" }),
      t({ id: "late", due_date: "2026-10-20" }),
      t({ id: "done", due_date: "2026-10-24", status: "done" }),
    ],
    "2026-10-24",
  );
  assert.deepEqual(r.items.map((x) => x.id), ["late", "today", "undated"]);
  assert.deepEqual([r.overdue, r.dueToday, r.undated], [1, 1, 1]);
  assert.equal(r.items[0].overdue, true);
  assert.equal(r.items[1].overdue, false);
});

test("buildToday puts timed blocks first by start time and shows the block time", () => {
  const r = buildToday(
    [
      t({ id: "plain", due_date: "2026-10-24" }),
      t({ id: "late", due_date: "2026-10-24", calendar_event_id: "b", scheduled_start: "2026-10-24T07:00:00.000Z", scheduled_end: "2026-10-24T08:00:00.000Z" }),
      t({ id: "early", due_date: "2026-10-24", calendar_event_id: "a", scheduled_start: "2026-10-24T02:00:00.000Z", scheduled_end: "2026-10-24T03:30:00.000Z" }),
    ],
    "2026-10-24",
  );
  assert.deepEqual(r.items.map((x) => x.id), ["early", "late", "plain"]);
  assert.equal(r.items[0].time, "09:00–10:30");
  assert.equal(r.items[2].time, null);
});

test("blockedMinutes adds valid blocks only", () => {
  assert.equal(
    blockedMinutes([
      { scheduled_start: "2026-10-20T02:00:00.000Z", scheduled_end: "2026-10-20T03:30:00.000Z" },
      { scheduled_start: "2026-10-21T02:00:00.000Z", scheduled_end: "2026-10-21T02:30:00.000Z" },
      { scheduled_start: null, scheduled_end: null },
      { scheduled_start: "2026-10-22T05:00:00.000Z", scheduled_end: "2026-10-22T04:00:00.000Z" },
    ]),
    120,
  );
});

test("issueAttention counts missing sheet marks and entries that could go to the KB", () => {
  const base = { copied_to_sheet_at: null, kb_entry_id: null, root_cause: null, resolution: null };
  const r = issueAttention([
    { ...base, resolution: "fix" },
    { ...base, copied_to_sheet_at: "2026-10-20T00:00:00Z", root_cause: "x" },
    { ...base, copied_to_sheet_at: "2026-10-20T00:00:00Z", kb_entry_id: "e", resolution: "fix" },
    { ...base, copied_to_sheet_at: "2026-10-20T00:00:00Z" },
  ]);
  assert.deepEqual(r, { notInSheet: 1, canAddToKb: 2 });
});

test("runningProjects skips planning/done, shows the current phase and flags overdue targets first", () => {
  const phases = [
    { id: "a1", project_id: "a", name: "Blueprint", status: "done" as const, position: 0, created_at: "1" },
    { id: "a2", project_id: "a", name: "Configuration", status: "in_progress" as const, position: 1, created_at: "2" },
    { id: "b1", project_id: "b", name: "UAT", status: "not_started" as const, position: 0, created_at: "1" },
  ];
  const projects = [
    { id: "a", name: "Nagiya", client_id: "c1", status: "active" as const, target_date: "2026-11-27" },
    { id: "b", name: "Rollout", client_id: "c2", status: "on_hold" as const, target_date: "2026-10-01" },
    { id: "c", name: "Idea", client_id: "c1", status: "planning" as const, target_date: null },
    { id: "d", name: "Old", client_id: "c1", status: "done" as const, target_date: null },
  ];
  const r = runningProjects(projects, phases, new Map([["c1", "PT A"], ["c2", "PT B"]]), "2026-10-24");
  assert.deepEqual(r.map((p) => p.name), ["Rollout", "Nagiya"]);
  assert.equal(r[0].overdue, true);
  assert.equal(r[1].currentPhase, "Configuration");
  assert.deepEqual([r[1].done, r[1].total, r[1].percent], [1, 2, 50]);
  assert.equal(r[1].clientName, "PT A");
});
