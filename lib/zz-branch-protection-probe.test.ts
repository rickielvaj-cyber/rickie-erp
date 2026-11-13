// SEMENTARA, hanya untuk menguji branch protection: tes ini SENGAJA gagal. PR yang memuatnya TIDAK boleh di-merge dan akan ditutup.
import test from "node:test";
import assert from "node:assert/strict";

test("branch protection probe: this test fails on purpose", () => {
  assert.equal(1, 2);
});
