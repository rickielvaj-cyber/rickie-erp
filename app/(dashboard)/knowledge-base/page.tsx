import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
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
        <p className="max-w-md text-base text-muted">Referensi YonSuite. Cari istilah, atau ikuti urutan baca.</p>
        <KbSearch variant="bar" />
      </header>

      <section className="mb-14">
        <h2 className="mb-1 text-2xl font-semibold tracking-tight">Alur Belajar</h2>
        <p className="mb-6 text-sm text-muted">Urutan baca yang disarankan. Klik bab mana pun untuk langsung membuka.</p>
        <KbFlowDiagram counts={counts} />
      </section>

      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Semua Modul</h2>
          <span className="text-sm text-muted">{KB_MODULES.length} modul</span>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {KB_MODULES.map(({ slug, label }) => {
            const stats = statsByModule.get(slug);
            return (
              <Link
                key={slug}
                href={`/knowledge-base/${slug}`}
                className="group flex flex-col gap-2.5 rounded-2xl border border-foreground p-5 transition-colors hover:bg-surface"
              >
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface text-2xl"
                >
                  {KB_MODULE_ICONS[slug]}
                </span>
                <h3 className="text-lg font-semibold tracking-tight">{label}</h3>
                <p className="text-sm text-muted">
                  {stats ? `${stats.count} entri · diperbarui ${formatDateID(stats.lastUpdated.slice(0, 10))}` : "Belum ada entri"}
                </p>
                <span className="mt-auto pt-1 text-sm underline underline-offset-4 group-hover:no-underline">
                  Buka modul ›
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
