"use client";

import { useActionState } from "react";
import { reindexSearchAction, type ReindexState } from "@/app/(dashboard)/settings/actions";

export function ReindexForm() {
  const [state, action, pending] = useActionState<ReindexState, FormData>(reindexSearchAction, null);

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Indexing…" : "Reindex Search"}
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="force" disabled={pending} className="h-4 w-4 accent-foreground" />
          Re-embed everything (not only what changed)
        </label>
      </div>
      {pending && (
        <p role="status" className="text-sm text-muted">
          Reading your content and asking OpenAI for embeddings. This can take up to a minute; keep this page open.
        </p>
      )}
      {state && !pending && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`rounded-xl px-4 py-2.5 text-sm ${state.ok ? "border border-border bg-surface" : "bg-red-50 text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
