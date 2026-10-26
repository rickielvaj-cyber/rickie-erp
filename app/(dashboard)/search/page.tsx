import Link from "next/link";
import { SearchResults } from "@/components/SearchResults";
import { normalizeQuery } from "@/lib/search/text";
import { SOURCE_LABEL, SOURCE_TYPES, type SearchSourceType } from "@/lib/search/types";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; debug?: string; type?: string }> }) {
  const { q, debug, type: rawType } = await searchParams;
  const query = normalizeQuery(q);
  const type = SOURCE_TYPES.find((t) => t === rawType) as SearchSourceType | undefined;
  const chipHref = (t?: SearchSourceType) => {
    const p = new URLSearchParams({ q: q ?? "" });
    if (t) p.set("type", t);
    if (debug === "1") p.set("debug", "1");
    return `/search?${p}`;
  };
  // Urutan chip: yang paling sering dicari dulu.
  const chipTypes: SearchSourceType[] = ["kb_entry", "issue", "note", "project", "goal", "client"];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight">Search</h1>
      <p className="mt-1 text-base text-muted">
        Finds clients and partners, projects, issues, goals, and Knowledge Base entries — by meaning, not only exact words.
      </p>

      {/* GET biasa: bekerja juga di layar sempit, tempat kolom di menu atas disembunyikan. */}
      <form action="/search" role="search" className="mt-6 flex gap-2">
        {type && <input type="hidden" name="type" value={type} />}
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

      {query && (
        <nav aria-label="Filter by type" className="mt-4 flex flex-wrap gap-2">
          {[undefined, ...chipTypes].map((t) => (
            <Link
              key={t ?? "all"}
              href={chipHref(t)}
              aria-current={type === t ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1 text-sm transition-colors ${
                type === t
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:border-foreground hover:text-foreground"
              }`}
            >
              {t ? SOURCE_LABEL[t] : "All"}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-8">
        {query ? (
          <SearchResults key={`${query}|${debug}|${type}`} query={query} debug={debug === "1"} type={type} />
        ) : q ? (
          <p className="text-sm text-muted">Type at least 2 characters.</p>
        ) : null}
      </div>
    </div>
  );
}
