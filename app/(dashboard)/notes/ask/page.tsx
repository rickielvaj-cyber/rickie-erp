import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { displayTitle } from "@/lib/notes";
import { AskNotes } from "@/components/AskNotes";

export const metadata = { title: "Ask AI" };

export default async function AskNotesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, ai_blocked, updated_at")
    .order("updated_at", { ascending: false })
    .limit(300);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/notes" className="text-base text-muted hover:text-foreground">
        ‹ Notes
      </Link>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Ask AI</h1>
      <p className="mt-1 text-base text-muted">Ask a question about up to 5 notes you choose.</p>
      {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load notes: {error.message}</p>}
      <AskNotes notes={(data ?? []).map((n) => ({ id: n.id, title: displayTitle(n.title), blocked: n.ai_blocked }))} />
    </div>
  );
}
