import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { ATTACHMENT_BUCKET, PARENT_COLUMN, SIGNED_URL_SECONDS, type AttachmentParent } from "@/lib/attachments";

type Db = SupabaseClient<Database>;

/** Bentuk lampiran yang dikirim ke browser: tanpa jalur penyimpanan, dengan tautan bertanda tangan yang kedaluwarsa. */
export type AttachmentView = {
  id: string;
  fileName: string;
  mime: string;
  size: number;
  /** Tautan bertanda tangan (berlaku ±1 jam); null bila Storage gagal membuatnya. */
  url: string | null;
};

/**
 * Lampiran untuk beberapa induk sekaligus (kunci = id induk). Tautan dibuat dalam SATU panggilan ke Storage.
 * Gagal membaca lampiran tidak menggagalkan halaman: hasilnya kosong.
 */
export async function loadAttachments(db: Db, parent: AttachmentParent, parentIds: string[]): Promise<Map<string, AttachmentView[]>> {
  const result = new Map<string, AttachmentView[]>();
  if (parentIds.length === 0) return result;
  const column = PARENT_COLUMN[parent];
  const { data, error } = await db
    .from("attachments")
    .select("id, issue_id, kb_entry_id, note_id, storage_path, file_name, mime_type, size_bytes")
    .in(column, parentIds)
    .order("created_at", { ascending: true });
  if (error || !data || data.length === 0) return result;

  const urls = new Map<string, string>();
  const signed = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrls(
    data.map((r) => r.storage_path),
    SIGNED_URL_SECONDS,
  );
  for (const s of signed.data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);

  for (const r of data) {
    const parentId = r[column];
    if (!parentId) continue;
    result.set(parentId, [
      ...(result.get(parentId) ?? []),
      { id: r.id, fileName: r.file_name, mime: r.mime_type, size: r.size_bytes, url: urls.get(r.storage_path) ?? null },
    ]);
  }
  return result;
}

/** Hapus semua file (bukan barisnya; baris ikut terhapus bersama induknya) milik satu induk. Dipanggil sebelum induk dihapus; gagal = diabaikan. */
export async function removeParentFiles(db: Db, parent: AttachmentParent, parentId: string): Promise<void> {
  try {
    const { data } = await db.from("attachments").select("storage_path").eq(PARENT_COLUMN[parent], parentId);
    const paths = (data ?? []).map((r) => r.storage_path);
    if (paths.length > 0) await db.storage.from(ATTACHMENT_BUCKET).remove(paths);
  } catch {
    // File yatim di Storage tidak mengganggu apa pun selain sedikit ruang; penghapusan induk tetap dilanjutkan.
  }
}
