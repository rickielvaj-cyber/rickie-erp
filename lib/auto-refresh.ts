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

/** Elemen fokus tempat orang mengetik teks: textarea, atau input teks (bukan kotak centang, tombol, dsb.). */
export function isTextEntry(tag: string | null | undefined, type?: string | null): boolean {
  const t = tag?.toUpperCase();
  if (t === "TEXTAREA") return true;
  return t === "INPUT" && !NON_TEXT_INPUT.has((type ?? "text").toLowerCase());
}

export function shouldPauseRefresh(g: RefreshGuard): boolean {
  if (g.pointerDown || g.hasPauseElement || g.activeEditable) return true;
  if (isTextEntry(g.activeTag, g.activeType)) return true;
  const params = new URLSearchParams(g.search);
  return g.pauseParams.some((p) => params.has(p));
}
