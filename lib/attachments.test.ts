import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ATTACHMENT_BYTES,
  checkFile,
  cleanFileName,
  extensionOf,
  formatSize,
  isOwnPath,
  mimeForName,
  scaledSize,
  shouldCompress,
  storagePath,
} from "./attachments";

const UID = "8c4d7586-b7c0-4f1c-bb9b-d9a852b0336f";
const FID = "11111111-2222-4333-8444-555555555555";

test("extension decides the MIME type; SVG and executables are refused", () => {
  assert.equal(mimeForName("shot.PNG"), "image/png");
  assert.equal(mimeForName("report.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(mimeForName("a.b.pdf"), "application/pdf");
  for (const bad of ["x.svg", "x.html", "x.exe", "x.js", "x", "x."]) assert.equal(mimeForName(bad), null, bad);
  assert.equal(extensionOf("noext"), "");
});

test("checkFile enforces type, size and name", () => {
  assert.deepEqual(checkFile("a.png", 1000), { ok: true, fileName: "a.png", mime: "image/png" });
  assert.ok(!checkFile("a.exe", 1000).ok);
  assert.ok(!checkFile("a.png", 0).ok);
  assert.ok(!checkFile("a.png", MAX_ATTACHMENT_BYTES + 1).ok);
  assert.ok(checkFile("a.png", MAX_ATTACHMENT_BYTES).ok);
  assert.ok(!checkFile("   ", 10).ok);
  assert.ok(!checkFile("a.png", Number.NaN).ok);
});

test("cleanFileName strips paths and control characters and shortens long names keeping the extension", () => {
  assert.equal(cleanFileName("C:\\Users\\me\\Screen Shot.png"), "Screen Shot.png");
  assert.equal(cleanFileName("../../etc/passwd.txt"), "passwd.txt");
  assert.equal(cleanFileName('a<b>"c".png'), "abc.png");
  const long = cleanFileName("x".repeat(300) + ".pdf");
  assert.ok(long.length <= 120 && long.endsWith(".pdf") && long.includes("…"));
});

test("only <own user id>/<uuid>.<allowed ext> may be registered", () => {
  assert.ok(isOwnPath(storagePath(UID, FID, "png"), UID));
  assert.ok(!isOwnPath(storagePath(FID, FID, "png"), UID), "other user's folder");
  assert.ok(!isOwnPath(`${UID}/../${UID}/x.png`, UID));
  assert.ok(!isOwnPath(`${UID}/${FID}.svg`, UID));
  assert.ok(!isOwnPath(`${UID}/sub/${FID}.png`, UID));
  assert.ok(!isOwnPath(`${UID}/not-a-uuid.png`, UID));
});

test("formatSize", () => {
  assert.equal(formatSize(500), "500 B");
  assert.equal(formatSize(2048), "2 KB");
  assert.equal(formatSize(1.5 * 1024 * 1024), "1.5 MB");
});

test("scaledSize keeps the ratio and only shrinks", () => {
  assert.deepEqual(scaledSize(1000, 800), { width: 1000, height: 800, scaled: false });
  assert.deepEqual(scaledSize(4000, 2000), { width: 2000, height: 1000, scaled: true });
  assert.deepEqual(scaledSize(1500, 3000), { width: 1000, height: 2000, scaled: true });
});

test("shouldCompress: big or huge images yes, small ones, GIFs and documents no", () => {
  assert.equal(shouldCompress("image/png", 3 * 1024 * 1024, 1000, 800), true);
  assert.equal(shouldCompress("image/png", 100 * 1024, 3000, 800), true);
  assert.equal(shouldCompress("image/png", 100 * 1024, 1000, 800), false);
  assert.equal(shouldCompress("image/gif", 9 * 1024 * 1024, 4000, 4000), false);
  assert.equal(shouldCompress("application/pdf", 9 * 1024 * 1024, 0, 0), false);
});
