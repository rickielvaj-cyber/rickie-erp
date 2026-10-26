import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/date";
import { displayTitle, noteSnippet } from "@/lib/notes";

export const metadata = { title: "Notes" };

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** updated_at (UTC) -> tanggal WIB; hari ini tampil sebagai jam. */
function whenLabel(updatedAt: string): string {
  const wib = new Date(new Date(updatedAt).getTime() + WIB_OFFSET_MS).toISOString();
  const date = wib.slice(0, 10);
  return date === todayISO() ? wib.slice(11, 16) : formatDate(date);
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const [notesResult, clientsResult] = await Promise.all([
    supabase.from("notes").select("id, title, body, client_id, pinned, updated_at").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(1000),
    supabase.from("clients").select("id, canonical_name"),
  ]);
  const clientName = new Map((clientsResult.data ?? []).map((c) => [c.id, c.canonical_name]));
  const all = notesResult.data ?? [];
  const notes = term
    ? all.filter((n) => `${n.body} ${n.client_id ? (clientName.get(n.client_id) ?? "") : ""}`.toLowerCase().includes(term))
    : all;
  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);

  const row = (n: (typeof notes)[number]) => (
    <li key={n.id} className="border-b border-border last:border-b-0">
      <Link href={`/notes/${n.id}`} className="block px-5 py-4 transition-colors hover:bg-surface">
        <div className="flex items-baseline justify-between gap-4">
          <span className="min-w-0 flex-1 truncate text-lg font-medium">{displayTitle(n.title)}</span>
          <span className="shrink-0 text-sm text-muted">{whenLabel(n.updated_at)}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {n.client_id && clientName.get(n.client_id) ? <span className="text-foreground">{clientName.get(n.client_id)} · </span> : null}
          {noteSnippet(n.body) || "No additional text"}
        </p>
      </Link>
    </li>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-base text-muted">Quick notes that save as you type.</p>
        </div>
        <Link href="/notes/new" className="rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover">
          + New note
        </Link>
      </div>

      <form action="/notes" role="search" className="mt-6">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search your notes"
          aria-label="Search notes"
          className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
        />
      </form>

      {notesResult.error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load notes: {notesResult.error.message}</p>}

      <div className="mt-6 space-y-8">
        {notes.length === 0 && !notesResult.error && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
            {term ? `No notes contain “${q}”.` : "No notes yet. Tap “New note” and start typing."}
          </p>
        )}
        {pinned.length > 0 && (
          <section aria-labelledby="notes-pinned">
            <h2 id="notes-pinned" className="mb-2 text-sm font-medium text-muted">
              Pinned
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-foreground">{pinned.map(row)}</ul>
          </section>
        )}
        {others.length > 0 && (
          <section aria-labelledby="notes-all">
            {pinned.length > 0 && (
              <h2 id="notes-all" className="mb-2 text-sm font-medium text-muted">
                Notes
              </h2>
            )}
            <ul className="overflow-hidden rounded-2xl border border-foreground">{others.map(row)}</ul>
          </section>
        )}
      </div>
    </div>
  );
}
