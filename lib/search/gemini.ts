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

type ApiError = { status: number; message: string; retryDelayMs: number | null };

/**
 * Baca galat Gemini. Jeda ulang untuk 429 diambil dari header Retry-After, dari detail RetryInfo
 * ("retryDelay": "12s"), atau dari kalimat pesannya ("Please retry in 12.67s"); null bila tidak ada.
 */
export async function readApiError(response: Response): Promise<ApiError> {
  let message = "";
  let retryDelayMs: number | null = null;
  try {
    const json = (await response.json()) as { error?: { message?: string; details?: { retryDelay?: string }[] } };
    message = json.error?.message ?? "";
    const detail = json.error?.details?.find((d) => typeof d.retryDelay === "string")?.retryDelay;
    const fromDetail = detail ? parseFloat(detail) : NaN;
    const fromMessage = /retry in ([\d.]+)s/i.exec(message);
    if (Number.isFinite(fromDetail)) retryDelayMs = fromDetail * 1000;
    else if (fromMessage) retryDelayMs = parseFloat(fromMessage[1]) * 1000;
  } catch {
    /* body bukan JSON */
  }
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) retryDelayMs = header * 1000;
  return { status: response.status, message, retryDelayMs };
}

function toError(e: ApiError): EmbeddingError {
  if (e.status === 429) {
    return new EmbeddingError(`Gemini free quota reached (error 429). ${e.message}`.trim(), true);
  }
  const hint =
    e.status === 400 || e.status === 403
      ? "Check GEMINI_API_KEY (create one in Google AI Studio)."
      : e.status === 404
        ? `Model ${EMBEDDING_MODEL} not found.`
        : "";
  return new EmbeddingError(`Gemini error ${e.status}. ${hint} ${e.message}`.trim());
}

/** Jeda 429 yang dipakai bila Google tidak menyebutkannya, dan batas atasnya. */
const DEFAULT_RETRY_MS = 15_000;
const MAX_RETRY_MS = 30_000;

/**
 * Satu permintaan batch (maks. EMBED_BATCH_SIZE teks).
 *
 * Kuota gratis dihitung per menit dan tiap teks dalam batch dihitung satu permintaan, jadi 429 itu
 * normal untuk reindex. Perilaku saat 429:
 * - tanpa `deadline` (pencarian satu query): satu kali ulang setelah jeda yang disarankan Google, lalu menyerah;
 * - dengan `deadline` (reindex): menunggu jeda yang disarankan Google lalu mengulang, selama masih
 *   muat sebelum `deadline`; bila tidak muat, dilempar sebagai rateLimited supaya pemanggil
 *   berhenti dengan rapi dan melanjutkan nanti.
 */
export async function embedBatch(
  texts: string[],
  taskType: TaskType,
  opts: { timeoutMs?: number; deadline?: number } = {},
): Promise<number[][]> {
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
  const path = `/models/${EMBEDDING_MODEL}:batchEmbedContents`;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  let retriesLeft = opts.deadline === undefined ? 1 : Infinity;
  for (;;) {
    const response = await post(path, body, apiKey, timeoutMs);
    if (response.ok) {
      const json = (await response.json()) as { embeddings?: { values?: number[] }[] };
      const embeddings = json.embeddings ?? [];
      if (embeddings.length !== texts.length || embeddings.some((e) => e.values?.length !== EMBEDDING_DIMENSIONS)) {
        throw new EmbeddingError("Unexpected response from Gemini (wrong number or size of embeddings).");
      }
      return embeddings.map((e) => normalize(e.values as number[]));
    }

    const error = await readApiError(response);
    if (error.status !== 429 || retriesLeft <= 0) throw toError(error);
    // +500 ms: jendela kuota pulih tepat di batas, jangan menabraknya.
    const wait = Math.min(error.retryDelayMs ?? DEFAULT_RETRY_MS, MAX_RETRY_MS) + 500;
    if (opts.deadline !== undefined && Date.now() + wait + 2_000 > opts.deadline) throw toError(error);
    retriesLeft -= 1;
    await sleep(wait);
  }
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedBatch([query], "RETRIEVAL_QUERY", { timeoutMs: 10_000 });
  return vector;
}
