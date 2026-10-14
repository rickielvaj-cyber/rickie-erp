"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SOURCE_LABEL, SOURCE_TYPES, type SearchHit, type SearchResponse } from "@/lib/search/types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: SearchResponse };

function Skeleton() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-8">
      <p className="text-sm text-muted">Searching…</p>
      {[3, 2].map((rows, g) => (
        <div key={g} className="space-y-3">
          <div className="h-4 w-32 rounded bg-surface" />
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-border p-5">
              <div className="h-5 w-2/5 rounded bg-surface" />
              <div className="h-4 w-4/5 rounded bg-surface" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Group({ type, hits }: { type: (typeof SOURCE_TYPES)[number]; hits: SearchHit[] }) {
  return (
    <section aria-labelledby={`group-${type}`}>
      <h2 id={`group-${type}`} className="mb-3 text-sm font-medium text-muted">
        {SOURCE_LABEL[type]} · {hits.length}
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-foreground">
        {hits.map((hit) => (
          <li key={hit.id} className="border-b border-border last:border-b-0">
            <Link href={hit.urlPath} className="block px-5 py-4 transition-colors hover:bg-surface">
              <p className="text-lg">{hit.title}</p>
              {hit.snippet && <p className="mt-1 text-sm text-muted">{hit.snippet}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Memanggil /api/search; menampilkan kerangka pemuatan selama menunggu (OpenAI + database).
 * Pemanggil memberi key={query}, jadi query baru = komponen baru dengan state "loading".
 */
export function SearchResults({ query }: { query: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((json as { error?: string }).error ?? "Search failed.");
        setState({ status: "done", data: json as SearchResponse });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Search failed." });
      });
    return () => controller.abort();
  }, [query]);

  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error") {
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
        {state.message}
      </p>
    );
  }

  const { results, warning } = state.data;
  return (
    <div className="space-y-8">
      {warning && <p className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-muted">{warning}</p>}
      {results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
          Nothing found for “{query}”. Try other words, or describe what you are looking for.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {results.length} {results.length === 1 ? "result" : "results"}
          </p>
          {SOURCE_TYPES.map((type) => {
            const hits = results.filter((r) => r.sourceType === type);
            return hits.length > 0 ? <Group key={type} type={type} hits={hits} /> : null;
          })}
        </>
      )}
    </div>
  );
}
