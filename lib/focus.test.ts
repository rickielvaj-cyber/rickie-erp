import test from "node:test";
import assert from "node:assert/strict";
import {
  GRACE_MS,
  LONG_BREAK,
  POINTS_PER_SESSION,
  SHORT_BREAK,
  breakMinutes,
  focusOutcome,
  formatClock,
  parseFocusInput,
  parseTimerState,
  remainingSeconds,
  summarizeSessions,
  wibDate,
} from "./focus";

test("formatClock and remainingSeconds round up and never go negative", () => {
  assert.equal(formatClock(1500), "25:00");
  assert.equal(formatClock(247), "04:07");
  assert.equal(formatClock(-5), "00:00");
  assert.equal(remainingSeconds(10_000, 8_001), 2);
  assert.equal(remainingSeconds(10_000, 9_999), 1);
  assert.equal(remainingSeconds(10_000, 12_000), 0);
});

test("focusOutcome: running, then recorded within the grace period, then discarded", () => {
  const end = 1_000_000;
  assert.equal(focusOutcome(end, end - 1), "running");
  assert.equal(focusOutcome(end, end), "record");
  assert.equal(focusOutcome(end, end + GRACE_MS), "record");
  assert.equal(focusOutcome(end, end + GRACE_MS + 1), "discard");
});

test("breakMinutes: a long break after every 4th session of the day", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8].map(breakMinutes), [SHORT_BREAK, SHORT_BREAK, SHORT_BREAK, LONG_BREAK, SHORT_BREAK, LONG_BREAK]);
  assert.equal(breakMinutes(0), SHORT_BREAK);
});

test("parseTimerState accepts valid states and ignores damaged ones", () => {
  const focus = { phase: "focus", startedAt: 1000, endsAt: 2000, minutes: 25, label: "Report" };
  assert.deepEqual(parseTimerState(JSON.stringify(focus)), focus);
  assert.equal(parseTimerState(null), null);
  assert.equal(parseTimerState("not json"), null);
  assert.equal(parseTimerState(JSON.stringify({ ...focus, endsAt: 500 })), null, "ends before it starts");
  assert.equal(parseTimerState(JSON.stringify({ phase: "focus", startedAt: "x" })), null);
  assert.equal(parseTimerState(JSON.stringify({ phase: "hack" })), null);
  assert.equal(parseTimerState(JSON.stringify({ ...focus, label: "x".repeat(200) }))?.phase, "focus");
  const done = parseTimerState(JSON.stringify({ phase: "done", minutes: 25, label: "", points: 10, at: 5, sessionsToday: 4, error: "e".repeat(500) }));
  assert.ok(done && done.phase === "done" && (done.error ?? "").length === 200 && done.sessionsToday === 4);
  const noCount = parseTimerState(JSON.stringify({ phase: "done", minutes: 25, label: "", points: 10, at: 5, sessionsToday: "4" }));
  assert.ok(noCount && noCount.phase === "done" && noCount.sessionsToday === undefined, "a non-numeric count is ignored");
  assert.deepEqual(parseTimerState(JSON.stringify({ phase: "expired", minutes: 25, at: 3 })), { phase: "expired", minutes: 25, at: 3 });
});

const NOW = Date.parse("2026-11-03T05:00:00.000Z");
const startedMinutesAgo = (min: number, length: number) => new Date(NOW - (min + length) * 60_000).toISOString();

test("parseFocusInput accepts a session that just finished", () => {
  const r = parseFocusInput({ startedAt: startedMinutesAgo(0, 25), minutes: 25, label: "  Review   blueprint " }, NOW);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { startedAt: startedMinutesAgo(0, 25), minutes: 25, label: "Review blueprint" });
});

test("parseFocusInput rejects unfinished, stale, odd-length and malformed sessions", () => {
  assert.ok(!parseFocusInput({ startedAt: startedMinutesAgo(-5, 25), minutes: 25 }, NOW).ok, "ends in 5 minutes");
  assert.ok(!parseFocusInput({ startedAt: startedMinutesAgo(40, 25), minutes: 25 }, NOW).ok, "ended 40 minutes ago");
  assert.ok(parseFocusInput({ startedAt: startedMinutesAgo(14, 25), minutes: 25 }, NOW).ok, "ended 14 minutes ago is inside the grace period");
  assert.ok(!parseFocusInput({ startedAt: startedMinutesAgo(0, 7), minutes: 7 }, NOW).ok, "7 minutes is not an offered length");
  assert.ok(!parseFocusInput({ startedAt: startedMinutesAgo(0, 25), minutes: "25" }, NOW).ok);
  assert.ok(!parseFocusInput({ startedAt: "yesterday", minutes: 25 }, NOW).ok);
  assert.ok(!parseFocusInput(null, NOW).ok);
  const long = parseFocusInput({ startedAt: startedMinutesAgo(0, 25), minutes: 25, label: "x".repeat(300) }, NOW);
  assert.ok(long.ok && long.value.label.length === 80);
});

test("wibDate shifts to Jakarta", () => {
  assert.equal(wibDate("2026-11-02T17:30:00.000Z"), "2026-11-03");
  assert.equal(wibDate("2026-11-03T16:59:00.000Z"), "2026-11-03");
});

test("summarizeSessions totals today, this week (Mon-Sun, WIB) and everything, and counts the last 7 days", () => {
  const rows = [
    { started_at: "2026-11-03T01:00:00.000Z", minutes: 25, points: 10 }, // Tue 3 Nov (today)
    { started_at: "2026-11-03T03:00:00.000Z", minutes: 45, points: 10 }, // today
    { started_at: "2026-11-02T20:00:00.000Z", minutes: 25, points: 10 }, // 03:00 WIB on Tue 3 Nov: today
    { started_at: "2026-11-02T03:00:00.000Z", minutes: 25, points: 10 }, // Mon 2 Nov: this week
    { started_at: "2026-11-01T03:00:00.000Z", minutes: 60, points: 10 }, // Sun 1 Nov: last week
    { started_at: "2026-10-20T03:00:00.000Z", minutes: 25, points: 10 }, // older: only in total
  ];
  const s = summarizeSessions(rows, "2026-11-03");
  assert.deepEqual(s.today, { sessions: 3, minutes: 95, points: 30 });
  assert.deepEqual(s.week, { sessions: 4, minutes: 120, points: 40 });
  assert.deepEqual(s.total, { sessions: 6, minutes: 205, points: 60 });
  assert.deepEqual(s.days.map((d) => d.date), ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  assert.deepEqual(s.days.map((d) => d.sessions), [0, 0, 0, 0, 1, 1, 3]);
});

test("the rule is 10 points per completed session", () => {
  assert.equal(POINTS_PER_SESSION, 10);
});
