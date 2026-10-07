import type { createClient } from "@/lib/supabase/server";
import { buildKbChapter, type KbChapter, type KbChapterEntryInput } from "@/lib/kb/chapter";
import { KB_MODULES, type KbModuleSlug } from "@/lib/kb/modules";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Memproses markdown satu bab jadi pohon hast makan ±60-80 ms CPU (bab terberat),
// padahal isinya jarang berubah. Hasilnya disimpan per bab di memori instance
// server dan dipakai ulang selama daftar entri + updated_at-nya sama. Pohon ini
// cuma dibaca (render & ekstraksi search), nggak pernah diubah setelah dibuat.
// updated_at berubah tiap entri disimpan (trigger di tabel), jadi edit langsung
// membuat cache bab itu kedaluwarsa.
const chapterCache = new Map<string, { key: string; chapter: KbChapter }>();

function buildChapterCached(module: KbModuleSlug, entries: KbChapterEntryInput[]): KbChapter {
  const key = entries
    .map((e) => `${e.id}@${e.updated_at}`)
    .sort()
    .join("|");
  const hit = chapterCache.get(module);
  if (hit?.key === key) return hit.chapter;

  const chapter = buildKbChapter(module, entries);
  chapterCache.set(module, { key, chapter });
  return chapter;
}

// Dipakai halaman bab, redirect entri lama, dan indeks search — semua lewat
// buildKbChapter supaya urutan entri & id heading identik.
export async function loadKbChapter(supabase: Supabase, module: KbModuleSlug) {
  const { data, error } = await supabase
    .from("kb_entries")
    .select("id, title, content, updated_at")
    .eq("module", module);
  return { chapter: buildChapterCached(module, data ?? []), error };
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

  const chapters: KbChapter[] = KB_MODULES.map(({ slug }) => buildChapterCached(slug, byModule.get(slug) ?? []));
  return { chapters, error };
}
