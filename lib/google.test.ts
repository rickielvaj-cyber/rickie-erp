import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { decryptToken, encryptToken, safeEqual } from "./google/crypto";
import { initialScrollHour, layoutWeek, toWib, type CalendarEvent } from "./google/layout";
import { normalizeEvent, listWeekEvents, CalendarApiError } from "./google/calendar";
import { buildAuthUrl, exchangeCode, GoogleAuthError, GOOGLE_SCOPE, refreshAccessToken } from "./google/oauth";

const SECRET = Buffer.alloc(32, 7).toString("base64");
const OTHER = Buffer.alloc(32, 9).toString("base64");

test("token encryption round-trips and never contains the plaintext", () => {
  const enc = encryptToken("1//refresh-token", "user-1", SECRET);
  assert.ok(!enc.includes("refresh-token"));
  assert.equal(decryptToken(enc, "user-1", SECRET), "1//refresh-token");
  assert.notEqual(encryptToken("1//refresh-token", "user-1", SECRET), enc, "fresh IV each time");
});

test("token decryption fails for a wrong key, a different user, or a tampered payload", () => {
  const enc = encryptToken("secret", "user-1", SECRET);
  assert.throws(() => decryptToken(enc, "user-1", OTHER));
  assert.throws(() => decryptToken(enc, "user-2", SECRET), "bound to the owning user");
  const parts = enc.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptToken(parts.join("."), "user-1", SECRET));
  assert.throws(() => decryptToken("garbage", "user-1", SECRET));
});

test("encryption refuses a missing or wrongly sized key", () => {
  assert.throws(() => encryptToken("x", "u", undefined));
  assert.throws(() => encryptToken("x", "u", Buffer.alloc(16).toString("base64")));
});

test("safeEqual compares secrets exactly", () => {
  assert.ok(safeEqual("abc123", "abc123"));
  assert.ok(!safeEqual("abc123", "abc124"));
  assert.ok(!safeEqual("abc", "abc123"));
});

test("buildAuthUrl asks for offline access with consent, the events scope, and the state", () => {
  process.env.GOOGLE_CLIENT_ID = "cid";
  const url = new URL(buildAuthUrl({ state: "st4te", redirect: "https://x.test/api/google/callback", loginHint: "a@b.c" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const q = url.searchParams;
  assert.equal(q.get("client_id"), "cid");
  assert.equal(q.get("scope"), GOOGLE_SCOPE);
  assert.equal(q.get("access_type"), "offline");
  assert.equal(q.get("prompt"), "consent");
  assert.equal(q.get("state"), "st4te");
  assert.equal(q.get("redirect_uri"), "https://x.test/api/google/callback");
  assert.equal(q.get("login_hint"), "a@b.c");
  assert.equal(q.get("response_type"), "code");
  delete process.env.GOOGLE_CLIENT_ID;
});

const timed = (id: string, start: string, end: string): CalendarEvent => ({ id, title: id, allDay: false, start, end });

test("toWib converts instants to Jakarta date and minutes", () => {
  assert.deepEqual(toWib("2026-10-19T02:30:00Z"), { date: "2026-10-19", minutes: 9 * 60 + 30 });
  assert.deepEqual(toWib("2026-10-19T20:00:00Z"), { date: "2026-10-20", minutes: 3 * 60 }, "after 17:00 UTC it is already the next day in WIB");
  assert.deepEqual(toWib("2026-10-19T09:00:00+07:00"), { date: "2026-10-19", minutes: 9 * 60 });
});

test("layoutWeek puts timed events on their WIB day and ignores events outside the week", () => {
  const days = layoutWeek(
    [timed("a", "2026-10-19T09:00:00+07:00", "2026-10-19T10:00:00+07:00"), timed("out", "2026-10-26T09:00:00+07:00", "2026-10-26T10:00:00+07:00")],
    "2026-10-19",
  );
  assert.equal(days.length, 7);
  assert.equal(days[0].date, "2026-10-19");
  assert.deepEqual(days[0].blocks.map((b) => [b.event.id, b.startMin, b.endMin]), [["a", 540, 600]]);
  assert.equal(days.flatMap((d) => d.blocks).length, 1);
});

test("layoutWeek splits an event that crosses midnight and drops a zero-length tail", () => {
  const days = layoutWeek([timed("night", "2026-10-19T22:00:00+07:00", "2026-10-20T02:00:00+07:00")], "2026-10-19");
  assert.deepEqual(days[0].blocks.map((b) => [b.startMin, b.endMin]), [[22 * 60, 24 * 60]]);
  assert.deepEqual(days[1].blocks.map((b) => [b.startMin, b.endMin]), [[0, 120]]);
  const ends = layoutWeek([timed("late", "2026-10-19T22:00:00+07:00", "2026-10-20T00:00:00+07:00")], "2026-10-19");
  assert.equal(ends[1].blocks.length, 0, "ending exactly at midnight does not appear on the next day");
});

test("layoutWeek gives overlapping events their own lanes and lets separate ones use the full width", () => {
  const days = layoutWeek(
    [
      timed("a", "2026-10-19T09:00:00+07:00", "2026-10-19T11:00:00+07:00"),
      timed("b", "2026-10-19T10:00:00+07:00", "2026-10-19T12:00:00+07:00"),
      timed("c", "2026-10-19T13:00:00+07:00", "2026-10-19T14:00:00+07:00"),
    ],
    "2026-10-19",
  );
  const by = Object.fromEntries(days[0].blocks.map((b) => [b.event.id, b]));
  assert.deepEqual([by.a.lane, by.a.lanes, by.b.lane, by.b.lanes], [0, 2, 1, 2]);
  assert.deepEqual([by.c.lane, by.c.lanes], [0, 1]);
});

test("layoutWeek gives very short events a minimum height and spreads all-day events over their days (end is exclusive)", () => {
  const days = layoutWeek(
    [
      timed("tiny", "2026-10-19T09:00:00+07:00", "2026-10-19T09:05:00+07:00"),
      { id: "trip", title: "trip", allDay: true, start: "2026-10-20", end: "2026-10-23" },
    ],
    "2026-10-19",
  );
  assert.equal(days[0].blocks[0].endMin - days[0].blocks[0].startMin, 20);
  assert.deepEqual(days.map((d) => d.allDay.length), [0, 1, 1, 1, 0, 0, 0]);
});

test("initialScrollHour opens at 07:00, or one hour before an earlier event", () => {
  assert.equal(initialScrollHour(layoutWeek([], "2026-10-19")), 7);
  assert.equal(initialScrollHour(layoutWeek([timed("e", "2026-10-19T09:00:00+07:00", "2026-10-19T10:00:00+07:00")], "2026-10-19")), 7);
  assert.equal(initialScrollHour(layoutWeek([timed("e", "2026-10-19T05:30:00+07:00", "2026-10-19T06:30:00+07:00")], "2026-10-19")), 4);
  assert.equal(initialScrollHour(layoutWeek([timed("e", "2026-10-19T00:30:00+07:00", "2026-10-19T01:30:00+07:00")], "2026-10-19")), 0, "never below midnight");
  assert.equal(initialScrollHour(layoutWeek([timed("late", "2026-10-19T22:00:00+07:00", "2026-10-19T23:00:00+07:00")], "2026-10-19")), 7, "late events do not move the start");
});

test("normalizeEvent keeps timed and all-day events, drops cancelled or malformed ones, names untitled ones", () => {
  assert.equal(normalizeEvent({ id: "1", status: "cancelled", summary: "x", start: { dateTime: "a" }, end: { dateTime: "b" } }), null);
  assert.equal(normalizeEvent({ summary: "no id" }), null);
  assert.equal(normalizeEvent({ id: "2", summary: "no time" }), null);
  assert.equal(normalizeEvent({ id: "3", start: { dateTime: "2026-10-19T09:00:00+07:00" }, end: { dateTime: "2026-10-19T10:00:00+07:00" } })?.title, "(No title)");
  assert.equal(normalizeEvent({ id: "4", summary: "Holiday", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } })?.allDay, true);
});

async function withGoogle<T>(handler: (url: string, body: string, auth: string | undefined) => { status: number; body: unknown }, run: () => Promise<T>): Promise<T> {
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const out = handler(req.url ?? "", raw, req.headers.authorization);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.GOOGLE_TOKEN_URL = `${base}/token`;
  process.env.GOOGLE_CALENDAR_API = `${base}/calendar/v3`;
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
  try {
    return await run();
  } finally {
    for (const k of ["GOOGLE_TOKEN_URL", "GOOGLE_CALENDAR_API", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) delete process.env[k];
    await new Promise((resolve) => server.close(resolve));
  }
}

test("exchangeCode and refreshAccessToken talk to the token endpoint; invalid_grant means reconnect", async () => {
  await withGoogle(
    (url, body) => {
      const p = new URLSearchParams(body);
      if (url !== "/token") return { status: 404, body: {} };
      assert.equal(p.get("client_secret"), "csecret");
      if (p.get("grant_type") === "authorization_code") return { status: 200, body: { access_token: "AT", refresh_token: "RT", scope: GOOGLE_SCOPE } };
      if (p.get("refresh_token") === "revoked") return { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
      return { status: 200, body: { access_token: "AT2" } };
    },
    async () => {
      assert.deepEqual(await exchangeCode("code", "https://x/cb"), { accessToken: "AT", refreshToken: "RT", scope: GOOGLE_SCOPE });
      assert.equal(await refreshAccessToken("RT"), "AT2");
      await assert.rejects(refreshAccessToken("revoked"), (e) => e instanceof GoogleAuthError && e.reconnect === true);
    },
  );
});

test("exchangeCode fails clearly when Google returns no refresh token", async () => {
  await withGoogle(
    () => ({ status: 200, body: { access_token: "AT" } }),
    async () => {
      await assert.rejects(exchangeCode("code", "https://x/cb"), (e) => e instanceof GoogleAuthError && e.reconnect === false);
    },
  );
});

test("listWeekEvents asks for the Jakarta week, sends the bearer token, and maps the items", async () => {
  let seenUrl = "";
  let seenAuth: string | undefined;
  await withGoogle(
    (url, _body, auth) => {
      seenUrl = url;
      seenAuth = auth;
      return {
        status: 200,
        body: {
          items: [
            { id: "e1", summary: "Standup", start: { dateTime: "2026-10-19T09:00:00+07:00" }, end: { dateTime: "2026-10-19T09:30:00+07:00" } },
            { id: "e2", status: "cancelled" },
          ],
        },
      };
    },
    async () => {
      const events = await listWeekEvents("AT", "2026-10-19");
      assert.deepEqual(events.map((e) => e.id), ["e1"]);
    },
  );
  const q = new URL(`http://x${seenUrl}`).searchParams;
  assert.equal(seenAuth, "Bearer AT");
  assert.equal(q.get("timeMin"), "2026-10-19T00:00:00+07:00");
  assert.equal(q.get("timeMax"), "2026-10-26T00:00:00+07:00");
  assert.equal(q.get("singleEvents"), "true");
  assert.equal(q.get("timeZone"), "Asia/Jakarta");
});

test("listWeekEvents turns a Google error into a CalendarApiError with the status", async () => {
  await withGoogle(
    () => ({ status: 403, body: { error: { message: "Calendar API has not been used" } } }),
    async () => {
      await assert.rejects(listWeekEvents("AT", "2026-10-19"), (e) => e instanceof CalendarApiError && /403/.test(e.message));
    },
  );
});

// ---- time blocking ----
import { dragRange, isEventId, minutesToTime, parseBlockInput, slotFromOffset, snapMinutes, timeToMinutes, wibIso } from "./google/block";
import { createEvent, deleteEvent, updateEvent } from "./google/calendar";

test("time helpers convert and validate HH:MM", () => {
  assert.equal(minutesToTime(9 * 60 + 5), "09:05");
  assert.equal(minutesToTime(24 * 60), "23:59", "24:00 is clamped (a time input has no 24:00)");
  assert.equal(minutesToTime(-5), "00:00");
  assert.equal(timeToMinutes("09:30"), 570);
  assert.equal(timeToMinutes("24:00"), null);
  assert.equal(timeToMinutes("9:30"), null);
  assert.equal(timeToMinutes("12:60"), null);
  assert.equal(snapMinutes(547), 540);
  assert.equal(snapMinutes(548), 555);
});

test("slotFromOffset maps pointer position to snapped minutes inside the visible hours", () => {
  // 13 visible hours (07-20) in 624px: 48px per hour.
  assert.equal(slotFromOffset(0, 624, 7, 20), 7 * 60);
  assert.equal(slotFromOffset(48, 624, 7, 20), 8 * 60);
  assert.equal(slotFromOffset(48 * 2 + 12, 624, 7, 20), 9 * 60 + 15, "snaps to 15 minutes");
  assert.equal(slotFromOffset(10_000, 624, 7, 20), 23 * 60 + 59, "clamped to the end of the day");
  assert.equal(slotFromOffset(-50, 624, 7, 20), 6 * 60, "slightly above the grid snaps to the nearest slot, still inside the day");
});

test("dragRange orders the points, treats a click as a 30-minute block and keeps a minimum length", () => {
  assert.deepEqual(dragRange(600, 600), { startMin: 600, endMin: 630 });
  assert.deepEqual(dragRange(660, 600), { startMin: 600, endMin: 660 }, "dragging upwards");
  assert.deepEqual(dragRange(600, 615), { startMin: 600, endMin: 615 });
  const late = dragRange(24 * 60 - 1, 24 * 60 - 1);
  assert.ok(late.endMin > late.startMin && late.endMin <= 24 * 60 - 1);
});

test("wibIso builds a +07:00 timestamp", () => {
  assert.equal(wibIso("2026-10-20", 9 * 60 + 15), "2026-10-20T09:15:00+07:00");
});

test("parseBlockInput accepts a good block and rejects bad ones with a clear message", () => {
  const ok = parseBlockInput({ title: "  UAT   prep ", date: "2026-10-20", start: "09:00", end: "10:30" });
  assert.deepEqual(ok, { ok: true, value: { title: "UAT prep", date: "2026-10-20", startMin: 540, endMin: 630 } });
  const bad = (o: object) => {
    const r = parseBlockInput(o);
    return r.ok ? "ok" : r.error;
  };
  const base = { title: "x", date: "2026-10-20", start: "09:00", end: "10:00" };
  assert.match(bad({ ...base, title: "   " }), /title/i);
  assert.match(bad({ ...base, title: "x".repeat(201) }), /too long/i);
  assert.match(bad({ ...base, date: "2026-02-31" }), /date/i);
  assert.match(bad({ ...base, start: "25:00" }), /time/i);
  assert.match(bad({ ...base, end: "09:00" }), /after/i);
  assert.match(bad({ ...base, end: "08:00" }), /after/i);
  assert.match(bad(null as unknown as object), /title/i);
  assert.match(bad({ ...base, title: 5 }), /title/i);
});

test("isEventId only accepts Google event id characters", () => {
  assert.ok(isEventId("abc123_20261020T020000Z"));
  assert.ok(!isEventId("../etc"));
  assert.ok(!isEventId("a/b"));
  assert.ok(!isEventId(""));
  assert.ok(!isEventId(42));
});

test("createEvent, updateEvent and deleteEvent call Google with the right method, body and no attendee emails", async () => {
  const calls: { method: string; url: string; auth?: string; body: unknown }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      if (req.url?.includes("/gone")) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Not Found" } }));
      }
      if (req.method === "DELETE") {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "ev1", summary: "UAT prep", start: { dateTime: "2026-10-20T09:00:00+07:00" }, end: { dateTime: "2026-10-20T10:30:00+07:00" } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GOOGLE_CALENDAR_API = `http://127.0.0.1:${(server.address() as AddressInfo).port}/calendar/v3`;
  try {
    const input = { title: "UAT prep", date: "2026-10-20", startMin: 540, endMin: 630 };
    const created = await createEvent("AT", input);
    assert.equal(created?.id, "ev1");
    await updateEvent("AT", "ev1", input);
    await deleteEvent("AT", "ev1");
    await assert.rejects(deleteEvent("AT", "gone"), (e) => e instanceof CalendarApiError && /no longer exists/.test(e.message));

    const [post, patch, del] = calls;
    assert.equal(post.method, "POST");
    assert.equal(post.url, "/calendar/v3/calendars/primary/events?sendUpdates=none");
    assert.equal(post.auth, "Bearer AT");
    assert.deepEqual(post.body, {
      summary: "UAT prep",
      start: { dateTime: "2026-10-20T09:00:00+07:00", timeZone: "Asia/Jakarta" },
      end: { dateTime: "2026-10-20T10:30:00+07:00", timeZone: "Asia/Jakarta" },
    });
    assert.equal(patch.method, "PATCH");
    assert.equal(patch.url, "/calendar/v3/calendars/primary/events/ev1?sendUpdates=none");
    assert.equal(del.method, "DELETE");
    assert.equal(del.url, "/calendar/v3/calendars/primary/events/ev1?sendUpdates=none");
  } finally {
    delete process.env.GOOGLE_CALENDAR_API;
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---- to-do <-> acara ----
import { planReconcile, type LinkedTodo } from "./google/reconcile";
import { formatScheduled } from "./google/layout";
import { getEvent } from "./google/calendar";

const linkedTodo = (o: Partial<LinkedTodo> = {}): LinkedTodo => ({
  id: "t1",
  due_date: "2026-10-21",
  calendar_event_id: "ev1",
  scheduled_start: "2026-10-21T06:00:00+00:00",
  scheduled_end: "2026-10-21T07:30:00+00:00",
  ...o,
});
const ev = (start: string, end: string, allDay = false): CalendarEvent => ({ id: "ev1", title: "x", allDay, start, end });

test("planReconcile leaves an unchanged link alone (same instants in different formats)", () => {
  const plan = planReconcile([linkedTodo()], new Map([["ev1", ev("2026-10-21T13:00:00+07:00", "2026-10-21T14:30:00+07:00")]]));
  assert.deepEqual(plan, []);
});

test("planReconcile follows an event that moved to another day or time in Google", () => {
  const plan = planReconcile([linkedTodo()], new Map([["ev1", ev("2026-10-22T10:00:00+07:00", "2026-10-22T11:00:00+07:00")]]));
  assert.deepEqual(plan, [{ id: "t1", kind: "sync", due_date: "2026-10-22", scheduled_start: "2026-10-22T03:00:00.000Z", scheduled_end: "2026-10-22T04:00:00.000Z" }]);
  const late = planReconcile([linkedTodo()], new Map([["ev1", ev("2026-10-21T23:30:00+07:00", "2026-10-22T00:30:00+07:00")]]));
  assert.equal((late[0] as { due_date: string }).due_date, "2026-10-21", "the date is the WIB date of the start");
});

test("planReconcile unlinks when the event was deleted, but not when Google could not be reached", () => {
  assert.deepEqual(planReconcile([linkedTodo()], new Map([["ev1", null]])), [{ id: "t1", kind: "unlink" }]);
  assert.deepEqual(planReconcile([linkedTodo()], new Map()), [], "unknown = leave the link");
});

test("planReconcile turns an event that became all-day into a date without times", () => {
  const plan = planReconcile([linkedTodo()], new Map([["ev1", ev("2026-10-23", "2026-10-24", true)]]));
  assert.deepEqual(plan, [{ id: "t1", kind: "sync", due_date: "2026-10-23", scheduled_start: null, scheduled_end: null }]);
});

test("formatScheduled shows WIB times and tolerates missing values", () => {
  assert.equal(formatScheduled("2026-10-21T06:00:00+00:00", "2026-10-21T07:30:00+00:00"), "13:00–14:30");
  assert.equal(formatScheduled(null, "2026-10-21T07:30:00Z"), null);
  assert.equal(formatScheduled("nope", "nope"), null);
});

test("getEvent returns null for a deleted event (404/410) and throws for other failures", async () => {
  const server: Server = createServer((req, res) => {
    const status = req.url?.includes("/gone") ? 404 : req.url?.includes("/boom") ? 500 : 200;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(status === 200 ? { id: "ev1", summary: "Hi", start: { dateTime: "2026-10-21T13:00:00+07:00" }, end: { dateTime: "2026-10-21T14:00:00+07:00" } } : {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GOOGLE_CALENDAR_API = `http://127.0.0.1:${(server.address() as AddressInfo).port}/calendar/v3`;
  try {
    assert.equal((await getEvent("AT", "ev1"))?.title, "Hi");
    assert.equal(await getEvent("AT", "gone"), null);
    await assert.rejects(getEvent("AT", "boom"), CalendarApiError);
  } finally {
    delete process.env.GOOGLE_CALENDAR_API;
    await new Promise((resolve) => server.close(resolve));
  }
});
