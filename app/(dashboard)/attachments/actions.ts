"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import {
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENTS_PER_PARENT,
  PARENT_COLUMN,
  SIGNED_URL_SECONDS,
  checkFile,
  isOwnPath,
  type AttachmentParent,
} from "@/lib/attachments";
import type { AttachmentView } from "@/lib/attachments-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARENT_TABLE = { issue: "issue_log", kb_entry: "kb_entries", note: "notes" } as const;
const isParent = (v: unknown): v is AttachmentParent => v === "issue" || v === "kb_entry" || v === "note";

export type RegisterResult = { ok: true; attachment: AttachmentView } | { ok: false; error: string };

function refresh(parent: AttachmentParent) {
  if (parent === "issue") revalidatePath("/issues");
  else if (parent === "note") revalidatePath("/notes", "layout");
  else revalidatePath("/knowledge-base", "layout");
}

/**
 * Daftarkan file yang BARU SAJA diunggah browser langsung ke Storage (jalur `<user_id>/<uuid>.<ext>`). Semua masukan dari
 * browser diperiksa ulang di sini: jenis dari ekstensi (daftar tetap), ukuran, jalur milik pengguna ini, induk ada dan milik
 * pengguna ini, batas jumlah, dan file benar-benar ada di Storage (ukurannya diambil dari Storage, bukan dari klaim browser).
 */
export async function registerAttachment(raw: unknown): Promise<RegisterResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!isParent(r.parent) || typeof r.parentId !== "string" || !UUID_RE.test(r.parentId)) return { ok: false, error: "Unknown item." };
  if (typeof r.path !== "string" || !isOwnPath(r.path, user.id)) return { ok: false, error: "Invalid file location." };
  const parent = r.parent;
  const path = r.path;
  const claimedSize = typeof r.size === "number" ? r.size : 0;
  const claimedName = typeof r.fileName === "string" ? r.fileName : "";

  const db = await createClient();
  const discard = async () => {
    await db.storage.from(ATTACHMENT_BUCKET).remove([path]).catch(() => undefined);
  };

  const check = checkFile(claimedName, claimedSize);
  if (!check.ok) {
    await discard();
    return check;
  }

  const { data: owner } = await db.from(PARENT_TABLE[parent]).select("id").eq("id", r.parentId).maybeSingle();
  if (!owner) {
    await discard();
    return { ok: false, error: "That item no longer exists." };
  }
  const { count } = await db.from("attachments").select("id", { count: "exact", head: true }).eq(PARENT_COLUMN[parent], r.parentId);
  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_PARENT) {
    await discard();
    return { ok: false, error: `At most ${MAX_ATTACHMENTS_PER_PARENT} attachments per item.` };
  }

  const slash = path.indexOf("/");
  const { data: listed } = await db.storage.from(ATTACHMENT_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1) });
  const object = (listed ?? []).find((o) => o.name === path.slice(slash + 1));
  if (!object) return { ok: false, error: "The upload did not reach storage. Try again." };
  const storedSize = typeof object.metadata?.size === "number" ? object.metadata.size : claimedSize;
  const sizeCheck = checkFile(check.fileName, storedSize);
  if (!sizeCheck.ok) {
    await discard();
    return sizeCheck;
  }

  const { data, error } = await db
    .from("attachments")
    .insert({
      user_id: user.id,
      issue_id: parent === "issue" ? r.parentId : null,
      kb_entry_id: parent === "kb_entry" ? r.parentId : null,
      note_id: parent === "note" ? r.parentId : null,
      storage_path: path,
      file_name: check.fileName,
      mime_type: check.mime,
      size_bytes: storedSize,
    })
    .select("id")
    .single();
  if (error || !data) {
    await discard();
    return { ok: false, error: error?.message ?? "Could not save the attachment." };
  }

  const signed = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  refresh(parent);
  return { ok: true, attachment: { id: data.id, fileName: check.fileName, mime: check.mime, size: storedSize, url: signed.data?.signedUrl ?? null } };
}

export async function removeAttachment(id: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: false, error: "Unknown attachment." };
  const db = await createClient();
  const { data: row } = await db.from("attachments").select("storage_path, issue_id, kb_entry_id, note_id").eq("id", id).maybeSingle();
  if (!row) return { ok: true }; // sudah tidak ada
  // File dihapus dulu: kalau gagal, baris tetap ada dan bisa dicoba lagi (tidak ada file yatim yang tak terlacak).
  const removed = await db.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);
  if (removed.error) return { ok: false, error: removed.error.message };
  const { error } = await db.from("attachments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh(row.issue_id ? "issue" : row.note_id ? "note" : "kb_entry");
  return { ok: true };
}
