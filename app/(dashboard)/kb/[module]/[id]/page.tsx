import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import { isKbModuleSlug, kbModuleLabel } from "@/lib/kb/modules";
import { EntryEditor } from "@/components/kb/EntryEditor";

export default async function KbEntryPage({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const { module, id } = await params;
  if (!isKbModuleSlug(module)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("kb_entries")
    .select("*")
    .eq("module", module)
    .eq("id", id)
    .maybeSingle();

  if (!entry) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/kb/${module}`} className="text-sm text-muted hover:underline">
        &larr; {kbModuleLabel(module)}
      </Link>
      <p className="mt-1 text-xs text-muted">Diperbarui {formatDateID(entry.updated_at.slice(0, 10))}</p>

      <div className="mt-4">
        <EntryEditor entryId={entry.id} initialTitle={entry.title} initialContent={entry.content} />
      </div>
    </div>
  );
}
