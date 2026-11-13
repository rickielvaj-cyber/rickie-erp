import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { DEFAULT_THEME, THEME_INIT_SCRIPT, THEME_KEY, isDark, parseTheme, themeAttribute } from "./theme";

test("parseTheme accepts the three themes and falls back to system for anything else", () => {
  for (const t of ["system", "light", "dark"] as const) assert.equal(parseTheme(t), t);
  for (const bad of [null, undefined, "", "Dark", "auto", "blue", "{}"]) assert.equal(parseTheme(bad), DEFAULT_THEME, String(bad));
});

test("isDark: explicit choices win over the device setting; system follows it", () => {
  assert.equal(isDark("dark", false), true);
  assert.equal(isDark("light", true), false);
  assert.equal(isDark("system", true), true);
  assert.equal(isDark("system", false), false);
});

test("only an explicit choice gets an html attribute", () => {
  assert.equal(themeAttribute("system"), null);
  assert.equal(themeAttribute("light"), "light");
  assert.equal(themeAttribute("dark"), "dark");
});

// The init script runs before paint in the browser; run it here in a fake DOM to make sure it matches parseTheme/themeAttribute.
function runInit(stored: string | null | "throws") {
  const attrs = new Map<string, string>();
  const ctx = {
    localStorage: {
      getItem: (k: string) => {
        if (stored === "throws") throw new Error("blocked");
        return k === THEME_KEY ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v) } },
  };
  vm.runInNewContext(THEME_INIT_SCRIPT, ctx);
  return attrs.get("data-theme") ?? null;
}

test("the inline init script sets data-theme for light/dark only and never throws (blocked storage, garbage)", () => {
  assert.equal(runInit("dark"), "dark");
  assert.equal(runInit("light"), "light");
  assert.equal(runInit("system"), null);
  assert.equal(runInit(null), null);
  assert.equal(runInit("purple"), null);
  assert.equal(runInit("throws"), null);
  for (const t of ["system", "light", "dark", "x", null] as const) assert.equal(runInit(t), themeAttribute(parseTheme(t)));
});
