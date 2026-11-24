import test from "node:test";
import assert from "node:assert/strict";
import { buildEntry, createRateLimiter, fingerprintOf, messageShape, normalizeRoute, parseClientReport, redact, shouldIgnore, truncate } from "./error-log";

const JWT = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.SflKxwRJSMeKKF2QT4fwpM";

test("redact removes tokens, emails, secret-looking strings and URL queries but keeps the useful text", () => {
  assert.equal(redact(`auth failed with ${JWT}`), "auth failed with [token]");
  assert.equal(redact("Authorization: Bearer abcdef1234567890abcdef"), "Authorization: Bearer [token]");
  assert.equal(redact("mail rickie@example.com failed"), "mail [email] failed");
  assert.equal(redact("fetch https://x.supabase.co/rest/v1/todos?select=*&apikey=sb_secret_123 failed"), "fetch https://x.supabase.co/rest/v1/todos?[query] failed");
  assert.equal(redact("callback ?code=abc123&state=ok"), "callback ?code=[redacted]&state=ok");
  assert.equal(redact("key 0123456789abcdef0123456789abcdef0123 leaked"), "key [secret] leaked");
  assert.equal(redact("Could not save the task."), "Could not save the task.");
  assert.equal(redact('relation "todos" does not exist'), 'relation "todos" does not exist');
});

test("normalizeRoute drops query/hash and ids", () => {
  assert.equal(normalizeRoute("/projects/8c4d7586-b7c0-4f1c-bb9b-d9a852b0336f?tab=x#y"), "/projects/:id");
  assert.equal(normalizeRoute("/notes/12345/edit"), "/notes/:n/edit");
  assert.equal(normalizeRoute("/todos?week=2026-11-09"), "/todos");
  assert.equal(normalizeRoute("x".repeat(500)).length, 200);
});

test("fingerprints merge the same error with different data and separate different errors", () => {
  const a = fingerprintOf("server", "action /todos", "Error", 'duplicate key "a" for 12345');
  const b = fingerprintOf("server", "action /todos", "Error", 'duplicate key "zzz" for 99887');
  assert.equal(a, b);
  assert.notEqual(a, fingerprintOf("server", "action /todos", "Error", "something else entirely"));
  assert.notEqual(a, fingerprintOf("client", "action /todos", "Error", 'duplicate key "a" for 12345')); // different source
  assert.notEqual(a, fingerprintOf("server", "render /notes", "Error", 'duplicate key "a" for 12345')); // different route
  assert.equal(messageShape("id 8c4d7586-b7c0-4f1c-bb9b-d9a852b0336f"), "id <id>");
});

test("noise is ignored: redirects, 404s, aborts, ResizeObserver, script errors, extensions, client network blips", () => {
  const ignored = [
    { source: "server" as const, digest: "NEXT_REDIRECT;replace;/login;307;" },
    { source: "server" as const, message: "NEXT_NOT_FOUND" },
    { source: "client" as const, name: "AbortError", message: "The operation was aborted." },
    { source: "client" as const, message: "ResizeObserver loop completed with undelivered notifications." },
    { source: "client" as const, message: "Script error." },
    { source: "client" as const, message: "boom", stack: "at x (chrome-extension://abc/content.js:1:1)" },
    { source: "client" as const, message: "Failed to fetch" },
    { source: "client" as const, message: "Load failed" },
  ];
  for (const r of ignored) assert.equal(shouldIgnore(r), true, JSON.stringify(r));
  assert.equal(shouldIgnore({ source: "server", message: "Failed to fetch" }), false); // a server-side fetch failure IS meaningful
  assert.equal(shouldIgnore({ source: "server", message: 'relation "todos" does not exist' }), false);
});

test("buildEntry sanitises everything and returns null for ignored or empty errors", () => {
  const e = buildEntry({ source: "server", route: "render /(dashboard)/todos?week=2026-11-09", method: "get", name: "Error", message: `bad ${JWT} for rickie@example.com`, stack: "at f (/app/x.ts:1:1)", digest: "123", release: "3b061cca2b0dd22426a680d3" });
  assert.ok(e);
  assert.equal(e.message, "bad [token] for [email]");
  assert.equal(e.route, "render /(dashboard)/todos");
  assert.equal(e.method, "GET");
  assert.equal(e.release.length, 12);
  assert.ok(e.fingerprint.startsWith("server|render /(dashboard)/todos|Error|"));
  assert.equal(buildEntry({ source: "server", digest: "NEXT_REDIRECT" }), null);
  assert.equal(buildEntry({ source: "client" }), null);
  const long = buildEntry({ source: "client", message: "m".repeat(5000).replace(/m{40}/g, "m m "), stack: "s ".repeat(5000) });
  assert.ok(long && long.message.length <= 500 && long.stack.length <= 2000);
});

test("parseClientReport accepts only a sane object with strings", () => {
  assert.deepEqual(parseClientReport({ name: "TypeError", message: "x is undefined", stack: "at a", path: "/todos" }), { name: "TypeError", message: "x is undefined", stack: "at a", path: "/todos" });
  assert.equal(parseClientReport({ message: "m" })?.name, "Error");
  for (const bad of [null, undefined, "x", 1, [], {}, { message: "" }, { message: "   " }, { message: 5 }]) assert.equal(parseClientReport(bad), null, JSON.stringify(bad));
  assert.equal(parseClientReport({ message: "a".repeat(5000) })?.message.length, 1000);
});

test("rate limiter allows `max` per window and recovers afterwards", () => {
  const ok = createRateLimiter(3, 1000);
  assert.deepEqual([ok(0), ok(100), ok(200), ok(300), ok(999)], [true, true, true, false, false]);
  assert.equal(ok(1000), true); // the first one aged out
  assert.equal(truncate("abcdef", 4), "abc…");
});
