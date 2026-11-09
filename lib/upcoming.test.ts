import assert from "node:assert/strict";
import { test } from "node:test";
import { daysBetween, groupUpcoming, relativeDay } from "./upcoming";

test("daysBetween counts calendar days across months and years", () => {
  assert.equal(daysBetween("2026-11-09", "2026-11-10"), 1);
  assert.equal(daysBetween("2026-11-30", "2026-12-02"), 2);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-11-09", "2026-11-09"), 0);
  assert.equal(daysBetween("2026-11-09", "2026-11-02"), -7);
});

test("relativeDay: tomorrow, days, weeks", () => {
  assert.equal(relativeDay("2026-11-10", "2026-11-09"), "Tomorrow");
  assert.equal(relativeDay("2026-11-13", "2026-11-09"), "In 4 days");
  assert.equal(relativeDay("2026-11-22", "2026-11-09"), "In 13 days");
  assert.equal(relativeDay("2026-11-23", "2026-11-09"), "In 2 weeks");
  assert.equal(relativeDay("2026-11-09", "2026-11-09"), "Today");
});

const t = (id: string, due: string | null) => ({ id, due_date: due });

test("groupUpcoming keeps only dates after today, sorted and grouped by date", () => {
  const { groups, total, shown } = groupUpcoming(
    [t("a", "2026-11-13"), t("past", "2026-11-01"), t("today", "2026-11-09"), t("b", "2026-11-10"), t("c", "2026-11-13"), t("none", null)],
    "2026-11-09",
  );
  assert.deepEqual(groups.map((g) => [g.date, g.todos.map((x) => x.id)]), [
    ["2026-11-10", ["b"]],
    ["2026-11-13", ["a", "c"]],
  ]);
  assert.equal(total, 3);
  assert.equal(shown, 3);
  assert.equal(groups[0].label, "2026-11-10 · Tomorrow");
});

test("groupUpcoming limit cuts the list but reports the full total", () => {
  const todos = [t("1", "2026-11-10"), t("2", "2026-11-11"), t("3", "2026-11-12"), t("4", "2026-11-12")];
  const { groups, total, shown } = groupUpcoming(todos, "2026-11-09", 3, (d) => d.slice(5));
  assert.equal(total, 4);
  assert.equal(shown, 3);
  assert.deepEqual(groups.map((g) => g.todos.length), [1, 1, 1]);
  assert.equal(groups[0].label, "11-10 · Tomorrow");
  assert.deepEqual(groupUpcoming([], "2026-11-09"), { groups: [], total: 0, shown: 0 });
});
