import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./text";

// GEMINI_BASE_URL hanya untuk pengujian lokal dengan server tiruan; produksi memakai alamat resmi.
const baseUrl = () => process.env.GEMINI_BASE_URL?.replace(/\/$/, "") ?? "https://generativelanguage.googleapis.com/v1beta";

/** Berapa teks per permintaan. Kecil sengaja: aman dari batas ukuran dan 429 hanya mengulang satu potong. */
export const EMBED_BATCH_SIZE = 20;

export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export class EmbeddingError extends Error {
  constructor(
    message: string,
    /** true = kuota/laju habis (429): wajar berhenti dan lanjut nanti, bukan galat konfigurasi. */
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

export function hasEmbeddingKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Dimensi < 3072 tidak dinormalisasi oleh API (menurut panduan Gemini). Jarak kosinus pgvector tidak
 * terpengaruh skala, tapi menormalkan di sini membuat vektor yang tersimpan konsisten dan aman bila
 * suatu hari dipakai operator lain.
 */
export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? vector : vector.map((x) => x / norm);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path: string, body: unknown, apiKey: string, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      // Kunci lewat header, bukan query string, supaya tidak tercatat di log URL.
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new EmbeddingError(timedOut ? "The embedding service did not respond in time." : "Could not reach the embedding service.");
  }
}

async function failure(response: Response): Promise<EmbeddingError> {
  let detail = "";
  try {
    detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    /* body bukan JSON */
  }
  if (response.status === 429) {
    return new EmbeddingError(`Gemini free quota reached (error 429). ${detail}`.trim(), true);
  }
  const hint =
    response.status === 400 || response.status === 403
      ? "Check GEMINI_API_KEY (create one in Google AI Studio)."
      : response.status === 404
        ? `Model ${EMBEDDING_MODEL} not found.`
        : "";
  return new EmbeddingError(`Gemini error ${response.status}. ${hint} ${detail}`.trim());
}

/**
 * Satu permintaan batch (maks. EMBED_BATCH_SIZE teks). 429 dicoba ulang sekali setelah jeda singkat
 * (Retry-After bila ada, dibatasi); jika masih 429, dilempar sebagai rateLimited supaya pemanggil
 * bisa berhenti dengan rapi dan melanjutkan nanti.
 */
export async function embedBatch(texts: string[], taskType: TaskType, opts: { timeoutMs?: number } = {}): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new EmbeddingError("GEMINI_API_KEY is not set.");
  if (texts.length === 0) return [];
  if (texts.length > EMBED_BATCH_SIZE) throw new EmbeddingError(`Too many texts in one request (max ${EMBED_BATCH_SIZE}).`);

  const body = {
    requests: texts.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })),
  };

  let response = await post(`/models/${EMBEDDING_MODEL}:batchEmbedContents`, body, apiKey, opts.timeoutMs ?? 30_000);
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5_000, 15_000));
    response = await post(`/models/${EMBEDDING_MODEL}:batchEmbedContents`, body, apiKey, opts.timeoutMs ?? 30_000);
  }
  if (!response.ok) throw await failure(response);

  const json = (await response.json()) as { embeddings?: { values?: number[] }[] };
  const embeddings = json.embeddings ?? [];
  if (embeddings.length !== texts.length || embeddings.some((e) => e.values?.length !== EMBEDDING_DIMENSIONS)) {
    throw new EmbeddingError("Unexpected response from Gemini (wrong number or size of embeddings).");
  }
  return embeddings.map((e) => normalize(e.values as number[]));
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedBatch([query], "RETRIEVAL_QUERY", { timeoutMs: 10_000 });
  return vector;
}
