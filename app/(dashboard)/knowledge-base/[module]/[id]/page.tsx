import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isKbModuleSlug } from "@/lib/kb/modules";
import { loadKbChapter } from "@/lib/kb/data";

// URL entri lama (/knowledge-base/[module]/[id]) — sekarang semua entri tampil
// di halaman bab, jadi redirect ke anchor judul entrinya.
export default async function KbEntryRedirect({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const { module, id } = await params;
  if (!isKbModuleSlug(module)) {
    notFound();
  }

  const supabase = await createClient();
  const { chapter } = await loadKbChapter(supabase, module);
  const section = chapter.sections.find(({ entry }) => entry.id === id);
  if (!section) {
    notFound();
  }

  redirect(`/knowledge-base/${module}#${encodeURIComponent(section.anchor)}`);
}
