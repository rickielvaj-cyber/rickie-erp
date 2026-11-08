import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBlockInput } from "./google/block";
import { normalizeEvent } from "./google/calendar";
import { EVENT_COLORS, colorOf, colorStyle, parseColor } from "./google/color";

test("there are 11 distinct Google event colors with valid hex values", () => {
  assert.equal(EVENT_COLORS.length, 11);
  assert.equal(new Set(EVENT_COLORS.map((c) => c.id)).size, 11);
  for (const c of EVENT_COLORS) assert.match(c.hex, /^#[0-9a-f]{6}$/);
  assert.equal(colorOf("11")?.name, "Tomato");
  assert.equal(colorOf("99"), undefined);
});

test("parseColor: undefined keeps the color, empty means default, 1-11 is a color, anything else is invalid", () => {
  assert.equal(parseColor(undefined), undefined);
  assert.equal(parseColor(""), "");
  assert.equal(parseColor("5"), "5");
  assert.equal(parseColor("12"), null);
  assert.equal(parseColor("0"), null);
  assert.equal(parseColor("red"), null);
  assert.equal(parseColor(7), null);
});

test("parseBlockInput carries the color and rejects an invalid one", () => {
  const base = { title: "UAT", date: "2026-11-10", start: "09:00", end: "10:00" };
  assert.equal(parseBlockInput(base).ok && "color" in (parseBlockInput(base) as { value: object }).value, false, "no color field = unchanged");
  const withColor = parseBlockInput({ ...base, color: "11" });
  assert.equal(withColor.ok && withColor.value.color, "11");
  const cleared = parseBlockInput({ ...base, color: "" });
  assert.equal(cleared.ok && cleared.value.color, "");
  assert.equal(parseBlockInput({ ...base, color: "abc" }).ok, false);
});

test("normalizeEvent keeps the Google colorId and omits it when absent", () => {
  const raw = { id: "e1", summary: "A", start: { dateTime: "2026-11-10T09:00:00+07:00" }, end: { dateTime: "2026-11-10T10:00:00+07:00" } };
  assert.equal(normalizeEvent({ ...raw, colorId: "10" })?.colorId, "10");
  assert.equal(normalizeEvent(raw) && "colorId" in normalizeEvent(raw)!, false);
});

test("colorStyle gives a soft fill and a solid left bar, and nothing for the default color", () => {
  const s = colorStyle("11")!;
  assert.equal(s.borderLeftColor, "#d50000");
  assert.equal(s.backgroundColor, "#d5000026");
  assert.equal(colorStyle("11", true)!.backgroundColor, "#d5000012");
  assert.equal(colorStyle(undefined), undefined);
  assert.equal(colorStyle("99"), undefined);
});
