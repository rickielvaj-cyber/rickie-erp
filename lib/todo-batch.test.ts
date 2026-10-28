import test from "node:test";
import assert from "node:assert/strict";
import { BATCH_MAX, parseBatchInput, patchForLinked } from "./todo-batch";
import { groupByProject, startsOpen } from "./todo-groups";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("batch input needs ids and at least one change", () => {
  assert.ok(!parseBatchInput({ ids: [] , dueDate: "2026-10-30" }).ok);
  assert.ok(!parseBatchInput({ ids: [id(1)] }).ok);
  assert.ok(!parseBatchInput({ ids: [id(1)], priority: "", status: "", dueDate: "" }).ok);
  assert.ok(!parseBatchInput(null).ok);
  assert.ok(!parseBatchInput({ ids: ["nope"], priority: "low" }).ok);
  assert.ok(!parseBatchInput({ ids: Array.from({ length: BATCH_MAX + 1 }, (_, i) => id(i)), priority: "low" }).ok);
});

test("batch input maps empty to no change and none to clear", () => {
  const r = parseBatchInput({ ids: [id(1), id(1), id(2)], dueDate: "2026-10-30", priority: "high", status: "in_progress", goal: "none" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.ids, [id(1), id(2)]);
    assert.deepEqual(r.patch, { due_date: "2026-10-30", priority: "high", status: "in_progress", goal_id: null });
  }
  const clear = parseBatchInput({ ids: [id(1)], dueDate: "none" });
  assert.ok(clear.ok && clear.patch.due_date === null && !("priority" in clear.patch));
  assert.ok(!parseBatchInput({ ids: [id(1)], dueDate: "2026-02-31" }).ok);
  assert.ok(!parseBatchInput({ ids: [id(1)], priority: "urgent" }).ok);
  assert.ok(!parseBatchInput({ ids: [id(1)], status: "later" }).ok);
  assert.ok(!parseBatchInput({ ids: [id(1)], goal: "abc" }).ok);
});

test("changing the project resets the phase unless a phase is chosen; no project change leaves phases alone", () => {
  const withPhase = parseBatchInput({ ids: [id(1)], project: id(5), phase: id(6) });
  assert.ok(withPhase.ok && withPhase.patch.project_id === id(5) && withPhase.patch.phase_id === id(6));
  const noPhase = parseBatchInput({ ids: [id(1)], project: id(5) });
  assert.ok(noPhase.ok && noPhase.patch.phase_id === null);
  const none = parseBatchInput({ ids: [id(1)], project: "none", phase: id(6) });
  assert.ok(none.ok && none.patch.project_id === null && none.patch.phase_id === null);
  const phaseOnly = parseBatchInput({ ids: [id(1)], phase: id(6), priority: "low" });
  assert.ok(phaseOnly.ok && !("phase_id" in phaseOnly.patch) && !("project_id" in phaseOnly.patch));
});

test("linked to-dos keep their date: patchForLinked drops due_date and may be empty", () => {
  assert.deepEqual(patchForLinked({ due_date: "2026-10-30", priority: "low" }), { priority: "low" });
  assert.equal(patchForLinked({ due_date: null }), null);
});

test("groupByProject: loose first-class list, projects alphabetical, phases in phase order, no-phase last", () => {
  const todos = [
    { id: "a", project_id: null, phase_id: null },
    { id: "b", project_id: "p2", phase_id: "ph3" },
    { id: "c", project_id: "p1", phase_id: "ph2" },
    { id: "d", project_id: "p1", phase_id: "ph1" },
    { id: "e", project_id: "p1", phase_id: null },
    { id: "f", project_id: "p1", phase_id: "ph1" },
    { id: "g", project_id: "gone", phase_id: null },
  ];
  const meta = {
    projects: new Map([["p1", "PT B — Rollout"], ["p2", "PT A — Nagiya"]]),
    phases: new Map([["ph1", { name: "Blueprint", order: 0 }], ["ph2", { name: "UAT", order: 3 }], ["ph3", { name: "Config", order: 1 }]]),
  };
  const g = groupByProject(todos, meta);
  assert.deepEqual(g.loose.map((t) => t.id), ["a", "g"]);
  assert.deepEqual(g.projects.map((p) => [p.label, p.count]), [["PT A — Nagiya", 1], ["PT B — Rollout", 4]]);
  const rollout = g.projects[1];
  assert.deepEqual(rollout.phases.map((p) => [p.name, p.todos.map((t) => t.id)]), [["Blueprint", ["d", "f"]], ["UAT", ["c"]], [null, ["e"]]]);
});

test("groups with many to-dos start collapsed", () => {
  assert.equal(startsOpen(1), true);
  assert.equal(startsOpen(3), true);
  assert.equal(startsOpen(4), false);
});
