import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isKbModuleSlug, kbModuleLabel } from "@/lib/kb/modules";

function snippet(content: string, maxChars = 100): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}...` : flat;
}

export default async function KbModuleEntriesPage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  if (!isKbModuleSlug(module)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: entries, error } = await supabase
    .from("kb_entries")
    .select("id, title, content, updated_at")
    .eq("module", module)
    .order("title", { ascending: true });

  return (
    <div className="max-w-3xl">
      <Link href="/knowledge-base" className="text-sm text-muted hover:underline">
        &larr; Knowledge Base
      </Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold text-brand-red">{kbModuleLabel(module)}</h1>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
          Gagal memuat entri: {error.message}
        </p>
      )}

      {!error && (entries?.length ?? 0) === 0 && (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
          Belum ada entri untuk modul ini.
        </p>
      )}

      <ul className="space-y-2">
        {(entries ?? []).map((entry) => (
          <li key={entry.id}>
            <Link
              href={`/knowledge-base/${module}/${entry.id}`}
              className="block rounded-md border border-border p-4 transition-colors hover:border-brand-red"
            >
              <h2 className="font-medium">{entry.title}</h2>
              <p className="mt-1 text-sm text-muted">{snippet(entry.content)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
