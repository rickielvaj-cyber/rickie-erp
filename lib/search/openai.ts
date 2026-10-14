import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./text";

// OPENAI_BASE_URL hanya untuk pengujian lokal dengan server tiruan; produksi memakai alamat resmi.
const endpoint = () => `${process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ?? "https://api.openai.com/v1"}/embeddings`;
// Satu permintaan boleh memuat banyak teks; 64 menjaga ukuran permintaan tetap kecil.
const BATCH_SIZE = 64;

export class EmbeddingError extends Error {}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function embedBatch(texts: string[], apiKey: string, timeoutMs: number): Promise<number[][]> {
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new EmbeddingError(timedOut ? "OpenAI did not respond in time." : "Could not reach OpenAI.");
  }

  if (!response.ok) {
    // Pesan galat OpenAI tidak memuat kunci; tetap hanya ambil bagian message-nya.
    let detail = "";
    try {
      detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* body bukan JSON */
    }
    const hint =
      response.status === 401
        ? "Check OPENAI_API_KEY."
        : response.status === 429
          ? "Rate limit or no credit left on the OpenAI account."
          : "";
    throw new EmbeddingError(`OpenAI error ${response.status}. ${hint} ${detail}`.trim());
  }

  const json = (await response.json()) as { data?: { index: number; embedding: number[] }[] };
  const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
  if (data.length !== texts.length || data.some((d) => d.embedding.length !== EMBEDDING_DIMENSIONS)) {
    throw new EmbeddingError("Unexpected response from OpenAI (wrong number or size of embeddings).");
  }
  return data.map((d) => d.embedding);
}

/** Embedding untuk banyak teks (urutan hasil = urutan masukan). */
export async function embedTexts(texts: string[], opts: { timeoutMs?: number } = {}): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new EmbeddingError("OPENAI_API_KEY is not set.");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), apiKey, opts.timeoutMs ?? 30_000)));
  }
  return out;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query], { timeoutMs: 10_000 });
  return vector;
}
