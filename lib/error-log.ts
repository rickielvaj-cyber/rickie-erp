// Logika murni pencatatan galat (tanpa jaringan/penyimpanan) supaya bisa diuji: penyamaran data sensitif, pembuatan sidik jari untuk menggabungkan
// galat yang sama, penyaringan kebisingan, dan validasi laporan dari browser. Penulisan ke database ada di lib/error-report.ts.

export type ErrorSource = "server" | "client";

export type ErrorEntry = {
  fingerprint: string;
  source: ErrorSource;
  route: string;
  method: string;
  name: string;
  message: string;
  stack: string;
  digest: string | null;
  release: string;
};

export const LIMITS = { message: 500, stack: 2000, route: 200, name: 80, digest: 80, release: 12 } as const;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Samarkan hal yang tidak boleh masuk log: token JWT, Bearer/Basic, nilai kunci di query (?key=, ?token=, ...), seluruh query string URL,
 * email, dan deretan karakter panjang yang mirip rahasia (>= 32 huruf/angka/_/-). Hasilnya tetap terbaca untuk diagnosis.
 */
export function redact(text: string): string {
  return text
    .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{3,}/g, "[token]")
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, "$1 [token]")
    .replace(/([?&](?:key|apikey|api_key|token|access_token|refresh_token|code|secret|password|sig|signature)=)[^&\s"')]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/[^\s?"')]+)\?[^\s"')]*/g, "$1?[query]")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[secret]");
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Rute yang aman dicatat: tanpa query/hash, id (UUID atau angka panjang) diganti penanda, dipotong. */
export function normalizeRoute(path: string): string {
  const clean = path.split(/[?#]/)[0].replace(UUID_RE, ":id").replace(/\/\d{3,}(?=\/|$)/g, "/:n");
  return truncate(clean, LIMITS.route);
}

/** Hash FNV-1a 32-bit (heksa) untuk sidik jari; bukan untuk keamanan. */
export function hash32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Pesan tanpa bagian yang berubah-ubah (UUID, angka, isi tanda kutip) supaya galat yang sama dari data berbeda digabung. */
export function messageShape(message: string): string {
  return message
    .replace(UUID_RE, "<id>")
    .replace(/"[^"]{0,80}"/g, '"<v>"')
    .replace(/\d{2,}/g, "<n>")
    .slice(0, 160);
}

export function fingerprintOf(source: ErrorSource, route: string, name: string, message: string): string {
  return `${source}|${route}|${name}|${hash32(messageShape(message))}`;
}

type Raw = { source: ErrorSource; route?: string; method?: string; name?: string; message?: string; stack?: string; digest?: string | null; release?: string };

/** Galat yang bukan kegagalan aplikasi: pengalihan/404 internal Next.js, pembatalan permintaan, derau umum browser, dan ekstensi browser. */
export function shouldIgnore(raw: Raw): boolean {
  const message = raw.message ?? "";
  const name = raw.name ?? "";
  const digest = raw.digest ?? "";
  if (digest.startsWith("NEXT_") || /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(message)) return true;
  if (name === "AbortError" || /\baborted\b/i.test(message) && /request|fetch/i.test(message)) return true;
  if (/ResizeObserver loop/i.test(message) || /^Script error\.?$/i.test(message.trim())) return true;
  if (/chrome-extension:\/\/|moz-extension:\/\/|safari-extension:\/\//.test(raw.stack ?? "")) return true;
  // Kegagalan jaringan di browser (tab ditutup, offline) bukan galat aplikasi.
  if (raw.source === "client" && /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(message.trim())) return true;
  return false;
}

/** Susun entri yang bersih dan aman dicatat; null bila galatnya diabaikan atau tidak berisi apa pun. */
export function buildEntry(raw: Raw): ErrorEntry | null {
  if (shouldIgnore(raw)) return null;
  const message = truncate(redact(raw.message ?? ""), LIMITS.message);
  const name = truncate(redact(raw.name ?? "Error"), LIMITS.name) || "Error";
  if (!message && !raw.name) return null;
  const route = normalizeRoute(raw.route ?? "");
  return {
    fingerprint: fingerprintOf(raw.source, route, name, message),
    source: raw.source,
    route,
    method: truncate((raw.method ?? "").toUpperCase().replace(/[^A-Z]/g, ""), 12),
    name,
    message,
    stack: truncate(redact(raw.stack ?? ""), LIMITS.stack),
    digest: raw.digest ? truncate(raw.digest, LIMITS.digest) : null,
    release: truncate(raw.release ?? "", LIMITS.release),
  };
}

export type ClientReport = { name: string; message: string; stack: string; path: string };

/** Laporan dari browser tidak dipercaya: harus objek dengan string, dengan batas panjang. */
export function parseClientReport(raw: unknown): ClientReport | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const message = str(r.message, 1000);
  if (!message.trim()) return null;
  return { name: str(r.name, 120) || "Error", message, stack: str(r.stack, 4000), path: str(r.path, 300) };
}

/** Pembatas laju sederhana (jendela bergeser): maksimal `max` laporan per `windowMs` per pemanggil. */
export function createRateLimiter(max: number, windowMs: number): (now: number) => boolean {
  const times: number[] = [];
  return (now) => {
    while (times.length && now - times[0] >= windowMs) times.shift();
    if (times.length >= max) return false;
    times.push(now);
    return true;
  };
}
