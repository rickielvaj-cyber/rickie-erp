import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AiError, DEFAULT_TEXT_MODEL, generateText, textModel } from "./ai/gemini-text";

async function withServer<T>(
  handler: (req: { url: string; key?: string; body: Record<string, unknown> }) => { status: number; body: unknown },
  run: (seen: { url: string; key?: string; body: Record<string, unknown> }[]) => Promise<T>,
): Promise<T> {
  const seen: { url: string; key?: string; body: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const entry = { url: req.url ?? "", key: req.headers["x-goog-api-key"] as string | undefined, body: JSON.parse(raw) };
      seen.push(entry);
      const out = handler(entry);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    return await run(seen);
  } finally {
    delete process.env.GEMINI_BASE_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_TEXT_MODEL;
    await new Promise((resolve) => server.close(resolve));
  }
}

const reply = (text: string, finishReason = "STOP") => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] }, finishReason }] } });

test("sends system + prompt with the key in a header and returns the text", async () => {
  await withServer(() => reply('{"ok":true}'), async (seen) => {
    const text = await generateText({ system: "SYS", prompt: "PROMPT", json: true });
    assert.equal(text, '{"ok":true}');
    assert.equal(seen[0].url, `/v1beta/models/${DEFAULT_TEXT_MODEL}:generateContent`);
    assert.equal(seen[0].key, "test-key");
    const b = seen[0].body as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[]; generationConfig: { responseMimeType?: string } };
    assert.equal(b.systemInstruction.parts[0].text, "SYS");
    assert.equal(b.contents[0].parts[0].text, "PROMPT");
    assert.equal(b.generationConfig.responseMimeType, "application/json");
  });
});

test("GEMINI_TEXT_MODEL overrides the model", async () => {
  await withServer(() => reply("hi"), async (seen) => {
    process.env.GEMINI_TEXT_MODEL = "my-model";
    assert.equal(textModel(), "my-model");
    await generateText({ system: "s", prompt: "p" });
    assert.ok(seen[0].url.includes("/models/my-model:generateContent"));
  });
});

test("429 is rateLimited, 404 mentions the model, blocked and empty answers are errors", async () => {
  await withServer(() => ({ status: 429, body: { error: { message: "Please retry in 12s" } } }), async () => {
    await assert.rejects(generateText({ system: "s", prompt: "p" }), (e: unknown) => e instanceof AiError && e.rateLimited);
  });
  await withServer(() => ({ status: 404, body: { error: { message: "not found" } } }), async () => {
    await assert.rejects(generateText({ system: "s", prompt: "p" }), /GEMINI_TEXT_MODEL/);
  });
  await withServer(() => ({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }), async () => {
    await assert.rejects(generateText({ system: "s", prompt: "p" }), /SAFETY/);
  });
  await withServer(() => ({ status: 200, body: { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] } }), async () => {
    await assert.rejects(generateText({ system: "s", prompt: "p" }), /no text/);
  });
  await withServer(() => reply('{"summary":"cut', "MAX_TOKENS"), async () => {
    await assert.rejects(generateText({ system: "s", prompt: "p", json: true }), /cut off/);
  });
});

test("missing key fails before any request", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(generateText({ system: "s", prompt: "p" }), /GEMINI_API_KEY is not set/);
});
