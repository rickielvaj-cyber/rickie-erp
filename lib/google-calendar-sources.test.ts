import test from "node:test";
import assert from "node:assert/strict";
import { calendarLabel, describeCalendarFailure, mergeExtraEvents, parseCalendarId } from "./google/calendar-sources";
import type { CalendarEvent } from "./google/layout";

test("parseCalendarId accepts real calendar IDs and normalizes case and spaces", () => {
  for (const id of ["name@gmail.com", "abc123def@group.calendar.google.com", "en.indonesian#holiday@group.v.calendar.google.com", "first.last+work@company.co.id"]) {
    const r = parseCalendarId(`  ${id.toUpperCase()}  `);
    assert.ok(r.ok && r.id === id, id);
  }
});

test("parseCalendarId rejects junk, primary and URLs", () => {
  for (const bad of ["", "   ", "primary", "PRIMARY", "not an id", "plain", "a@b", "https://calendar.google.com/calendar/u/0?cid=abc", "x@y.com extra", "a".repeat(201) + "@x.com", null, 5]) {
    assert.equal(parseCalendarId(bad).ok, false, String(bad).slice(0, 30));
  }
  const p = parseCalendarId("primary");
  assert.ok(!p.ok && /already shown/.test(p.error));
});

test("calendarLabel prefers what you typed, then Google's title, then the start of the ID", () => {
  assert.equal(calendarLabel("  Kantor  ", "Work cal", "x@y.com"), "Kantor");
  assert.equal(calendarLabel("", "Work cal", "x@y.com"), "Work cal");
  assert.equal(calendarLabel(undefined, null, "kantor.team@group.calendar.google.com"), "kantor.team");
  assert.equal(calendarLabel("x".repeat(200), null, "a@b.com").length, 80);
});

const ev = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: id, allDay: false, start: "2026-10-20T02:00:00.000Z", end: "2026-10-20T03:00:00.000Z", ...over });

test("mergeExtraEvents tags other-calendar events and drops duplicates by iCalUID", () => {
  const primary = [ev("p1", { uid: "u-shared" }), ev("p2")];
  const merged = mergeExtraEvents(primary, [
    { label: "Kantor", events: [ev("k1", { uid: "u-shared" }), ev("k2", { uid: "u-k2" }), ev("k3")] },
    { label: "Proyek", events: [ev("j1", { uid: "u-k2" }), ev("j2", { uid: "u-j2" })] },
  ]);
  assert.deepEqual(merged.map((e) => `${e.id}:${e.source ?? "-"}`), ["p1:-", "p2:-", "k2:Kantor", "k3:Kantor", "j2:Proyek"]);
});

test("mergeExtraEvents keeps primary events untouched and handles no extras", () => {
  const primary = [ev("p1")];
  const out = mergeExtraEvents(primary, []);
  assert.deepEqual(out, primary);
  assert.equal(out[0].source, undefined);
  assert.equal(mergeExtraEvents(primary, [{ label: "X", events: [] }]).length, 1);
});

test("describeCalendarFailure names the calendar and the likely cause", () => {
  assert.match(describeCalendarFailure("Kantor", 404), /not found/);
  assert.match(describeCalendarFailure("Kantor", 403), /no access/);
  assert.match(describeCalendarFailure("Kantor", undefined), /right now/);
});
