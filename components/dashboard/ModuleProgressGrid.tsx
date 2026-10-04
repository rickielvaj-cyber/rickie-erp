"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLastVisited, getReadEntryIds, type LastVisited } from "@/lib/kb/progress";

type ModuleProgressGridProps = {
  modules: { slug: string; label: string }[];
  entryIdsByModule: Record<string, string[]>;
};

export function ModuleProgressGrid({ modules, entryIdsByModule }: ModuleProgressGridProps) {
  const [readIds, setReadIds] = useState<Set<string> | null>(null);
  const [lastVisited, setLastVisitedState] = useState<LastVisited | null>(null);

  // localStorage only exists client-side — read it after mount, not during
  // render, so the server-rendered HTML and first client render still match.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setReadIds(getReadEntryIds());
    setLastVisitedState(getLastVisited());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div>
      {lastVisited && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-muted">Lanjutkan dari terakhir</h2>
          <Link
            href={`/knowledge-base/${lastVisited.module}/${lastVisited.id}`}
            className="block rounded-md border border-border bg-surface p-4 transition-colors hover:border-brand-red"
          >
            <p className="text-xs text-muted">
              {modules.find((m) => m.slug === lastVisited.module)?.label ?? lastVisited.module}
            </p>
            <p className="font-medium text-brand-red">{lastVisited.title}</p>
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Semua Modul</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map(({ slug, label }) => {
            const entryIds = entryIdsByModule[slug] ?? [];
            const total = entryIds.length;
            const readCount = readIds ? entryIds.filter((id) => readIds.has(id)).length : 0;
            const percent = total > 0 ? Math.round((readCount / total) * 100) : 0;

            return (
              <Link
                key={slug}
                href={`/knowledge-base/${slug}`}
                className="rounded-md border border-border p-4 transition-colors hover:border-brand-red"
              >
                <h3 className="font-medium">{label}</h3>
                <p className="mt-1 text-xs text-muted">
                  {total === 0 ? "Belum ada entri" : `${readCount}/${total} dibaca`}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-brand-red transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
