import { SearchResults } from "@/components/SearchResults";
import { normalizeQuery } from "@/lib/search/text";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; debug?: string }> }) {
  const { q, debug } = await searchParams;
  const query = normalizeQuery(q);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight">Search</h1>
      <p className="mt-1 text-base text-muted">
        Finds clients and partners, projects, issues, goals, and Knowledge Base entries — by meaning, not only exact words.
      </p>

      {/* GET biasa: bekerja juga di layar sempit, tempat kolom di menu atas disembunyikan. */}
      <form action="/search" role="search" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="e.g. voucher won't post, or a client name"
          aria-label="Search everything"
          maxLength={200}
          autoFocus={!query}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-accent px-6 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Search
        </button>
      </form>

      <div className="mt-8">
        {query ? (
          <SearchResults key={`${query}|${debug}`} query={query} debug={debug === "1"} />
        ) : q ? (
          <p className="text-sm text-muted">Type at least 2 characters.</p>
        ) : null}
      </div>
    </div>
  );
}
