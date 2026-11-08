import test from "node:test";
import assert from "node:assert/strict";
import { buildDayItems, countDistinct, describeDay, gridRange, limitItems, monthWeeks, shiftMonth, type MonthTodo } from "./month-grid";
import type { CalendarEvent } from "./google/layout";

test("shiftMonth crosses years", () => {
  assert.equal(shiftMonth("2026-10", 1), "2026-11");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("monthWeeks covers whole Monday-first weeks and marks the days outside the month", () => {
  const weeks = monthWeeks("2026-10"); // 1 Oct 2026 is a Thursday; 31 Oct is a Saturday
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[0][0].date, "2026-09-28");
  assert.deepEqual(weeks[0].map((c) => c.inMonth), [false, false, false, true, true, true, true]);
  assert.equal(weeks[4][6].date, "2026-11-01");
  assert.equal(weeks[4][6].inMonth, false);
  assert.deepEqual(gridRange(weeks), { start: "2026-09-28", end: "2026-11-01" });
});

test("monthWeeks handles a month that starts on Monday, a Sunday start and a 6-week month", () => {
  assert.equal(monthWeeks("2026-06")[0][0].date, "2026-06-01"); // Monday
  assert.equal(monthWeeks("2026-02").length, 5); // 1 Feb 2026 is a Sunday: Jan 26 .. Mar 1
  const aug = monthWeeks("2026-08"); // 1 Aug is a Saturday and 31 Aug a Monday: Jul 27 .. Sep 6
  assert.equal(aug.length, 6);
  assert.equal(aug[0][0].date, "2026-07-27");
  assert.equal(aug[5][0].date, "2026-08-31");
  assert.equal(aug[5][0].inMonth, true);
});

const ev = (over: Partial<CalendarEvent> & { id: string; title: string }): CalendarEvent => ({ allDay: false, start: "", end: "", ...over });
const todo = (over: Partial<MonthTodo> & { id: string }): MonthTodo => ({ title: "t", status: "todo", due_date: null, calendar_event_id: null, ...over });
const range = { start: "2026-09-28", end: "2026-11-01" };

test("events and to-dos land on the right WIB day, events first", () => {
  const map = buildDayItems(
    [
      ev({ id: "a", title: "Standup", start: "2026-10-20T02:00:00.000Z", end: "2026-10-20T02:30:00.000Z" }), // 09:00 WIB
      ev({ id: "b", title: "Holiday", allDay: true, start: "2026-10-20", end: "2026-10-21" }),
      ev({ id: "c", title: "Late call", start: "2026-10-20T17:30:00.000Z", end: "2026-10-20T18:00:00.000Z" }), // 00:30 WIB on the 21st
    ],
    [todo({ id: "1", title: "Zeta task", due_date: "2026-10-20" }), todo({ id: "2", title: "Alpha done", due_date: "2026-10-20", status: "done" })],
    range,
  );
  assert.deepEqual(map.get("2026-10-20")?.map((i) => `${i.kind}:${i.title}:${i.time ?? "-"}`), ["event:Holiday:-", "event:Standup:09:00", "todo:Zeta task:-", "todo:Alpha done:-"]);
  assert.deepEqual(map.get("2026-10-21")?.map((i) => `${i.title}:${i.time}`), ["Late call:00:30"]);
});

test("all-day and overnight events repeat on each day; ending exactly at midnight does not spill", () => {
  const map = buildDayItems(
    [
      ev({ id: "x", title: "Leave", allDay: true, start: "2026-10-12", end: "2026-10-15" }),
      ev({ id: "y", title: "Night shift", start: "2026-10-12T15:00:00.000Z", end: "2026-10-13T00:00:00.000Z" }), // 22:00 -> 07:00 WIB
      ev({ id: "z", title: "Until midnight", start: "2026-10-14T10:00:00.000Z", end: "2026-10-14T17:00:00.000Z" }), // 17:00 -> 00:00 WIB
    ],
    [],
    range,
  );
  for (const d of ["2026-10-12", "2026-10-13", "2026-10-14"]) assert.ok(map.get(d)?.some((i) => i.title === "Leave"), d);
  assert.ok(!map.has("2026-10-15") || !map.get("2026-10-15")?.some((i) => i.title === "Leave"));
  assert.equal(map.get("2026-10-12")?.find((i) => i.title === "Night shift")?.time, "22:00");
  assert.equal(map.get("2026-10-13")?.find((i) => i.title === "Night shift")?.time, null);
  assert.ok(!map.get("2026-10-15")?.some((i) => i.title === "Until midnight"));
});

test("a to-do linked to a fetched event is not listed twice and strikes the event when done", () => {
  const events = [ev({ id: "ev1", title: "Block: write report", start: "2026-10-22T02:00:00.000Z", end: "2026-10-22T04:00:00.000Z" })];
  const todos = [todo({ id: "t1", title: "Write report", due_date: "2026-10-22", calendar_event_id: "ev1", status: "done" })];
  const day = buildDayItems(events, todos, range).get("2026-10-22") ?? [];
  assert.equal(day.length, 1);
  assert.equal(day[0].kind, "event");
  assert.equal(day[0].done, true);
});

test("without Google data every to-do shows, linked or not", () => {
  const todos = [todo({ id: "t1", title: "Linked", due_date: "2026-10-22", calendar_event_id: "ev1" }), todo({ id: "t2", title: "Plain", due_date: "2026-10-22" })];
  assert.equal(buildDayItems(null, todos, range).get("2026-10-22")?.length, 2);
});

test("items outside the grid and to-dos without a date are ignored", () => {
  const map = buildDayItems(
    [ev({ id: "o", title: "Far", allDay: true, start: "2026-12-01", end: "2026-12-02" })],
    [todo({ id: "n", title: "No date" }), todo({ id: "p", title: "Past", due_date: "2026-09-01" })],
    range,
  );
  assert.equal(map.size, 0);
});

test("limitItems and describeDay", () => {
  assert.deepEqual(limitItems([1, 2, 3], 3), { shown: [1, 2, 3], more: 0 });
  assert.deepEqual(limitItems([1, 2, 3, 4, 5], 3), { shown: [1, 2, 3], more: 2 });
  const item = (kind: "event" | "todo") => ({ key: kind, ref: kind, source: null, kind, title: "x", time: null, allDay: false, done: false });
  assert.equal(describeDay([item("event"), item("event"), item("todo")]), "2 events, 1 to-do");
  assert.equal(describeDay([]), "nothing scheduled");
});

test("countDistinct counts a multi-day event once and only inside the chosen dates", () => {
  const map = buildDayItems(
    [
      ev({ id: "trip", title: "Offsite", allDay: true, start: "2026-10-26", end: "2026-10-29" }),
      ev({ id: "sep", title: "Sept thing", start: "2026-09-29T03:00:00.000Z", end: "2026-09-29T04:00:00.000Z" }),
    ],
    [todo({ id: "a", due_date: "2026-10-26" }), todo({ id: "b", due_date: "2026-10-27" })],
    range,
  );
  assert.deepEqual(countDistinct(map, (d) => d.startsWith("2026-10")), { events: 1, todos: 2 });
  assert.deepEqual(countDistinct(map, () => true), { events: 2, todos: 2 });
});

test("events from another calendar are tagged, never merged with a to-do link, and counted separately by calendar", () => {
  const events = [
    ev({ id: "same", title: "Primary event", start: "2026-10-22T02:00:00.000Z", end: "2026-10-22T03:00:00.000Z" }),
    ev({ id: "same", title: "Office event", source: "Kantor", start: "2026-10-22T04:00:00.000Z", end: "2026-10-22T05:00:00.000Z" }),
  ];
  // a to-do linked to the PRIMARY event "same": only that one is replaced, the other calendar's event with the same id stays
  const map = buildDayItems(events, [todo({ id: "t", title: "Linked to-do", due_date: "2026-10-22", calendar_event_id: "same", status: "done" })], range);
  const day = map.get("2026-10-22") ?? [];
  assert.deepEqual(day.map((i) => `${i.title}|${i.source}|${i.done}`), ["Primary event|null|true", "Office event|Kantor|false"]);
  assert.equal(countDistinct(map, () => true).events, 2, "same id in two calendars = two events");
});

test("buildDayItems carries the Google color of main-calendar events, but not of other calendars or to-dos", () => {
  const range = { start: "2026-12-28", end: "2027-01-03" };
  const events: CalendarEvent[] = [
    { id: "a", title: "Urgent", allDay: false, start: "2026-12-29T09:00:00+07:00", end: "2026-12-29T10:00:00+07:00", colorId: "11" },
    { id: "b", title: "Holiday", allDay: true, start: "2026-12-30", end: "2026-12-31", colorId: "10" },
    { id: "c", title: "Plain", allDay: false, start: "2026-12-29T11:00:00+07:00", end: "2026-12-29T12:00:00+07:00" },
    { id: "d", title: "Office", allDay: false, start: "2026-12-29T13:00:00+07:00", end: "2026-12-29T14:00:00+07:00", colorId: "3", source: "Office cal" },
  ];
  const todos: MonthTodo[] = [{ id: "t1", title: "Todo", status: "todo", due_date: "2026-12-29", calendar_event_id: null }];
  const days = buildDayItems(events, todos, range);
  const tue = Object.fromEntries((days.get("2026-12-29") ?? []).map((i) => [i.title, i]));
  assert.equal(tue.Urgent.colorId, "11");
  assert.equal("colorId" in tue.Plain, false);
  assert.equal("colorId" in tue.Office, false, "other calendars stay gray and dashed");
  assert.equal("colorId" in tue.Todo, false);
  assert.equal(days.get("2026-12-30")![0].colorId, "10", "all-day events carry it too");
});
