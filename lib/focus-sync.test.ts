import test from "node:test";
import assert from "node:assert/strict";
import { GRACE_MS } from "./focus";
import { EMPTY_SYNC_META, parseRunningTimer, parseSyncMeta, reconcileTimer, type RunningTimer, type SyncMeta } from "./focus-sync";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const focus = (startedAt: number, minutes = 25, label = ""): RunningTimer => ({ phase: "focus", startedAt, endsAt: startedAt + minutes * MIN, minutes, label });
const brk = (startedAt: number, minutes = 5): RunningTimer => ({ phase: "break", startedAt, endsAt: startedAt + minutes * MIN, minutes });
const synced = (n: number | null, pendingClear: number | null = null): SyncMeta => ({ synced: n, pendingClear });

test("parseRunningTimer accepts focus and break timers and normalises them", () => {
  assert.deepEqual(parseRunningTimer({ phase: "focus", startedAt: NOW, endsAt: NOW + 25 * MIN, minutes: 25, label: "x".repeat(200), extra: 1 }, NOW), {
    phase: "focus",
    startedAt: NOW,
    endsAt: NOW + 25 * MIN,
    minutes: 25,
    label: "x".repeat(80),
  });
  assert.deepEqual(parseRunningTimer({ phase: "break", startedAt: NOW, endsAt: NOW + 5 * MIN, minutes: 5, label: "ignored" }, NOW), brk(NOW));
  assert.equal(parseRunningTimer({ phase: "focus", startedAt: NOW, endsAt: NOW + 25 * MIN, minutes: 25 }, NOW)?.phase === "focus", true); // missing label -> ""
});

test("parseRunningTimer rejects anything that is not a sane running timer", () => {
  const ok = { phase: "focus", startedAt: NOW, endsAt: NOW + 25 * MIN, minutes: 25 };
  for (const bad of [
    null,
    "focus",
    [],
    { ...ok, phase: "done" },
    { ...ok, phase: "expired" },
    { ...ok, startedAt: "1" },
    { ...ok, endsAt: NaN },
    { ...ok, endsAt: ok.startedAt },
    { ...ok, endsAt: ok.startedAt - 1 },
    { ...ok, endsAt: ok.startedAt + 130 * MIN },
    { ...ok, minutes: 0 },
    { ...ok, minutes: 121 },
    { ...ok, minutes: 2.5 },
    { ...ok, startedAt: NOW + 10 * MIN, endsAt: NOW + 35 * MIN }, // starts far in the future
  ]) {
    assert.equal(parseRunningTimer(bad, NOW), null, JSON.stringify(bad));
  }
  assert.notEqual(parseRunningTimer({ ...ok, startedAt: NOW + 2 * MIN, endsAt: NOW + 27 * MIN }, NOW), null); // small clock skew is fine
});

test("parseSyncMeta tolerates garbage", () => {
  assert.deepEqual(parseSyncMeta('{"synced":123,"pendingClear":456}'), { synced: 123, pendingClear: 456 });
  for (const bad of [null, "", "x", "[]", '{"synced":"1","pendingClear":true}']) assert.deepEqual(parseSyncMeta(bad), EMPTY_SYNC_META, String(bad));
});

test("a timer started on another device is adopted when this device has none (or only a finished/expired state)", () => {
  const s = focus(NOW - MIN);
  assert.deepEqual(reconcileTimer(null, s, EMPTY_SYNC_META, NOW), { type: "adopt", state: s });
  assert.deepEqual(reconcileTimer({ phase: "done", minutes: 25, label: "", points: 10, at: NOW - 5 * MIN }, s, EMPTY_SYNC_META, NOW), { type: "adopt", state: s });
  assert.deepEqual(reconcileTimer({ phase: "expired", minutes: 25, at: NOW - 5 * MIN }, s, EMPTY_SYNC_META, NOW), { type: "adopt", state: s });
});

test("a timer started here and missing on the server is pushed", () => {
  const l = focus(NOW);
  assert.deepEqual(reconcileTimer(l, null, EMPTY_SYNC_META, NOW), { type: "push", state: l });
  assert.deepEqual(reconcileTimer(l, null, synced(l.startedAt - 1), NOW), { type: "push", state: l }); // an older timer was synced, not this one
});

test("a timer that was on the server and disappeared was stopped or finished elsewhere: clear it here without pushing", () => {
  const l = focus(NOW - 10 * MIN);
  assert.deepEqual(reconcileTimer(l, null, synced(l.startedAt), NOW), { type: "clear-local" });
});

test("nothing to do when both sides agree, or when neither has a timer", () => {
  const s = focus(NOW - MIN);
  assert.deepEqual(reconcileTimer(s, s, synced(s.startedAt), NOW), { type: "none" });
  assert.deepEqual(reconcileTimer(null, null, EMPTY_SYNC_META, NOW), { type: "none" });
  assert.deepEqual(reconcileTimer({ phase: "done", minutes: 25, label: "", points: 10, at: NOW }, null, EMPTY_SYNC_META, NOW), { type: "none" });
  assert.deepEqual(reconcileTimer(s, s, EMPTY_SYNC_META, NOW), { type: "mark-synced", startedAt: s.startedAt });
});

test("two different running timers: the one that started later wins, in both directions", () => {
  const older = focus(NOW - 20 * MIN);
  const newer = focus(NOW - 2 * MIN, 45);
  assert.deepEqual(reconcileTimer(older, newer, synced(older.startedAt), NOW), { type: "adopt", state: newer });
  assert.deepEqual(reconcileTimer(newer, older, synced(older.startedAt), NOW), { type: "push", state: newer });
  // a break started on another device after the focus session ended here
  const b = brk(NOW - MIN);
  assert.deepEqual(reconcileTimer(focus(NOW - 26 * MIN), b, synced(NOW - 26 * MIN), NOW), { type: "adopt", state: b });
});

test("a stop that has not reached the server yet is retried first and the stopped timer does not come back", () => {
  const onServer = focus(NOW - 5 * MIN);
  const done = { phase: "done", minutes: 25, label: "", points: 10, at: NOW } as const;
  assert.deepEqual(reconcileTimer(null, onServer, synced(onServer.startedAt, onServer.startedAt), NOW), { type: "clear-server", upTo: onServer.startedAt });
  assert.deepEqual(reconcileTimer(done, onServer, synced(null, onServer.startedAt), NOW), { type: "clear-server", upTo: onServer.startedAt });
  // a new timer started here meanwhile replaces the old row instead
  const fresh = focus(NOW);
  assert.deepEqual(reconcileTimer(fresh, onServer, synced(onServer.startedAt, onServer.startedAt), NOW), { type: "push", state: fresh });
  // the row is already gone: just forget the pending clear
  assert.deepEqual(reconcileTimer(null, null, synced(null, onServer.startedAt), NOW), { type: "reset-pending" });
});

test("a pending clear never deletes a NEWER timer started on another device", () => {
  const stopped = focus(NOW - 20 * MIN); // stopped here, the delete failed
  const others = focus(NOW - 2 * MIN, 45); // started on the phone afterwards
  assert.deepEqual(reconcileTimer(null, others, synced(stopped.startedAt, stopped.startedAt), NOW), { type: "adopt", state: others });
  assert.deepEqual(reconcileTimer({ phase: "done", minutes: 25, label: "", points: 10, at: NOW - 3 * MIN }, others, synced(null, stopped.startedAt), NOW), { type: "adopt", state: others });
});

test("an old leftover row (other device died, grace period passed) is cleared, not revived", () => {
  const stale = focus(NOW - 25 * MIN - GRACE_MS - 5 * MIN);
  assert.deepEqual(reconcileTimer(null, stale, EMPTY_SYNC_META, NOW), { type: "clear-server", upTo: stale.startedAt });
  // but a row that just ended is still adopted so this device can record the session within the grace period
  const justEnded = focus(NOW - 26 * MIN);
  assert.deepEqual(reconcileTimer(null, justEnded, EMPTY_SYNC_META, NOW), { type: "adopt", state: justEnded });
});
