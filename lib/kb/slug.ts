// Anchor id dari teks heading. Unicode-aware: huruf/angka dari script apa pun
// (termasuk 中文, aksen, dll.) dipertahankan apa adanya — cuma tanda baca &
// spasi yang jadi "-". Strip ke ASCII bakal bikin heading non-Latin kosong
// atau tabrakan satu sama lain.
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "bagian";
}

// Slugger per halaman: heading dengan teks sama dapat suffix -2, -3, ... sesuai
// urutan kemunculan. Urutan heading harus identik di semua pemanggil — makanya
// cuma dipanggil dari buildKbChapter().
export function createSlugger(): (text: string) => string {
  const used = new Set<string>();
  return (text) => {
    const base = slugifyHeading(text);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    return slug;
  };
}
