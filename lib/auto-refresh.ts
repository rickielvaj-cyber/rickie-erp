// Kapan refresh otomatis (AutoRefresh) harus menunggu supaya tidak merusak apa yang sedang dikerjakan. Murni supaya mudah diuji.

export type RefreshGuard = {
  /** Tag elemen yang sedang fokus (huruf besar/kecil bebas), mis. "INPUT", "TEXTAREA". */
  activeTag: string | null;
  /** Untuk <input>: nilai atribut type (mis. "text", "checkbox"); null bila bukan input. */
  activeType?: string | null;
  /** Elemen fokus bisa diketik (contenteditable). */
  activeEditable: boolean;
  /** Query string halaman ini, mis. "?edit=abc". */
  search: string;
  /** Nama parameter URL yang berarti ada form terbuka (mis. "new", "edit"). */
  pauseParams: readonly string[];
  /** Ada elemen penanda "jangan refresh" di halaman (seleksi batch, dialog, dsb.). */
  hasPauseElement: boolean;
  /** Tombol mouse/jari sedang ditekan (menyeret). */
  pointerDown: boolean;
};

/** <input> yang bukan isian teks (kotak centang, tombol, dsb.) tetap fokus setelah diklik, jadi tidak boleh menahan refresh. */
const NON_TEXT_INPUT = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "file", "range", "color"]);

export function shouldPauseRefresh(g: RefreshGuard): boolean {
  if (g.pointerDown || g.hasPauseElement || g.activeEditable) return true;
  const tag = g.activeTag?.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT" && !NON_TEXT_INPUT.has((g.activeType ?? "text").toLowerCase())) return true;
  const params = new URLSearchParams(g.search);
  return g.pauseParams.some((p) => params.has(p));
}
