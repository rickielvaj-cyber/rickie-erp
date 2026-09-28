"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseDocxBuffer } from "@/lib/kb/parse";
import { isKbModuleSlug, kbModuleLabel } from "@/lib/kb/modules";
import type {
  ParseKbDocxResult,
  SaveKbImportInput,
  SaveKbImportResult,
} from "@/lib/kb/import-types";

export async function parseKbDocx(storagePath: string): Promise<ParseKbDocxResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesi login sudah habis, silakan login ulang." };
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from("kb-documents")
    .download(storagePath);

  if (downloadError || !blob) {
    return {
      ok: false,
      error: `Gagal mengambil file dari storage: ${downloadError?.message ?? "unknown error"}`,
    };
  }

  try {
    const buffer = Buffer.from(await blob.arrayBuffer());
    const sections = await parseDocxBuffer(buffer);

    if (sections.length === 0) {
      return { ok: false, error: "Tidak ada konten yang bisa diparse dari file ini." };
    }

    return { ok: true, sections };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal parsing file .docx.";
    return { ok: false, error: `Parsing gagal: ${message}` };
  }
}

export async function saveKbImport(input: SaveKbImportInput): Promise<SaveKbImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sesi login sudah habis, silakan login ulang." };
  }

  const byModule = new Map<string, string[]>();
  for (const section of input.sections) {
    if (!isKbModuleSlug(section.slug)) continue;
    const markdown = section.markdown.trim();
    if (!markdown) continue;
    const existing = byModule.get(section.slug) ?? [];
    existing.push(markdown);
    byModule.set(section.slug, existing);
  }

  if (byModule.size === 0) {
    return { ok: false, error: "Tidak ada section dengan modul yang dipilih." };
  }

  const rows = Array.from(byModule.entries()).map(([module, chunks]) => ({
    user_id: user.id,
    module,
    title: kbModuleLabel(module),
    content: chunks.join("\n\n"),
  }));

  const { error } = await supabase.from("kb_entries").upsert(rows, { onConflict: "user_id,module" });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/kb");
  for (const savedModule of byModule.keys()) {
    revalidatePath(`/kb/${savedModule}`);
  }

  return { ok: true, savedModules: Array.from(byModule.keys()) };
}
