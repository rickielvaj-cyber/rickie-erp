import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import { isKbModuleSlug, kbModuleLabel, type KbModuleSlug } from "@/lib/kb/modules";
import { kbChapterPosition, kbPrevNext } from "@/lib/kb/sequence";
import { loadKbChapter } from "@/lib/kb/data";
import { KbContent } from "@/components/KbContent";
import { EntryEditor } from "@/components/kb/EntryEditor";
import { KbOnThisPage } from "@/components/kb/KbOnThisPage";
import { KbSearch } from "@/components/kb/KbSearch";
import { KbSearchHighlighter } from "@/components/kb/KbSearchHighlighter";

function positionLabel(module: KbModuleSlug): string {
  const position = kbChapterPosition(module);
  if (position.kind === "start") return "Mulai di sini";
  if (position.kind === "reference") return "Referensi lintas bab";
  return `Langkah ${position.step} dari ${position.totalSteps}${position.parallel ? " · paralel" : ""}`;
}

function PrevNext({ module }: { module: KbModuleSlug }) {
  const links = kbPrevNext(module);
  const card = "block rounded-md border border-border p-3 transition-colors hover:border-brand-red";

  if (!links) {
    return (
      <Link href="/knowledge-base" className={card}>
        <span className="block text-xs text-muted">Bab referensi</span>
        <span className="text-sm font-medium">&larr; Kembali ke Knowledge Base</span>
      </Link>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {links.prev ? (
        <Link href={`/knowledge-base/${links.prev}`} className={card}>
          <span className="block text-xs text-muted">&larr; Sebelumnya</span>
          <span className="text-sm font-medium">{kbModuleLabel(links.prev)}</span>
        </Link>
      ) : (
        <span />
      )}
      {links.next ? (
        <Link href={`/knowledge-base/${links.next}`} className={`${card} text-right`}>
          <span className="block text-xs text-muted">Berikutnya &rarr;</span>
          <span className="text-sm font-medium">{kbModuleLabel(links.next)}</span>
        </Link>
      ) : (
        <Link href="/knowledge-base" className={`${card} text-right`}>
          <span className="block text-xs text-muted">Selesai urutan baca</span>
          <span className="text-sm font-medium">Kembali ke Knowledge Base</span>
        </Link>
      )}
    </div>
  );
}

export default async function KbChapterPage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!isKbModuleSlug(module)) {
    notFound();
  }

  const supabase = await createClient();
  const { chapter, error } = await loadKbChapter(supabase, module);
  const lastUpdated = chapter.sections.reduce<string | null>(
    (latest, { entry }) => (!latest || entry.updated_at > latest ? entry.updated_at : latest),
    null,
  );

  return (
    <div className="flex max-w-6xl gap-10">
      <div className="min-w-0 max-w-3xl flex-1">
        <Link href="/knowledge-base" className="text-sm text-muted hover:underline">
          &larr; Knowledge Base
        </Link>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-brand-red">{kbModuleLabel(module)}</h1>
            <p className="mt-1 text-xs text-muted">
              {positionLabel(module)} · {chapter.sections.length} entri
              {lastUpdated && ` · Diperbarui ${formatDateID(lastUpdated.slice(0, 10))}`}
            </p>
          </div>
          <KbSearch />
        </div>

        <div className="mt-5 xl:hidden">
          <KbOnThisPage headings={chapter.headings} defaultOpen={false} />
        </div>

        {error && (
          <p className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
            Gagal memuat entri: {error.message}
          </p>
        )}

        {!error && chapter.sections.length === 0 && (
          <p className="mt-6 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
            Belum ada entri untuk modul ini.
          </p>
        )}

        <div data-kb-chapter className="mt-8 space-y-10">
          {chapter.sections.map(({ entry, tree }) => (
            <article key={entry.id} className="border-t border-border pt-6 first:border-t-0 first:pt-0">
              <EntryEditor entryId={entry.id} initialTitle={entry.title} initialContent={entry.content}>
                <KbContent tree={tree} />
              </EntryEditor>
            </article>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <PrevNext module={module} />
        </div>
      </div>

      <aside className="hidden w-60 shrink-0 xl:block">
        <div className="sticky top-8">
          <KbOnThisPage headings={chapter.headings} defaultOpen />
        </div>
      </aside>

      <Suspense>
        <KbSearchHighlighter />
      </Suspense>
    </div>
  );
}
