import test from "node:test";
import assert from "node:assert/strict";
import { NOTE_MAX_CHARS, displayTitle, isNoteId, noteSnippet, noteTitle, parseNoteInput } from "./notes";
import { noteDocs } from "./search/note-index";

test("noteTitle is the first non-empty line without markdown markers, trimmed to 80 characters", () => {
  assert.equal(noteTitle("Meeting PT X\nline two"), "Meeting PT X");
  assert.equal(noteTitle("\n\n   # Heading with   spaces  \nrest"), "Heading with spaces");
  assert.equal(noteTitle("- bullet first"), "bullet first");
  assert.equal(noteTitle("   \n \n"), "");
  assert.equal(noteTitle(""), "");
  const long = noteTitle("x".repeat(200));
  assert.equal(long.length, 80);
  assert.ok(long.endsWith("…"));
});

test("noteSnippet skips the title line and joins the rest on one line", () => {
  assert.equal(noteSnippet("Title\nsecond line\n\nthird"), "second line third");
  assert.equal(noteSnippet("Only title"), "");
  assert.equal(noteSnippet(""), "");
  assert.equal(noteSnippet("T\n" + "a".repeat(300), 50).length, 50);
});

test("displayTitle falls back for empty titles", () => {
  assert.equal(displayTitle(""), "Untitled note");
  assert.equal(displayTitle("  "), "Untitled note");
  assert.equal(displayTitle("Hi"), "Hi");
});

test("parseNoteInput validates body length and client id and normalizes line endings", () => {
  const ok = parseNoteInput({ body: "a\r\nb", clientId: "" });
  assert.ok(ok.ok && ok.value.body === "a\nb" && ok.value.clientId === null);
  const withClient = parseNoteInput({ body: "x", clientId: "00000000-0000-4000-8000-0000000000c1" });
  assert.ok(withClient.ok && withClient.value.clientId === "00000000-0000-4000-8000-0000000000c1");
  assert.ok(parseNoteInput({ body: "" }).ok);
  assert.ok(!parseNoteInput({ body: 5 }).ok);
  assert.ok(!parseNoteInput(null).ok);
  assert.ok(!parseNoteInput({ body: "x".repeat(NOTE_MAX_CHARS + 1) }).ok);
  assert.ok(!parseNoteInput({ body: "x", clientId: "not-a-uuid" }).ok);
  assert.ok(isNoteId("00000000-0000-4000-8000-0000000000c1"));
  assert.ok(!isNoteId("nope") && !isNoteId(null));
});

test("noteDocs makes one chunk per ~1500 characters, titled, with the client name in the text", () => {
  const short = noteDocs({ id: "n1", user_id: "u", title: "Rapat Edot", body: "Rapat Edot\nbahas blueprint", clientName: "PT Edot" });
  assert.equal(short.length, 1);
  assert.equal(short[0].sourceType, "note");
  assert.equal(short[0].urlPath, "/notes/n1");
  assert.equal(short[0].title, "Rapat Edot");
  assert.ok(short[0].excerpt.includes("Client: PT Edot."));
  assert.ok(short[0].excerpt.includes("bahas blueprint"));
  const untitled = noteDocs({ id: "n2", user_id: "u", title: "", body: "", clientName: null });
  assert.equal(untitled[0].title, "Untitled note");
  const long = noteDocs({ id: "n3", user_id: "u", title: "Long", body: "kata ".repeat(2000), clientName: null });
  assert.ok(long.length > 1 && long.length <= 8);
  assert.deepEqual(long.map((d) => d.chunkIndex), long.map((_, i) => i));
});
