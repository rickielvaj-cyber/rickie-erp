import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { kbModuleLabel } from "@/lib/kb/modules";

type SearchParams = { q?: string };

export default async function KbSearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const supabase = await createClient();
  const { data: results, error } = query
    ? await supabase.rpc("kb_search", { search_query: query })
    : { data: null, error: null };

  return (
    <div className="max-w-3xl">
      <Link href="/kb" className="text-sm text-muted hover:underline">
        &larr; Knowledge Base
      </Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold text-brand-red">Cari Knowledge Base</h1>

      <form method="GET" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cari di semua modul..."
          autoFocus
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
        >
          Cari
        </button>
      </form>

      {!query && <p className="text-sm text-muted">Ketik kata kunci untuk mulai mencari.</p>}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
          Gagal mencari: {error.message}
        </p>
      )}

      {query && !error && (
        <>
          <p className="mb-3 text-sm text-muted">
            Hasil untuk &ldquo;{query}&rdquo; ({results?.length ?? 0})
          </p>

          {results?.length === 0 && <p className="text-sm text-muted">Tidak ada hasil yang cocok.</p>}

          <ul className="space-y-3">
            {(results ?? []).map((result) => (
              <li key={result.id} className="rounded-md border border-border p-4">
                <p className="text-xs text-muted">{kbModuleLabel(result.module)}</p>
                <Link
                  href={`/kb/${result.module}/${result.id}`}
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
        </>
      )}
    </div>
  );
}
