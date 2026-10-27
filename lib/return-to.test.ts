import test from "node:test";
import assert from "node:assert/strict";
import { returnLabel, safeReturnPath, withFrom, withParam } from "./return-to";

test("safeReturnPath accepts only relative paths on this site", () => {
  assert.equal(safeReturnPath("/projects/abc"), "/projects/abc");
  assert.equal(safeReturnPath("/projects?new=1&client=x"), "/projects?new=1&client=x");
  assert.equal(safeReturnPath("/"), "/");
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "projects", "", null, undefined, "/a\nb", "/" + "x".repeat(400)]) {
    assert.equal(safeReturnPath(bad as string | null | undefined), null, String(bad));
  }
});

test("withFrom keeps the existing query and ignores unsafe values", () => {
  assert.equal(withFrom("/todos?edit=1", "/projects/p1"), "/todos?edit=1&from=%2Fprojects%2Fp1");
  assert.equal(withFrom("/clients", "/projects?new=1"), "/clients?from=%2Fprojects%3Fnew%3D1");
  assert.equal(withFrom("/clients", "https://evil.com"), "/clients");
  assert.equal(withFrom("/clients", null), "/clients");
});

test("withParam appends with ? or &", () => {
  assert.equal(withParam("/projects", "client", "a b"), "/projects?client=a%20b");
  assert.equal(withParam("/projects?new=1", "client", "x"), "/projects?new=1&client=x");
});

test("returnLabel names the destination", () => {
  assert.equal(returnLabel("/projects/abc"), "Project");
  assert.equal(returnLabel("/projects?new=1"), "Projects");
  assert.equal(returnLabel("/projects"), "Projects");
  assert.equal(returnLabel("/todos?week=2026-10-19"), "To-Do List");
  assert.equal(returnLabel("/issues"), "Issue Log");
  assert.equal(returnLabel("/somewhere"), "Back");
  assert.equal(returnLabel(null), "Back");
});
