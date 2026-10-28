import { geminiBaseUrl, readApiError } from "@/lib/search/gemini";

// Pembuatan teks dengan Gemini (generateContent). Dipakai hanya oleh AI notes, dan hanya atas permintaan pengguna.

/** Nama model bisa diganti lewat GEMINI_TEXT_MODEL bila Google mengubah/menghentikan modelnya. */
export const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";
export const textModel = () => process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;

export class AiError extends Error {
  constructor(
    message: string,
    /** true = kuota/laju habis (429): coba lagi nanti. */
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

export const hasAiKey = () => Boolean(process.env.GEMINI_API_KEY?.trim());

type Candidate = { content?: { parts?: { text?: string }[] }; finishReason?: string };
type Reply = { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } };

/** Satu permintaan (tanpa percobaan ulang otomatis: pengguna menekan tombol lagi bila perlu). Mengembalikan teks jawaban. */
export async function generateText(opts: {
  system: string;
  prompt: string;
  /** Minta keluaran JSON (responseMimeType). */
  json?: boolean;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AiError("AI is off: GEMINI_API_KEY is not set on the server.");
  const model = textModel();

  let response: Response;
  try {
    response = await fetch(`${geminiBaseUrl()}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 2048,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiError(timedOut ? "Gemini did not respond in time. Try again." : "Could not reach Gemini.");
  }

  if (!response.ok) {
    const e = await readApiError(response);
    if (e.status === 429) throw new AiError(`Gemini free quota reached. Try again in a minute. ${e.message}`.trim(), true);
    const hint =
      e.status === 404
        ? `Model ${model} was not found; set GEMINI_TEXT_MODEL to a current Gemini model.`
        : e.status === 400 || e.status === 403
          ? "Check GEMINI_API_KEY."
          : "";
    throw new AiError(`Gemini error ${e.status}. ${hint} ${e.message}`.replace(/\s+/g, " ").trim());
  }

  const json = (await response.json()) as Reply;
  if (json.promptFeedback?.blockReason) throw new AiError(`Gemini declined this text (${json.promptFeedback.blockReason}).`);
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new AiError(`Gemini returned no text${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}.`);
  if (candidate?.finishReason === "MAX_TOKENS" && opts.json) throw new AiError("The answer was cut off. Try a shorter note.");
  return text;
}
