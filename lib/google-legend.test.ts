import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGEND_NAME_MAX, SUGGESTED_LEGEND, cleanLegendName, legendFromInputs, legendLabel, parseLegend } from "./google/legend";
import { EVENT_COLORS } from "./google/color";

test("cleanLegendName tidies spaces, drops control characters and limits the length", () => {
  assert.equal(cleanLegendName("  Very   urgent  "), "Very urgent");
  assert.equal(cleanLegendName("a\u0000b\nc"), "a b c");
  assert.equal(cleanLegendName("x".repeat(100)).length, LEGEND_NAME_MAX);
  assert.equal(cleanLegendName(5), "");
  assert.equal(cleanLegendName("   "), "");
});

test("parseLegend keeps only known colors with usable names and survives broken input", () => {
  assert.deepEqual(parseLegend(null), {});
  assert.deepEqual(parseLegend("not json"), {});
  assert.deepEqual(parseLegend("[1,2]"), {});
  assert.deepEqual(parseLegend(JSON.stringify({ "11": " Urgent ", "99": "Nope", "5": "", "3": 7 })), { "11": "Urgent" });
});

test("legendFromInputs drops empty names", () => {
  assert.deepEqual(legendFromInputs({ "11": "Urgent", "10": "  ", "7": "Meeting" }), { "11": "Urgent", "7": "Meeting" });
});

test("the suggested legend only uses real colors and short names", () => {
  const ids = new Set(EVENT_COLORS.map((c) => c.id));
  for (const [id, name] of Object.entries(SUGGESTED_LEGEND)) {
    assert.ok(ids.has(id), id);
    assert.ok(name.length > 0 && name.length <= LEGEND_NAME_MAX, name);
  }
});

test("legendLabel prefers the user's meaning and falls back to the Google color name", () => {
  assert.equal(legendLabel({ "11": "Urgent" }, "11"), "Urgent");
  assert.equal(legendLabel({}, "11"), "Tomato");
  assert.equal(legendLabel({}, "zzz"), "");
});

test("legendFromObject cleans any object (e.g. a database jsonb value) the same way as parseLegend", async () => {
  const { legendFromObject, legendsEqual } = await import("./google/legend");
  assert.deepEqual(legendFromObject({ "11": " Urgent ", "99": "Nope", "5": "" }), { "11": "Urgent" });
  assert.deepEqual(legendFromObject(null), {});
  assert.deepEqual(legendFromObject([1]), {});
  assert.deepEqual(legendFromObject("x"), {});
  assert.equal(legendsEqual({ "11": "Urgent" }, { "11": "Urgent" }), true);
  assert.equal(legendsEqual({ "11": "Urgent" }, { "11": "Urgent", "5": "Waiting" }), false);
  assert.equal(legendsEqual({}, {}), true);
});
