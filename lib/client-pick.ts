// Pencarian klien untuk pemilih berketik (form Proyek baru). Murni supaya mudah diuji.

export type PickOption = { id: string; name: string; kind: "client" | "partner"; aliases: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Pilihan yang cocok dengan ketikan: semua kata ketikan harus ada di nama atau alias (urutan bebas, huruf besar-kecil
 * dan tanda baca diabaikan), jadi "wanx indo" menemukan "PT WANXINDA INDONESIA". Yang namanya diawali ketikan lebih dulu,
 * lalu abjad. Ketikan kosong = semua pilihan.
 */
export function filterClients(options: PickOption[], query: string): PickOption[] {
  const words = norm(query).split(" ").filter(Boolean);
  const matches = options.filter((o) => {
    if (words.length === 0) return true;
    const hay = [o.name, ...o.aliases].map(norm);
    return words.every((w) => hay.some((h) => h.includes(w)));
  });
  const q = norm(query);
  const starts = (o: PickOption) => (q && norm(o.name).startsWith(q) ? 0 : 1);
  return matches.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name));
}

/** Nama persis (abaikan huruf besar-kecil dan spasi ganda) -> pilihan; null bila tidak ada. */
export function exactClient(options: PickOption[], text: string): PickOption | null {
  const t = norm(text);
  return t ? (options.find((o) => norm(o.name) === t) ?? null) : null;
}
