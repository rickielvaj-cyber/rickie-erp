import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { kindOf } from "@/lib/clients";
import { sortPhases } from "@/lib/projects";
import { EMBED_BATCH_SIZE, EmbeddingError, embedBatch } from "./gemini";
import { buildChunks, contentHash, vectorLiteral } from "./text";
import { EMBEDDED_TYPES, type SearchDoc, type SearchSourceType } from "./types";

type Db = SupabaseClient<Database>;

export type ReindexResult = {
  /** Jumlah baris indeks (potongan teks) yang seharusnya ada; konten panjang dipecah jadi beberapa. */
  total: number;
  /** Ditulis ulang ke indeks (baru atau berubah), termasuk yang tanpa vektor. */
  updated: number;
  /** Dari `updated`: berapa yang benar-benar dikirim ke penyedia embedding. */
  embedded: number;
  /** Tidak berubah sejak indeks terakhir, dilewati (tidak memakai kuota embedding). */
  unchanged: number;
  /** Baris indeks yatim (sumber sudah dihapus) yang dibersihkan. */
  removed: number;
  /** Yang masih menunggu karena berhenti lebih awal (waktu atau kuota habis); jalankan lagi untuk melanjutkan. */
  remaining: number;
  /** Alasan berhenti lebih awal, bila ada. */
  stoppedReason?: string;
  /** Catatan non-fatal (mis. data peringkat gagal diperbarui); reindex tetap dianggap berhasil. */
  note?: string;
  tookMs: number;
};

const PAGE = 1000;

/** PostgREST membatasi 1000 baris per permintaan; baca per halaman sampai habis. */
async function fetchAll<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await load(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Baca semua konten yang bisa dicari. Hanya MEMBACA tabel sumber (kb_entries, projects,
 * issue_log, goals) dan menyusun teks yang akan di-embed.
 */
export async function collectDocs(db: Db): Promise<SearchDoc[]> {
  const [kb, projects, phases, partners, clients, issues, goals, goalItems] = await Promise.all([
    fetchAll((a, b) => db.from("kb_entries").select("id, user_id, module, title, content").order("id").range(a, b)),
    fetchAll((a, b) => db.from("projects").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("project_phases").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("project_partners").select("*").order("project_id").range(a, b)),
    fetchAll((a, b) => db.from("clients").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("issue_log").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("goals").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("goal_items").select("goal_id, title, group_name, note").order("id").range(a, b)),
  ]);

  const clientName = new Map(clients.map((c) => [c.id, c.canonical_name]));
  const docs: SearchDoc[] = [];
  const push = (userId: string, sourceType: SearchSourceType, sourceId: string, title: string, body: string, urlPath: string) =>
    buildChunks(title, body).forEach((excerpt, chunkIndex) =>
      docs.push({ userId, sourceType, sourceId, chunkIndex, title, excerpt, urlPath }),
    );

  // Klien dan partner: hanya kata persis (EMBEDDED_TYPES tidak memuat "client"), supaya mencari nama
  // langsung menemukan orangnya tanpa mengirim nama klien ke penyedia embedding.
  for (const c of clients) {
    const body = [
      `${kindOf(c) === "partner" ? "Partner" : "Client"}.`,
      c.aliases.length ? `Also written as: ${c.aliases.join(", ")}.` : "",
      c.active ? "" : "Inactive.",
    ]
      .filter(Boolean)
      .join(" ");
    push(c.user_id, "client", c.id, c.canonical_name, body, `/clients?edit=${c.id}&show=all`);
  }

  for (const e of kb) {
    push(e.user_id, "kb_entry", e.id, e.title, e.content, `/knowledge-base/${e.module}/${e.id}`);
  }

  for (const p of projects) {
    const owner = clientName.get(p.client_id);
    const partnerNames = partners
      .filter((x) => x.project_id === p.id)
      .map((x) => clientName.get(x.partner_id))
      .filter(Boolean);
    const phaseList = sortPhases(phases.filter((ph) => ph.project_id === p.id)).map((ph) => `${ph.name} (${ph.status})`);
    const body = [
      owner ? `Client: ${owner}.` : "",
      partnerNames.length ? `Partners: ${partnerNames.join(", ")}.` : "",
      `Status: ${p.status}.`,
      phaseList.length ? `Phases: ${phaseList.join(", ")}.` : "",
      p.note ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    push(p.user_id, "project", p.id, owner ? `${owner} — ${p.name}` : p.name, body, `/projects/${p.id}`);
  }

  for (const i of issues) {
    const body = [
      i.client_name ? `Client: ${i.client_name}.` : "",
      i.module ? `Module: ${i.module}.` : "",
      i.category ? `Category: ${i.category}.` : "",
      i.description,
      i.root_cause ? `Root cause: ${i.root_cause}.` : "",
      i.resolution ? `Resolution: ${i.resolution}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    // Halaman Issue Log belum punya URL per issue; arahkan ke daftar dengan baris dibuka untuk diedit.
    push(i.user_id, "issue", i.id, i.title, body, `/issues?edit=${i.id}`);
  }

  for (const g of goals) {
    const items = goalItems.filter((it) => it.goal_id === g.id).map((it) => it.title);
    const body = [g.description ?? "", `Type: ${g.type}.`, items.length ? `Items: ${items.join("; ")}.` : ""]
      .filter(Boolean)
      .join(" ");
    push(g.user_id, "goal", g.id, g.title, body, `/goals/${g.id}`);
  }

  return docs;
}

const keyOf = (type: string, id: string, chunk: number) => `${type}:${id}:${chunk}`;

const shouldEmbed = (d: SearchDoc) => EMBEDDED_TYPES.includes(d.sourceType);

/**
 * Samakan `search_index` dengan isi terkini: hanya konten baru/berubah (dibandingkan lewat hash) yang
 * ditulis ulang, lalu baris yatim dihapus. `force` = tulis ulang semuanya.
 *
 * Bisa dilanjutkan: tiap potongan langsung disimpan, dan proses berhenti dengan rapi bila melewati
 * `budgetMs` atau kuota embedding habis (kuota gratis kecil, jadi indeks pertama bisa butuh beberapa
 * kali jalan). Menjalankan ulang melanjutkan sisanya karena yang sudah tersimpan hash-nya cocok.
 *
 * `db` bisa klien dengan sesi pengguna (RLS berlaku) atau service role (script/cron).
 */
export async function reindexSearch(db: Db, opts: { force?: boolean; budgetMs?: number } = {}): Promise<ReindexResult> {
  const started = Date.now();
  const budgetMs = opts.budgetMs ?? 40_000;
  const docs = await collectDocs(db);
  const existing = await fetchAll((a, b) =>
    db.from("search_index").select("id, source_type, source_id, chunk_index, content_hash").order("id").range(a, b),
  );

  const known = new Map(existing.map((r) => [keyOf(r.source_type, r.source_id, r.chunk_index), r]));
  const wanted = new Set(docs.map((d) => keyOf(d.sourceType, d.sourceId, d.chunkIndex)));

  const stale = docs.filter((d) => opts.force || known.get(keyOf(d.sourceType, d.sourceId, d.chunkIndex))?.content_hash !== contentHash(d));
  // Yang tanpa vektor ditulis dulu (tanpa kuota); yang perlu embedding menyusul per potongan.
  const plain = stale.filter((d) => !shouldEmbed(d));
  const toEmbed = stale.filter(shouldEmbed);

  const row = (d: SearchDoc, vector: number[] | null) => ({
    user_id: d.userId,
    source_type: d.sourceType,
    source_id: d.sourceId,
    chunk_index: d.chunkIndex,
    title: d.title,
    content_excerpt: d.excerpt,
    content_hash: contentHash(d),
    embedding: vector ? vectorLiteral(vector) : null,
    url_path: d.urlPath,
  });
  const save = async (rows: ReturnType<typeof row>[]) => {
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("search_index").upsert(rows.slice(i, i + 100), { onConflict: "user_id,source_type,source_id,chunk_index" });
      if (error) throw new Error(error.message);
    }
  };

  await save(plain.map((d) => row(d, null)));

  let embedded = 0;
  let stoppedReason: string | undefined;
  let note: string | undefined;
  for (let i = 0; i < toEmbed.length; i += EMBED_BATCH_SIZE) {
    if (Date.now() - started > budgetMs) {
      stoppedReason = "Stopped to stay within the time limit.";
      break;
    }
    const chunk = toEmbed.slice(i, i + EMBED_BATCH_SIZE);
    try {
      // deadline: bila kuota habis, tunggu jeda yang disarankan Google selama masih muat dalam anggaran waktu.
      const vectors = await embedBatch(chunk.map((d) => d.excerpt), "RETRIEVAL_DOCUMENT", {
        deadline: started + budgetMs,
        timeoutMs: 15_000,
      });
      await save(chunk.map((d, k) => row(d, vectors[k])));
      embedded += chunk.length;
    } catch (error) {
      // Kuota habis setelah ada kemajuan: berhenti dengan rapi. Galat lain (kunci salah, dsb.) atau
      // kuota habis di potongan pertama dilempar apa adanya supaya tidak tampak "berhasil".
      if (error instanceof EmbeddingError && error.rateLimited && embedded > 0) {
        stoppedReason = error.message;
        break;
      }
      throw error;
    }
  }

  // Baris yatim (sumbernya sudah dihapus) tidak berkaitan dengan potongan yang tertunda, jadi selalu dibersihkan.
  const orphanIds = existing.filter((r) => !wanted.has(keyOf(r.source_type, r.source_id, r.chunk_index))).map((r) => r.id);
  for (let i = 0; i < orphanIds.length; i += 100) {
    const { error } = await db.from("search_index").delete().in("id", orphanIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }

  // Hub dokumen (rata-rata kemiripan ke dokumen lain) dipakai pencarian untuk membuang dokumen yang dekat
  // ke query apa pun. SELALU dihitung ulang, bukan hanya saat ada vektor baru: setelah migrasi yang
  // menambah kolom `hub`, reindex pertama tidak mengubah vektor apa pun tapi hub tetap harus terisi.
  // Biayanya sepersekian detik untuk ratusan baris. Gagal di sini tidak membatalkan reindex.
  {
    const { error } = await db.rpc("search_refresh_hub");
    if (error) note = `Search ranking data could not be refreshed (${error.message}); results may include irrelevant entries until the next reindex.`;
  }

  const remaining = toEmbed.length - embedded;
  return {
    total: docs.length,
    updated: plain.length + embedded,
    embedded,
    unchanged: docs.length - stale.length,
    removed: orphanIds.length,
    remaining,
    ...(stoppedReason ? { stoppedReason } : {}),
    ...(note ? { note } : {}),
    tookMs: Date.now() - started,
  };
}

export function describeReindex(r: ReindexResult): string {
  const secs = (r.tookMs / 1000).toFixed(1);
  const base = `Indexed ${r.updated} new or changed (${r.embedded} sent for embedding), ${r.unchanged} unchanged, ${r.removed} removed (${r.total} text chunks in total, ${secs}s).`;
  const text =
    r.remaining > 0
      ? `${base} ${r.remaining} still waiting${r.stoppedReason ? ` — ${r.stoppedReason}` : ""} Press Reindex Search again to continue.`
      : base;
  return r.note ? `${text} ${r.note}` : text;
}
