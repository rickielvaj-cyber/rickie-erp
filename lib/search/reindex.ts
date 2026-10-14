import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { sortPhases } from "@/lib/projects";
import { embedTexts } from "./openai";
import { buildExcerpt, contentHash, vectorLiteral } from "./text";
import type { SearchDoc, SearchSourceType } from "./types";

type Db = SupabaseClient<Database>;

export type ReindexResult = {
  /** Jumlah konten sumber yang ditemukan. */
  total: number;
  /** Di-embed ulang (baru atau berubah). */
  embedded: number;
  /** Tidak berubah sejak indeks terakhir, dilewati (tidak memakai OpenAI). */
  unchanged: number;
  /** Baris indeks yatim (sumber sudah dihapus) yang dibersihkan. */
  removed: number;
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
    fetchAll((a, b) => db.from("clients").select("id, canonical_name").order("id").range(a, b)),
    fetchAll((a, b) => db.from("issue_log").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("goals").select("*").order("id").range(a, b)),
    fetchAll((a, b) => db.from("goal_items").select("goal_id, title, group_name, note").order("id").range(a, b)),
  ]);

  const clientName = new Map(clients.map((c) => [c.id, c.canonical_name]));
  const docs: SearchDoc[] = [];
  const push = (userId: string, sourceType: SearchSourceType, sourceId: string, title: string, body: string, urlPath: string) =>
    docs.push({ userId, sourceType, sourceId, title, excerpt: buildExcerpt(title, body), urlPath });

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

const keyOf = (type: string, id: string) => `${type}:${id}`;

/**
 * Samakan `search_index` dengan isi terkini: embed hanya konten baru/berubah (dibandingkan lewat
 * hash), upsert, lalu hapus baris yatim. `force` = embed ulang semuanya.
 * `db` bisa klien dengan sesi pengguna (RLS berlaku) atau service role (script/cron).
 */
export async function reindexSearch(db: Db, opts: { force?: boolean } = {}): Promise<ReindexResult> {
  const started = Date.now();
  const docs = await collectDocs(db);
  const existing = await fetchAll((a, b) =>
    db.from("search_index").select("id, source_type, source_id, content_hash").order("id").range(a, b),
  );

  const known = new Map(existing.map((r) => [keyOf(r.source_type, r.source_id), r]));
  const wanted = new Set(docs.map((d) => keyOf(d.sourceType, d.sourceId)));

  const stale = docs.filter((d) => opts.force || known.get(keyOf(d.sourceType, d.sourceId))?.content_hash !== contentHash(d));

  if (stale.length > 0) {
    const vectors = await embedTexts(stale.map((d) => d.excerpt));
    const rows = stale.map((d, i) => ({
      user_id: d.userId,
      source_type: d.sourceType,
      source_id: d.sourceId,
      title: d.title,
      content_excerpt: d.excerpt,
      content_hash: contentHash(d),
      embedding: vectorLiteral(vectors[i]),
      url_path: d.urlPath,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("search_index").upsert(rows.slice(i, i + 100), { onConflict: "user_id,source_type,source_id" });
      if (error) throw new Error(error.message);
    }
  }

  const orphanIds = existing.filter((r) => !wanted.has(keyOf(r.source_type, r.source_id))).map((r) => r.id);
  for (let i = 0; i < orphanIds.length; i += 100) {
    const { error } = await db.from("search_index").delete().in("id", orphanIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }

  return {
    total: docs.length,
    embedded: stale.length,
    unchanged: docs.length - stale.length,
    removed: orphanIds.length,
    tookMs: Date.now() - started,
  };
}

export function describeReindex(r: ReindexResult): string {
  const secs = (r.tookMs / 1000).toFixed(1);
  return `Indexed ${r.embedded} new or changed, ${r.unchanged} unchanged, ${r.removed} removed (${r.total} items in total, ${secs}s).`;
}
