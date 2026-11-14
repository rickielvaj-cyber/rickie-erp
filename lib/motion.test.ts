import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DEFAULT_MOTION, MOTION_INIT_SCRIPT, MOTION_KEY, motionAttribute, motionEnabled, parseMotion } from "./motion";

test("parseMotion accepts the three values and falls back to system", () => {
  for (const m of ["system", "on", "off"] as const) assert.equal(parseMotion(m), m);
  for (const bad of [null, undefined, "", "ON", "true", "reduce", "{}"]) assert.equal(parseMotion(bad), DEFAULT_MOTION, String(bad));
});

test("motionEnabled: explicit choices win over the device setting; system follows it", () => {
  assert.equal(motionEnabled("on", true), true); // the point of the switch: override "reduce motion"
  assert.equal(motionEnabled("off", false), false);
  assert.equal(motionEnabled("system", false), true);
  assert.equal(motionEnabled("system", true), false);
});

test("only an explicit choice gets an html attribute", () => {
  assert.equal(motionAttribute("system"), null);
  assert.equal(motionAttribute("on"), "on");
  assert.equal(motionAttribute("off"), "off");
});

function runInit(stored: string | null | "throws") {
  const attrs = new Map<string, string>();
  vm.runInNewContext(MOTION_INIT_SCRIPT, {
    localStorage: {
      getItem: (k: string) => {
        if (stored === "throws") throw new Error("blocked");
        return k === MOTION_KEY ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } },
  });
  return attrs.get("data-motion") ?? null;
}

test("the inline init script matches parseMotion/motionAttribute and never throws", () => {
  for (const s of ["system", "on", "off", "x", null] as const) assert.equal(runInit(s), motionAttribute(parseMotion(s)), String(s));
  assert.equal(runInit("throws"), null);
});
