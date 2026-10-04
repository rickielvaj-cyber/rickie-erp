import type { createClient } from "@/lib/supabase/server";
import { buildKbChapter, type KbChapter, type KbChapterEntryInput } from "@/lib/kb/chapter";
import { KB_MODULES, type KbModuleSlug } from "@/lib/kb/modules";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Dipakai halaman bab, redirect entri lama, dan indeks search — semua lewat
// buildKbChapter supaya urutan entri & id heading identik.
export async function loadKbChapter(supabase: Supabase, module: KbModuleSlug) {
  const { data, error } = await supabase
    .from("kb_entries")
    .select("id, title, content, updated_at")
    .eq("module", module);
  return { chapter: buildKbChapter(module, data ?? []), error };
}

export async function loadAllKbChapters(supabase: Supabase) {
  const { data, error } = await supabase
    .from("kb_entries")
    .select("id, module, title, content, updated_at");

  const byModule = new Map<string, KbChapterEntryInput[]>();
  for (const { module, ...entry } of data ?? []) {
    const list = byModule.get(module) ?? [];
    list.push(entry);
    byModule.set(module, list);
  }

  const chapters: KbChapter[] = KB_MODULES.map(({ slug }) => buildKbChapter(slug, byModule.get(slug) ?? []));
  return { chapters, error };
}
