import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/date";
import { hasEmbeddingKey } from "@/lib/search/gemini";
import { SOURCE_LABEL, SOURCE_TYPES } from "@/lib/search/types";
import { ReindexForm } from "@/components/ReindexForm";

export const metadata = { title: "Settings" };
// Reindex memanggil layanan embedding untuk ratusan teks; beri waktu lebih dari default.
export const maxDuration = 60;

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_index")
    .select("source_type, updated_at")
    .order("updated_at", { ascending: false })
    .range(0, 4999);

  const rows = data ?? [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.source_type, (counts.get(r.source_type) ?? 0) + 1);
  const last = rows[0]?.updated_at;
  const keySet = hasEmbeddingKey();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight">Settings</h1>

      <section aria-labelledby="search-heading" className="mt-10 rounded-3xl border border-border bg-surface p-6">
        <h2 id="search-heading" className="text-xl font-semibold tracking-tight">
          Search index
        </h2>
        <p className="mt-1 text-sm text-muted">
          Search finds Knowledge Base entries, projects, and goals by meaning, using Google Gemini embeddings. Issues are
          indexed for exact-word search only and are never sent to Google, because they contain client names. New or
          edited content is picked up by a daily job; press the button to update right now. The free embedding quota is
          small, so the first run may stop early — if it says items are still waiting, press the button again after a
          minute.
        </p>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error.message}</p>}
        {!keySet && (
          <p className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
            <code>GEMINI_API_KEY</code> is not set on the server, so meaning-based search is off. See the README.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SOURCE_TYPES.map((type) => (
            <div key={type} className="rounded-2xl border border-border bg-background px-4 py-3">
              <dt className="text-xs text-muted">{SOURCE_LABEL[type]}</dt>
              <dd className="text-2xl font-semibold">{counts.get(type) ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">
          {last ? `Last indexed ${formatDate(last.slice(0, 10))}.` : "Nothing indexed yet."}
        </p>

        <div className="mt-5">
          <ReindexForm />
        </div>
      </section>
    </div>
  );
}
