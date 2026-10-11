import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/date";
import { KB_MODULES } from "@/lib/kb/modules";
import { KB_MODULE_ICONS } from "@/lib/kb/sequence";
import { KbFlowDiagram } from "@/components/kb/KbFlowDiagram";
import { KbSearch } from "@/components/kb/KbSearch";

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
  const counts = new Map([...statsByModule].map(([slug, stats]) => [slug, stats.count]));

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col items-center gap-5 pb-12 pt-4 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="max-w-md text-base text-muted">YonSuite reference. Search for a term, or follow the reading order.</p>
        <KbSearch variant="bar" />
      </header>

      <section className="mb-14">
        <h2 className="mb-1 text-2xl font-semibold tracking-tight">Learning Path</h2>
        <p className="mb-6 text-sm text-muted">Suggested reading order. Click any chapter to open it directly.</p>
        <KbFlowDiagram counts={counts} />
      </section>

      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">All Modules</h2>
          <span className="text-sm text-muted">{KB_MODULES.length} modules</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KB_MODULES.map(({ slug, label }) => {
            const stats = statsByModule.get(slug);
            return (
              <Link
                key={slug}
                href={`/knowledge-base/${slug}`}
                className="group flex items-center gap-4 rounded-2xl border border-foreground p-4 transition-colors hover:bg-surface"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-xl"
                >
                  {KB_MODULE_ICONS[slug]}
                </span>
                <span className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-snug tracking-tight">{label}</h3>
                  <p className="mt-0.5 text-sm text-muted">
                  {stats ? `${stats.count} ${stats.count === 1 ? "entry" : "entries"} · updated ${formatDate(stats.lastUpdated.slice(0, 10))}` : "No entries yet"}
                  </p>
                </span>
                <span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5">
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
