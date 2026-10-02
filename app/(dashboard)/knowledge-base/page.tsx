import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import { KB_MODULES } from "@/lib/kb/modules";

export default async function KnowledgeBasePage() {
  const supabase = await createClient();
  const { data: entries } = await supabase.from("kb_entries").select("module, updated_at");

  const statsByModule = new Map<string, { count: number; lastUpdated: string }>();
  for (const entry of entries ?? []) {
    const existing = statsByModule.get(entry.module);
    if (!existing) {
      statsByModule.set(entry.module, { count: 1, lastUpdated: entry.updated_at });
    } else {
      existing.count += 1;
      if (entry.updated_at > existing.lastUpdated) existing.lastUpdated = entry.updated_at;
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-red">Knowledge Base</h1>
        <Link
          href="/knowledge-base/search"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
        >
          Cari
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KB_MODULES.map(({ slug, label }) => {
          const stats = statsByModule.get(slug);
          return (
            <Link
              key={slug}
              href={`/knowledge-base/${slug}`}
              className="rounded-md border border-border p-4 transition-colors hover:border-brand-red"
            >
              <h3 className="font-medium">{label}</h3>
              <p className="mt-1 text-xs text-muted">
                {stats ? `${stats.count} entri` : "Belum ada entri"}
              </p>
              {stats && (
                <p className="mt-0.5 text-xs text-muted">
                  Diperbarui {formatDateID(stats.lastUpdated.slice(0, 10))}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
