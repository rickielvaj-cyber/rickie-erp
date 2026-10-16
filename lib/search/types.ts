export const SOURCE_TYPES = ["client", "project", "issue", "goal", "kb_entry"] as const;
export type SearchSourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABEL: Record<SearchSourceType, string> = {
  kb_entry: "Knowledge Base",
  client: "Clients & Partners",
  project: "Projects",
  issue: "Issues",
  goal: "Goals",
};

/**
 * Jenis konten yang dikirim ke penyedia embedding (Google). Issue SENGAJA tidak ikut: deskripsinya memuat
 * nama klien dan tier gratis Gemini boleh memakai isi yang dikirim untuk memperbaiki produk Google.
 * Issue dan klien/partner tetap masuk indeks tanpa vektor, jadi dicari lewat kata persis. Untuk mengikutkannya, tambahkan
 * "issue" di sini lalu jalankan Reindex dengan "Re-embed everything".
 */
export const EMBEDDED_TYPES: readonly SearchSourceType[] = ["kb_entry", "project", "goal"];

/** Satu konten yang akan diindeks (belum ber-embedding). */
export type SearchDoc = {
  userId: string;
  sourceType: SearchSourceType;
  sourceId: string;
  /** Urutan potongan untuk konten panjang (0 = potongan pertama / satu-satunya). */
  chunkIndex: number;
  title: string;
  /** Judul + potongan isi; persis teks yang di-embed. */
  excerpt: string;
  urlPath: string;
};

/** Satu hasil pencarian yang dikirim ke UI. */
export type SearchHit = {
  id: string;
  sourceType: SearchSourceType;
  title: string;
  snippet: string;
  urlPath: string;
  /** Cara hasil ini ditemukan: arti (embedding), kata kunci persis, atau keduanya. */
  match: "semantic" | "keyword" | "both";
  /** Hanya diisi bila diminta (?debug=1): skor mentah hasil arti, untuk menyetel ambang. */
  debug?: { similarity: number; z: number };
};

export type SearchResponse = {
  query: string;
  results: SearchHit[];
  /** Pesan non-fatal untuk ditampilkan (mis. pencarian arti nonaktif, indeks kosong). */
  warning?: string;
};
