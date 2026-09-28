import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import { isKbModuleSlug, kbModuleLabel } from "@/lib/kb/modules";
import { KbContent } from "@/components/KbContent";

export default async function KbModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  if (!isKbModuleSlug(module)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: entry, error } = await supabase
    .from("kb_entries")
    .select("*")
    .eq("module", module)
    .maybeSingle();

  return (
    <div className="max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Link href="/kb" className="text-sm text-muted hover:underline">
            &larr; Knowledge Base
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-brand-red">
            {entry?.title ?? kbModuleLabel(module)}
          </h1>
          {entry && (
            <p className="text-xs text-muted">Diperbarui {formatDateID(entry.updated_at.slice(0, 10))}</p>
          )}
        </div>
        <Link
          href={`/kb/${module}/edit`}
          className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
        >
          Edit
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
          Gagal memuat konten: {error.message}
        </p>
      )}

      {!error && !entry && (
        <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted">Belum ada konten untuk modul ini.</p>
          <Link
            href={`/kb/${module}/edit`}
            className="mt-3 inline-block rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
          >
            Mulai Isi
          </Link>
        </div>
      )}

      {entry && (
        <div className="mt-4">
          <KbContent content={entry.content} />
        </div>
      )}
    </div>
  );
}
