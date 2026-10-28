import test from "node:test";
import assert from "node:assert/strict";
import { parseSummary, parseTidy, parseTodoItems, stripFences, tidyMarkdown } from "./ai/notes";

test("stripFences removes a code fence around JSON", () => {
  assert.equal(stripFences('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripFences('{"a":1}'), '{"a":1}');
});

test("parseTidy keeps valid fields, drops junk, validates due dates", () => {
  const r = parseTidy(
    JSON.stringify({
      summary: " Rapat soal [CLIENT_1]. ",
      decisions: ["Go-live 3 Nov", "", 5],
      actionItems: [
        { task: "Kirim draft", owner: "Rickie", due: "2026-10-30" },
        { task: "Cek data", owner: null, due: "Friday" },
        { task: "  " },
        "bad",
      ],
      openQuestions: ["Siapa PIC?"],
    }),
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.summary, "Rapat soal [CLIENT_1].");
  assert.deepEqual(r.value.decisions, ["Go-live 3 Nov"]);
  assert.deepEqual(r.value.actionItems, [
    { task: "Kirim draft", owner: "Rickie", due: "2026-10-30" },
    { task: "Cek data", owner: null, due: null },
  ]);
});

test("parseTidy and parseSummary reject unreadable or empty answers", () => {
  assert.ok(!parseTidy("not json").ok);
  assert.ok(!parseTidy("{}").ok);
  assert.ok(!parseSummary("[]").ok);
  const s = parseSummary('{"summary":"Ok","keyPoints":["a","b"]}');
  assert.ok(s.ok && s.value.keyPoints.length === 2);
});

test("tidyMarkdown restores placeholders and omits empty sections", () => {
  const restore = (s: string) => s.replace("[CLIENT_1]", "PT Foo");
  const md = tidyMarkdown(
    { summary: "Rapat dengan [CLIENT_1].", decisions: [], actionItems: [{ task: "Kirim ke [CLIENT_1]", owner: "Rickie", due: "2026-10-30" }], openQuestions: [] },
    restore,
  );
  assert.equal(md, "## Summary\nRapat dengan PT Foo.\n\n## Action items\n- [ ] Kirim ke PT Foo (Rickie, due 2026-10-30)");
});

test("parseTodoItems validates browser input", () => {
  assert.deepEqual(parseTodoItems([{ title: " A ", dueDate: "2026-10-30" }, { title: "B", dueDate: "x" }, { title: "" }, null]), [
    { title: "A", dueDate: "2026-10-30" },
    { title: "B", dueDate: null },
  ]);
  assert.deepEqual(parseTodoItems("x"), []);
  assert.equal(parseTodoItems(Array.from({ length: 30 }, (_, i) => ({ title: `t${i}` }))).length, 20);
});
