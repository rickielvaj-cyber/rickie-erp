export const SOURCE_TYPES = ["kb_entry", "project", "issue", "goal"] as const;
export type SearchSourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABEL: Record<SearchSourceType, string> = {
  kb_entry: "Knowledge Base",
  project: "Projects",
  issue: "Issues",
  goal: "Goals",
};

/** Satu konten yang akan diindeks (belum ber-embedding). */
export type SearchDoc = {
  userId: string;
  sourceType: SearchSourceType;
  sourceId: string;
  title: string;
  /** Judul + ringkasan isi (dipotong); persis teks yang di-embed. */
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
};

export type SearchResponse = {
  query: string;
  results: SearchHit[];
  /** Pesan non-fatal untuk ditampilkan (mis. pencarian arti nonaktif, indeks kosong). */
  warning?: string;
};
