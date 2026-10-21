import test from "node:test";
import assert from "node:assert/strict";
import { applyDrag, buildBoard, findContainer, placementChanged } from "./todo-board";

const board = () => ({ "2026-10-19": ["a", "b", "c"], "2026-10-20": ["d"], "2026-10-21": [] as string[] });

test("findContainer finds the day of a to-do and accepts a day id itself", () => {
  assert.equal(findContainer(board(), "b"), "2026-10-19");
  assert.equal(findContainer(board(), "2026-10-21"), "2026-10-21");
  assert.equal(findContainer(board(), "zzz"), undefined);
});

test("reordering inside a day moves the item to the position of the one it was dropped on", () => {
  assert.deepEqual(applyDrag(board(), "a", "c")["2026-10-19"], ["b", "c", "a"], "down");
  assert.deepEqual(applyDrag(board(), "c", "a")["2026-10-19"], ["c", "a", "b"], "up");
  assert.deepEqual(applyDrag(board(), "a", "b")["2026-10-19"], ["b", "a", "c"], "swap neighbours");
});

test("dropping on yourself or on your own day's empty area changes nothing", () => {
  const b = board();
  assert.equal(applyDrag(b, "a", "a"), b);
  assert.equal(applyDrag(b, "a", "2026-10-19"), b);
  assert.equal(applyDrag(b, "ghost", "a"), b);
});

test("moving to another day inserts at the position of the item it is over", () => {
  const out = applyDrag(board(), "b", "d");
  assert.deepEqual(out["2026-10-19"], ["a", "c"]);
  assert.deepEqual(out["2026-10-20"], ["b", "d"]);
});

test("moving onto a day card (or an empty day) appends at the bottom", () => {
  assert.deepEqual(applyDrag(board(), "a", "2026-10-20")["2026-10-20"], ["d", "a"]);
  const out = applyDrag(board(), "a", "2026-10-21");
  assert.deepEqual(out["2026-10-21"], ["a"]);
  assert.deepEqual(out["2026-10-19"], ["b", "c"]);
});

test("applyDrag never mutates its input and keeps every item exactly once", () => {
  const b = board();
  const snapshot = JSON.stringify(b);
  const out = applyDrag(applyDrag(b, "a", "d"), "c", "2026-10-21");
  assert.equal(JSON.stringify(b), snapshot);
  assert.deepEqual(Object.values(out).flat().sort(), ["a", "b", "c", "d"]);
});

test("placementChanged tells a real move or reorder from a no-op", () => {
  const b = board();
  assert.equal(placementChanged(b, applyDrag(b, "a", "c"), "a"), true);
  assert.equal(placementChanged(b, applyDrag(b, "a", "d"), "a"), true);
  assert.equal(placementChanged(b, b, "a"), false);
  assert.equal(placementChanged(b, applyDrag(b, "a", "a"), "a"), false);
});

test("buildBoard groups to-dos by day in the given order and ignores other days or undated ones", () => {
  const out = buildBoard(
    [
      { id: "x", due_date: "2026-10-19" },
      { id: "y", due_date: "2026-10-20" },
      { id: "z", due_date: "2026-10-19" },
      { id: "far", due_date: "2026-12-01" },
      { id: "none", due_date: null },
    ],
    ["2026-10-19", "2026-10-20"],
  );
  assert.deepEqual(out, { "2026-10-19": ["x", "z"], "2026-10-20": ["y"] });
});
