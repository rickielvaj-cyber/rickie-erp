import test from "node:test";
import assert from "node:assert/strict";
import { shouldPauseRefresh, type RefreshGuard } from "./auto-refresh";

const idle: RefreshGuard = { activeTag: "BODY", activeEditable: false, search: "", pauseParams: ["new", "edit"], hasPauseElement: false, pointerDown: false };

test("idle page refreshes", () => {
  assert.equal(shouldPauseRefresh(idle), false);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: null }), false);
  assert.equal(shouldPauseRefresh({ ...idle, search: "?show=open&week=2026-10-26" }), false);
});

test("typing in a text field, textarea or editable area pauses", () => {
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "INPUT", activeType: "text" }), true);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "INPUT", activeType: "search" }), true);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "INPUT" }), true, "unknown type counts as text");
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "textarea" }), true);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "DIV", activeEditable: true }), true);
});

test("checkboxes, buttons and selects keep focus after a click but do not pause", () => {
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "INPUT", activeType: "checkbox" }), false);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "INPUT", activeType: "radio" }), false);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "BUTTON" }), false);
  assert.equal(shouldPauseRefresh({ ...idle, activeTag: "SELECT" }), false);
});

test("an open form (new/edit in the URL) pauses", () => {
  assert.equal(shouldPauseRefresh({ ...idle, search: "?new=1" }), true);
  assert.equal(shouldPauseRefresh({ ...idle, search: "?show=open&edit=123" }), true);
  assert.equal(shouldPauseRefresh({ ...idle, search: "?edit=1", pauseParams: [] }), false);
});

test("pause markers and dragging pause", () => {
  assert.equal(shouldPauseRefresh({ ...idle, hasPauseElement: true }), true);
  assert.equal(shouldPauseRefresh({ ...idle, pointerDown: true }), true);
});
