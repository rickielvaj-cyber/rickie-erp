import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KB_MODULES } from "@/lib/kb/modules";

async function getStats() {
  const supabase = await createClient();

  const [{ data: diagramRows }, { data: allEntries }] = await Promise.all([
    supabase.from("kb_entries").select("module").ilike("content", "%```mermaid%"),
    supabase.from("kb_entries").select("module"),
  ]);

  const modulesWithDiagrams = new Set((diagramRows ?? []).map((r) => r.module)).size;

  const entryCountByModule = new Map<string, number>();
  for (const entry of allEntries ?? []) {
    entryCountByModule.set(entry.module, (entryCountByModule.get(entry.module) ?? 0) + 1);
  }

  return {
    totalEntries: allEntries?.length ?? 0,
    modulesWithDiagrams,
    entryCountByModule,
  };
}

export default async function DashboardPage() {
  const { totalEntries, modulesWithDiagrams, entryCountByModule } = await getStats();

  const stats = [
    { label: "Total Modul KB", value: KB_MODULES.length },
    { label: "Total Entri", value: totalEntries },
    { label: "Modul dengan Diagram", value: modulesWithDiagrams },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold text-brand-red">Dashboard</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-border bg-surface p-4">
            <p className="text-2xl font-semibold text-brand-red">{stat.value}</p>
            <p className="mt-1 text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Semua Modul</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {KB_MODULES.map(({ slug, label }) => {
            const count = entryCountByModule.get(slug) ?? 0;
            return (
              <Link
                key={slug}
                href={`/knowledge-base/${slug}`}
                className="rounded-md border border-border p-4 transition-colors hover:border-brand-red"
              >
                <h3 className="font-medium">{label}</h3>
                <p className="mt-1 text-xs text-muted">{count === 0 ? "Belum ada entri" : `${count} entri`}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
