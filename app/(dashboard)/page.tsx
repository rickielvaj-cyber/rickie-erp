import { createClient } from "@/lib/supabase/server";
import { KB_MODULES } from "@/lib/kb/modules";
import { ModuleProgressGrid } from "@/components/dashboard/ModuleProgressGrid";

async function getStats() {
  const supabase = await createClient();

  const [{ count: totalEntries }, { data: diagramRows }, { data: allEntries }] = await Promise.all([
    supabase.from("kb_entries").select("id", { count: "exact", head: true }),
    supabase.from("kb_entries").select("module").ilike("content", "%```mermaid%"),
    supabase.from("kb_entries").select("id, module"),
  ]);

  const modulesWithDiagrams = new Set((diagramRows ?? []).map((r) => r.module)).size;

  const entryIdsByModule: Record<string, string[]> = {};
  for (const entry of allEntries ?? []) {
    (entryIdsByModule[entry.module] ??= []).push(entry.id);
  }

  return {
    totalEntries: totalEntries ?? 0,
    modulesWithDiagrams,
    entryIdsByModule,
  };
}

export default async function DashboardPage() {
  const { totalEntries, modulesWithDiagrams, entryIdsByModule } = await getStats();

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

      <ModuleProgressGrid modules={KB_MODULES} entryIdsByModule={entryIdsByModule} />
    </div>
  );
}
