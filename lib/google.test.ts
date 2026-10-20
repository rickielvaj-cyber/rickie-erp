import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { decryptToken, encryptToken, safeEqual } from "./google/crypto";
import { layoutWeek, toWib, visibleHours, type CalendarEvent } from "./google/layout";
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

test("visibleHours defaults to 07-20 and widens for early or late events", () => {
  assert.deepEqual(visibleHours(layoutWeek([], "2026-10-19")), { start: 7, end: 20 });
  const wide = layoutWeek([timed("e", "2026-10-19T05:30:00+07:00", "2026-10-19T22:15:00+07:00")], "2026-10-19");
  assert.deepEqual(visibleHours(wide), { start: 5, end: 23 });
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
