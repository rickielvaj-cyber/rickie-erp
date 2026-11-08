import assert from "node:assert/strict";
import { test } from "node:test";
import { bustCalendar, bustUser, cached, cachedSWR, clearCache, peek, put } from "./google/cache";

test("cached reuses the result until the ttl passes", async () => {
  clearCache();
  let t = 1000;
  let calls = 0;
  const load = async () => ++calls;
  assert.equal(await cached("u|k", 500, load, () => t), 1);
  t += 400;
  assert.equal(await cached("u|k", 500, load, () => t), 1, "still fresh");
  t += 200;
  assert.equal(await cached("u|k", 500, load, () => t), 2, "expired, loaded again");
});

test("cached shares one load between simultaneous callers and does not keep errors", async () => {
  clearCache();
  let calls = 0;
  const slow = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return "v";
  };
  const [a, b] = await Promise.all([cached("u|a", 1000, slow), cached("u|a", 1000, slow)]);
  assert.equal(a, "v");
  assert.equal(b, "v");
  assert.equal(calls, 1);

  let failures = 0;
  await assert.rejects(cached("u|err", 1000, async () => {
    failures++;
    throw new Error("boom");
  }));
  assert.equal(await cached("u|err", 1000, async () => "recovered"), "recovered", "a failure is retried, not cached");
  assert.equal(failures, 1);
});

test("peek only returns fresh values and put stores a computed one", () => {
  clearCache();
  let t = 0;
  assert.equal(peek("u|x", 100, () => t), undefined);
  put("u|x", { n: 1 }, () => t);
  assert.deepEqual(peek("u|x", 100, () => t), { n: 1 });
  t = 150;
  assert.equal(peek("u|x", 100, () => t), undefined);
});

test("bustCalendar clears only the calendar views of that user; bustUser clears everything of that user", () => {
  clearCache();
  put("u1|token", "T");
  put("u1|state|2026-11-09", "S1");
  put("u2|state|2026-11-09", "S2");
  bustCalendar("u1");
  assert.equal(peek("u1|token", 1e9), "T", "token stays");
  assert.equal(peek("u1|state|2026-11-09", 1e9), undefined);
  assert.equal(peek("u2|state|2026-11-09", 1e9), "S2", "other users are untouched");
  bustUser("u1");
  assert.equal(peek("u1|token", 1e9), undefined);
  assert.equal(peek("u2|state|2026-11-09", 1e9), "S2");
});

test("cachedSWR returns the stale value at once and refreshes in the background", async () => {
  clearCache();
  let t = 0;
  let version = 0;
  const load = async () => ++version;
  const tasks: Array<() => Promise<void>> = [];
  const schedule = (task: () => Promise<void>) => void tasks.push(task);

  assert.equal(await cachedSWR("u|s", 100, 1000, load, schedule, () => t), 1, "first call loads and waits");
  t = 50;
  assert.equal(await cachedSWR("u|s", 100, 1000, load, schedule, () => t), 1, "fresh");
  assert.equal(tasks.length, 0);

  t = 300; // stale: answered immediately, refresh scheduled once
  assert.equal(await cachedSWR("u|s", 100, 1000, load, schedule, () => t), 1);
  assert.equal(await cachedSWR("u|s", 100, 1000, load, schedule, () => t), 1);
  assert.equal(tasks.length, 1, "only one refresh is scheduled");
  await tasks[0]();
  assert.equal(await cachedSWR("u|s", 100, 1000, load, schedule, () => t), 2, "after the refresh the new value is served");

  t = 5000; // too old: waits for a real load
  assert.equal(await cachedSWR("u|s", 100, 1000, load, schedule, () => t), 3);
});

test("cachedSWR keeps serving the old value if the background refresh fails", async () => {
  clearCache();
  let t = 0;
  let fail = false;
  const load = async () => {
    if (fail) throw new Error("google down");
    return "ok";
  };
  const tasks: Array<() => Promise<void>> = [];
  assert.equal(await cachedSWR("u|f", 100, 1000, load, (task) => void tasks.push(task), () => t), "ok");
  t = 300;
  fail = true;
  assert.equal(await cachedSWR("u|f", 100, 1000, load, (task) => void tasks.push(task), () => t), "ok");
  await tasks[0]();
  assert.equal(await cachedSWR("u|f", 100, 1000, load, (task) => void tasks.push(task), () => t), "ok", "still the old value");
});
