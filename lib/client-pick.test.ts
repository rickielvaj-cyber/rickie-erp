import test from "node:test";
import assert from "node:assert/strict";
import { exactClient, filterClients, type PickOption } from "./client-pick";

const opts: PickOption[] = [
  { id: "1", name: "PT WANXINDA INDONESIA", kind: "client", aliases: [] },
  { id: "2", name: "PT SEMARAK BERSAMA INDONESIA", kind: "client", aliases: ["Semarak"] },
  { id: "3", name: "Edot", kind: "partner", aliases: ["PT Edot Indonesia"] },
  { id: "4", name: "Weefer Partner", kind: "partner", aliases: ["Weefer"] },
];

test("empty query returns everything, sorted by name", () => {
  assert.deepEqual(filterClients(opts, "").map((o) => o.id), ["3", "2", "1", "4"]);
  assert.deepEqual(filterClients(opts, "   ").length, 4);
});

test("all words must match, in any order, ignoring case and punctuation", () => {
  assert.deepEqual(filterClients(opts, "wanx indo").map((o) => o.id), ["1"]);
  assert.deepEqual(filterClients(opts, "INDONESIA pt").map((o) => o.id), ["3", "2", "1"].filter((id) => ["1", "2", "3"].includes(id)));
  assert.deepEqual(filterClients(opts, "p.t. wanxinda").map((o) => o.id), ["1"]);
  assert.deepEqual(filterClients(opts, "zzz"), []);
});

test("aliases match too, and names that start with the query come first", () => {
  assert.deepEqual(filterClients(opts, "weefer").map((o) => o.id), ["4"]);
  assert.deepEqual(filterClients(opts, "semarak").map((o) => o.id), ["2"]);
  assert.deepEqual(filterClients(opts, "edot")[0].id, "3");
  assert.equal(filterClients(opts, "pt")[0].name.startsWith("PT"), true);
});

test("exactClient needs the full name", () => {
  assert.equal(exactClient(opts, "edot")?.id, "3");
  assert.equal(exactClient(opts, "  PT  wanxinda indonesia ")?.id, "1");
  assert.equal(exactClient(opts, "wanx"), null);
  assert.equal(exactClient(opts, ""), null);
});
