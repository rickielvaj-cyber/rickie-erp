// Notes cepat: judul = baris pertama yang tidak kosong dari isi (seperti Notes iPhone). Murni supaya mudah diuji.

export const NOTE_MAX_CHARS = 100_000;
export const NOTE_TITLE_MAX = 80;
export const UNTITLED = "Untitled note";

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Baris pertama yang berisi, tanpa penanda markdown di depannya ("# ", "- ", "> "), dipotong 80 karakter. Kosong -> "". */
export function noteTitle(body: string): string {
  const line = body.split(/\r?\n/).map((l) => l.replace(/^[\s#>*+-]+/, "")).find((l) => l.trim() !== "");
  const text = squash(line ?? "");
  return text.length > NOTE_TITLE_MAX ? `${text.slice(0, NOTE_TITLE_MAX - 1).trimEnd()}…` : text;
}

/** Cuplikan untuk daftar: isi setelah baris judul, satu baris, maksimal `max` karakter. */
export function noteSnippet(body: string, max = 120): string {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  const rest = squash(first < 0 ? "" : lines.slice(first + 1).join(" "));
  return rest.length > max ? `${rest.slice(0, max - 1).trimEnd()}…` : rest;
}

/** Judul untuk ditampilkan (daftar dan hasil pencarian). */
export const displayTitle = (title: string) => title.trim() || UNTITLED;

export type NoteInput = { body: string; clientId: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validasi masukan dari browser (tidak dipercaya). Isi boleh kosong; panjang dibatasi. */
export function parseNoteInput(raw: unknown): { ok: true; value: NoteInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.body !== "string") return { ok: false, error: "Nothing to save." };
  if (r.body.length > NOTE_MAX_CHARS) return { ok: false, error: `This note is too long (max ${NOTE_MAX_CHARS.toLocaleString("en-US")} characters).` };
  const clientId = typeof r.clientId === "string" && r.clientId !== "" ? r.clientId : null;
  if (clientId !== null && !UUID_RE.test(clientId)) return { ok: false, error: "Unknown client." };
  return { ok: true, value: { body: r.body.replace(/\r\n/g, "\n"), clientId } };
}

export const isNoteId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
