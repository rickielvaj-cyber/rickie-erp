import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isKbModuleSlug, kbModuleLabel } from "@/lib/kb/modules";
import { saveKbEntry } from "../actions";

export default async function KbModuleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { module } = await params;
  if (!isKbModuleSlug(module)) {
    notFound();
  }
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("kb_entries")
    .select("*")
    .eq("module", module)
    .maybeSingle();

  const action = saveKbEntry.bind(null, module);

  return (
    <div className="max-w-3xl">
      <Link href={`/kb/${module}`} className="text-sm text-muted hover:underline">
        &larr; {entry?.title ?? kbModuleLabel(module)}
      </Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold text-brand-red">
        Edit {kbModuleLabel(module)}
      </h1>

      <form action={action} className="space-y-4">
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">{error}</p>}

        <div>
          <label htmlFor="title" className="block text-sm font-medium">
            Judul
          </label>
          <input
            id="title"
            name="title"
            type="text"
            defaultValue={entry?.title ?? kbModuleLabel(module)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium">
            Konten (Markdown)
          </label>
          <textarea
            id="content"
            name="content"
            rows={20}
            defaultValue={entry?.content ?? ""}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
          >
            Simpan
          </button>
          <Link
            href={`/kb/${module}`}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
          >
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
