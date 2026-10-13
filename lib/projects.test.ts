import assert from "node:assert/strict";
import { test } from "node:test";
import { currentPhase, isOverdue, isPhaseStatus, isProjectStatus, phaseProgress, sortPhases } from "./projects";

const phase = (id: string, status: "not_started" | "in_progress" | "done", position: number, created = "2026-10-01") => ({
  id,
  status,
  position,
  created_at: created,
});

test("progress counts done phases; empty project is 0%, not NaN", () => {
  assert.deepEqual(phaseProgress([]), { done: 0, total: 0, percent: 0 });
  assert.deepEqual(phaseProgress([phase("a", "done", 0), phase("b", "in_progress", 1), phase("c", "not_started", 2)]), {
    done: 1,
    total: 3,
    percent: 33,
  });
  assert.equal(phaseProgress([phase("a", "done", 0), phase("b", "done", 1)]).percent, 100);
});

test("phases sort by position, then created_at, then id", () => {
  const sorted = sortPhases([
    phase("c", "not_started", 2),
    phase("b2", "not_started", 1, "2026-10-03"),
    phase("b1", "not_started", 1, "2026-10-02"),
    phase("a", "not_started", 0),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["a", "b1", "b2", "c"]);
});

test("current phase: first in-progress, else first not-started, else null", () => {
  const list = [phase("blueprint", "done", 0), phase("config", "in_progress", 1), phase("uat", "not_started", 2)];
  assert.equal(currentPhase(list)?.id, "config");
  assert.equal(currentPhase([phase("a", "done", 0), phase("b", "not_started", 1), phase("c", "not_started", 2)])?.id, "b");
  assert.equal(currentPhase([phase("a", "done", 0), phase("b", "done", 1)]), null);
  assert.equal(currentPhase([]), null);
  // position decides "first", not the order of the array
  assert.equal(currentPhase([phase("late", "in_progress", 5), phase("early", "in_progress", 1)])?.id, "early");
});

test("overdue only when the target date has passed and the item is not done", () => {
  assert.equal(isOverdue("2026-10-11", "2026-10-12", false), true);
  assert.equal(isOverdue("2026-10-12", "2026-10-12", false), false); // due today is not overdue
  assert.equal(isOverdue("2026-10-11", "2026-10-12", true), false);
  assert.equal(isOverdue(null, "2026-10-12", false), false);
});

test("status guards reject unknown values", () => {
  assert.equal(isProjectStatus("on_hold"), true);
  assert.equal(isProjectStatus("ngawur"), false);
  assert.equal(isPhaseStatus("in_progress"), true);
  assert.equal(isPhaseStatus("active"), false);
});
