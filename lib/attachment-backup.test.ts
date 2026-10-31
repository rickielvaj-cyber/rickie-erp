import test from "node:test";
import assert from "node:assert/strict";
import { describeSummary, isSafeStoragePath, overBudget, parseManifest, projectUrl, remapPath, sha256, summarize } from "./attachment-backup";

const UID = "8c4d7586-b7c0-4f1c-bb9b-d9a852b0336f";
const OBJ = "aaaaaaaa-0000-4000-8000-000000000001";

test("projectUrl prefers SUPABASE_URL, else derives it from the session-pooler user", () => {
  assert.equal(projectUrl({ SUPABASE_URL: "https://abc.supabase.co/" }), "https://abc.supabase.co");
  assert.equal(
    projectUrl({ SUPABASE_DB_URL: "postgresql://postgres.iehtbpswdsovmcjffpyz:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" }),
    "https://iehtbpswdsovmcjffpyz.supabase.co",
  );
  assert.equal(projectUrl({ SUPABASE_DB_URL: "postgresql://postgres:pw@db.x.supabase.co:5432/postgres" }), null, "direct connection has no ref in the user");
  assert.equal(projectUrl({}), null);
});

test("isSafeStoragePath accepts <uid>/<file> only", () => {
  assert.ok(isSafeStoragePath(`${UID}/${OBJ}.png`));
  for (const bad of ["", "../x", `${UID}/../x`, `/${UID}/a.png`, `${UID}//a.png`, `${UID}/a/b.png`, `${UID}\\a.png`, "a.png", `${UID}/a b.png`, `${UID}/${"x".repeat(400)}`]) {
    assert.equal(isSafeStoragePath(bad), false, JSON.stringify(bad).slice(0, 40));
  }
});

test("remapPath swaps only the user folder", () => {
  assert.equal(remapPath(`${UID}/${OBJ}.pdf`, UID, "new-uid"), `new-uid/${OBJ}.pdf`);
  assert.equal(remapPath(`other/${OBJ}.pdf`, UID, "new-uid"), `other/${OBJ}.pdf`);
});

test("summarize and describeSummary report numbers only", () => {
  const s = summarize([
    { status: "ok", size_bytes: 1_048_576 },
    { status: "ok", size_bytes: 1_048_576 },
    { status: "missing", size_bytes: 500 },
    { status: "size_mismatch", size_bytes: 10 },
  ]);
  assert.deepEqual({ total: s.total, ok: s.ok, problems: s.problems, bytes: s.bytes }, { total: 4, ok: 2, problems: 2, bytes: 2_097_152 });
  assert.equal(describeSummary(s), "2/4 files saved (2.0 MB), 1 missing in Storage, 1 with unexpected size");
  assert.equal(describeSummary(summarize([])), "0/0 files saved (0.0 MB)");
});

test("overBudget uses the limit and falls back to the default on bad input", () => {
  assert.deepEqual(overBudget(201 * 1_048_576, undefined), { over: true, limitMb: 200 });
  assert.deepEqual(overBudget(50 * 1_048_576, "100"), { over: false, limitMb: 100 });
  assert.deepEqual(overBudget(150 * 1_048_576, "100"), { over: true, limitMb: 100 });
  assert.deepEqual(overBudget(1, "abc"), { over: false, limitMb: 200 });
});

test("sha256 is the usual hex digest", () => {
  assert.equal(sha256(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("parseManifest rejects foreign or broken files", () => {
  assert.ok(!parseManifest(null).ok);
  assert.ok(!parseManifest({ app: "x", version: 1, files: [] }).ok);
  assert.ok(!parseManifest({ app: "personal-workspace-attachments", version: 1, files: [{ storage_path: 1 }] }).ok);
  assert.ok(parseManifest({ app: "personal-workspace-attachments", version: 1, exported_at: "x", files: [] }).ok);
});
