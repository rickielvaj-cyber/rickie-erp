import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { EMBED_BATCH_SIZE, EmbeddingError, embedBatch, embedQuery, normalize, readApiError } from "./search/gemini";
import { EMBEDDING_DIMENSIONS } from "./search/text";

type Seen = { url: string; key: string | undefined; body: { requests: Record<string, unknown>[] } };

async function withServer<T>(
  handler: (seen: Seen, call: number) => { status: number; body: unknown; headers?: Record<string, string> },
  run: (seen: Seen[]) => Promise<T>,
): Promise<T> {
  const seen: Seen[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const entry: Seen = { url: req.url ?? "", key: req.headers["x-goog-api-key"] as string | undefined, body: JSON.parse(raw) };
      seen.push(entry);
      const out = handler(entry, seen.length);
      res.writeHead(out.status, { "content-type": "application/json", ...out.headers });
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
    await new Promise((resolve) => server.close(resolve));
  }
}

const vec = (seed: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === seed ? 3 : 0));
const ok = (n: number) => ({ status: 200, body: { embeddings: Array.from({ length: n }, (_, i) => ({ values: vec(i) })) } });

test("normalize gives unit length and leaves a zero vector alone", () => {
  const v = normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
  assert.deepEqual(normalize([0, 0]), [0, 0]);
});

test("embedBatch sends the documented batchEmbedContents request and parses the response", async () => {
  await withServer(
    () => ok(2),
    async (seen) => {
      const out = await embedBatch(["a", "b"], "RETRIEVAL_DOCUMENT");
      assert.equal(out.length, 2);
      assert.ok(Math.abs(Math.hypot(...out[0]) - 1) < 1e-9, "vectors are normalized");
      assert.equal(seen[0].url, "/v1beta/models/gemini-embedding-001:batchEmbedContents");
      assert.equal(seen[0].key, "test-key", "key travels in the x-goog-api-key header");
      assert.ok(!seen[0].url.includes("test-key"), "key is not in the URL");
      const [first] = seen[0].body.requests;
      assert.equal(first.model, "models/gemini-embedding-001");
      assert.equal(first.taskType, "RETRIEVAL_DOCUMENT");
      assert.equal(first.outputDimensionality, EMBEDDING_DIMENSIONS);
      assert.deepEqual(first.content, { parts: [{ text: "a" }] });
    },
  );
});

test("embedQuery uses the query task type", async () => {
  await withServer(
    () => ok(1),
    async (seen) => {
      const v = await embedQuery("voucher");
      assert.equal(v.length, EMBEDDING_DIMENSIONS);
      assert.equal(seen[0].body.requests[0].taskType, "RETRIEVAL_QUERY");
    },
  );
});

test("a 429 is retried once (honouring Retry-After), then reported as rateLimited", async () => {
  await withServer(
    () => ({ status: 429, body: { error: { message: "quota" } }, headers: { "retry-after": "1" } }),
    async (seen) => {
      await assert.rejects(embedBatch(["a"], "RETRIEVAL_DOCUMENT"), (e: unknown) => e instanceof EmbeddingError && e.rateLimited);
      assert.equal(seen.length, 2, "one retry, no more");
    },
  );
});

test("auth errors are not rateLimited and carry a hint; bad response shapes are rejected", async () => {
  await withServer(
    () => ({ status: 400, body: { error: { message: "API key not valid" } } }),
    async () => {
      await assert.rejects(embedBatch(["a"], "RETRIEVAL_DOCUMENT"), (e: unknown) => e instanceof EmbeddingError && !e.rateLimited && /GEMINI_API_KEY/.test(e.message));
    },
  );
  await withServer(
    () => ({ status: 200, body: { embeddings: [{ values: [1, 2, 3] }] } }),
    async () => {
      await assert.rejects(embedBatch(["a"], "RETRIEVAL_DOCUMENT"), /Unexpected response/);
    },
  );
});

test("guards: missing key, oversized batch, empty input", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(embedBatch(["a"], "RETRIEVAL_DOCUMENT"), /GEMINI_API_KEY is not set/);
  process.env.GEMINI_API_KEY = "k";
  await assert.rejects(embedBatch(Array(EMBED_BATCH_SIZE + 1).fill("x"), "RETRIEVAL_DOCUMENT"), /Too many texts/);
  assert.deepEqual(await embedBatch([], "RETRIEVAL_DOCUMENT"), []);
  delete process.env.GEMINI_API_KEY;
});

const quota429 = (message: string) => ({ status: 429, body: { error: { message } } });

test("with a deadline, 429 waits for the delay Google suggests and then succeeds", async () => {
  await withServer(
    (_s, call) => (call <= 2 ? quota429("You exceeded your current quota. Please retry in 0.2s.") : ok(1)),
    async (seen) => {
      const started = Date.now();
      const out = await embedBatch(["a"], "RETRIEVAL_DOCUMENT", { deadline: Date.now() + 60_000 });
      assert.equal(out.length, 1);
      assert.equal(seen.length, 3, "two 429s, then success");
      assert.ok(Date.now() - started >= 1000, "it really waited (0.2s + margin, twice)");
    },
  );
});

test("with a deadline that cannot fit the suggested wait, it gives up at once as rateLimited", async () => {
  await withServer(
    () => quota429("Please retry in 30s."),
    async (seen) => {
      const started = Date.now();
      await assert.rejects(
        embedBatch(["a"], "RETRIEVAL_DOCUMENT", { deadline: Date.now() + 5_000 }),
        (e: unknown) => e instanceof EmbeddingError && e.rateLimited,
      );
      assert.equal(seen.length, 1, "no pointless wait or retry");
      assert.ok(Date.now() - started < 2_000);
    },
  );
});

test("readApiError reads the retry delay from RetryInfo, from the message, and from Retry-After (which wins)", async () => {
  const resp = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status: 429, headers: { "content-type": "application/json", ...headers } });

  const detail = await readApiError(resp({ error: { message: "quota", details: [{ "@type": "x" }, { retryDelay: "12s" }] } }));
  assert.equal(detail.retryDelayMs, 12_000);

  const msg = await readApiError(resp({ error: { message: "Quota exceeded for metric … limit: 100 … Please retry in 12.675591601s." } }));
  assert.ok(Math.abs((msg.retryDelayMs ?? 0) - 12_675.6) < 1);

  const header = await readApiError(resp({ error: { message: "Please retry in 12s" } }, { "retry-after": "3" }));
  assert.equal(header.retryDelayMs, 3_000);

  const none = await readApiError(resp({ error: { message: "quota" } }));
  assert.equal(none.retryDelayMs, null);
  assert.equal((await readApiError(new Response("not json", { status: 500 }))).message, "");
});
