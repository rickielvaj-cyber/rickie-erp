import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import { KB_MODULES } from "@/lib/kb/modules";

type SearchParams = { q?: string };

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const supabase = await createClient();

  const [{ data: entries }, searchResult] = await Promise.all([
    supabase.from("kb_entries").select("module, updated_at"),
    query
      ? supabase.rpc("kb_search", { search_query: query })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const entryByModule = new Map((entries ?? []).map((e) => [e.module, e]));
  const searchResults = searchResult.data ?? [];
  const searchError = searchResult.error;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-red">Knowledge Base</h1>
        <Link
          href="/kb/import"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
        >
          Import dari Word
        </Link>
      </div>

      <form method="GET" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cari di semua modul..."
          className="w-full max-w-md rounded-md border border-border px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
        >
          Cari
        </button>
        {query && (
          <Link href="/kb" className="flex items-center text-sm text-muted underline">
            Reset
          </Link>
        )}
      </form>

      {query && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted">
            Hasil pencarian untuk &ldquo;{query}&rdquo; ({searchResults.length})
          </h2>

          {searchError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
              Gagal mencari: {searchError.message}
            </p>
          )}

          {!searchError && searchResults.length === 0 && (
            <p className="text-sm text-muted">Tidak ada hasil yang cocok.</p>
          )}

          <ul className="space-y-3">
            {searchResults.map((result) => (
              <li key={result.id} className="rounded-md border border-border p-4">
                <Link
                  href={`/kb/${result.module}`}
                  className="font-medium text-brand-red hover:underline"
                >
                  {result.title}
                </Link>
                <p
                  className="mt-1 text-sm text-muted [&_mark]:bg-yellow-200 [&_mark]:text-foreground [&_mark]:not-italic"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KB_MODULES.map(({ slug, label }) => {
          const entry = entryByModule.get(slug);
          return (
            <Link
              key={slug}
              href={`/kb/${slug}`}
              className="rounded-md border border-border p-4 transition-colors hover:border-brand-red"
            >
              <h3 className="font-medium">{label}</h3>
              <p className="mt-1 text-xs text-muted">
                {entry ? "1 entri" : "Belum ada konten"}
              </p>
              {entry && (
                <p className="mt-0.5 text-xs text-muted">
                  Diperbarui {formatDateID(entry.updated_at.slice(0, 10))}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
