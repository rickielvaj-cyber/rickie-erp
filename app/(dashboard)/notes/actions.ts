"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { indexNote, unindexNote } from "@/lib/search/note-index";
import { removeParentFiles } from "@/lib/attachments-server";
import { isNoteId, noteTitle, parseNoteInput } from "@/lib/notes";

// Penyimpanan otomatis catatan. Tanpa redirect dan tanpa revalidasi daftar di setiap ketikan: daftar diambil ulang saat dibuka.

export type SaveResult =
  | { ok: true; id: string; updatedAt: string }
  | { ok: false; conflict?: boolean; error: string };

/** Perbarui indeks pencarian setelah respons terkirim; kegagalan diabaikan (reindex penuh akan menyusul). */
function reindexLater(run: () => Promise<void>) {
  try {
    after(async () => {
      try {
        await run();
      } catch (error) {
        console.error("note index skipped:", error instanceof Error ? error.message : error);
      }
    });
  } catch {
    // di luar konteks permintaan: tidak ada yang perlu dijadwalkan
  }
}

/**
 * Simpan catatan. `id` kosong = catatan baru (dibuat pada simpan pertama, jadi tidak ada catatan kosong yatim).
 * `baseUpdatedAt` = updated_at yang terakhir dilihat browser; bila catatan sudah diubah dari tempat lain, simpan ditolak
 * (conflict) supaya tulisan di perangkat lain tidak tertimpa diam-diam.
 */
export async function saveNote(id: string | null, baseUpdatedAt: string | null, raw: unknown): Promise<SaveResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const parsed = parseNoteInput(raw);
  if (!parsed.ok) return parsed;
  if (id !== null && !isNoteId(id)) return { ok: false, error: "Unknown note." };

  const db = await createClient();
  const { body, clientId } = parsed.value;
  const title = noteTitle(body);

  let clientName: string | null = null;
  if (clientId) {
    const { data } = await db.from("clients").select("canonical_name").eq("id", clientId).maybeSingle();
    if (!data) return { ok: false, error: "That client no longer exists." };
    clientName = data.canonical_name;
  }

  if (id === null) {
    const { data, error } = await db
      .from("notes")
      .insert({ user_id: user.id, title, body, client_id: clientId })
      .select("id, updated_at")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not save the note." };
    reindexLater(() => indexNote(db, { id: data.id, user_id: user.id, title, body, clientName }));
    return { ok: true, id: data.id, updatedAt: data.updated_at };
  }

  let update = db.from("notes").update({ title, body, client_id: clientId }).eq("id", id);
  if (baseUpdatedAt) update = update.eq("updated_at", baseUpdatedAt);
  const { data, error } = await update.select("id, updated_at").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    const { data: exists } = await db.from("notes").select("id").eq("id", id).maybeSingle();
    return exists
      ? { ok: false, conflict: true, error: "This note was changed on another device. Reload to see the latest version." }
      : { ok: false, error: "This note was deleted." };
  }
  reindexLater(() => indexNote(db, { id, user_id: user.id, title, body, clientName }));
  return { ok: true, id, updatedAt: data.updated_at };
}

/** Menyematkan juga menaikkan updated_at (trigger), jadi nilai baru dikembalikan agar simpan otomatis berikutnya tidak dianggap bentrok. */
export type RemoteNote = { updatedAt: string; body: string; clientId: string | null; pinned: boolean };

/** Versi terbaru satu catatan untuk editor yang sedang terbuka. null = catatan sudah dihapus (dari perangkat lain). */
export async function fetchNote(id: string): Promise<{ ok: true; note: RemoteNote | null } | { ok: false }> {
  if (!isNoteId(id)) return { ok: false };
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const db = await createClient();
  const { data, error } = await db.from("notes").select("body, client_id, pinned, updated_at").eq("id", id).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, note: data ? { updatedAt: data.updated_at, body: data.body, clientId: data.client_id, pinned: data.pinned } : null };
}

export async function setNotePinned(id: string, pinned: boolean): Promise<{ ok: true; updatedAt: string } | { ok: false }> {
  if (!isNoteId(id)) return { ok: false };
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const db = await createClient();
  const { data, error } = await db.from("notes").update({ pinned }).eq("id", id).select("updated_at").maybeSingle();
  revalidatePath("/notes");
  return error || !data ? { ok: false } : { ok: true, updatedAt: data.updated_at };
}

export async function deleteNote(id: string): Promise<{ ok: boolean }> {
  if (!isNoteId(id)) return { ok: false };
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const db = await createClient();
  await removeParentFiles(db, "note", id); // file lampiran dibersihkan dulu; barisnya ikut terhapus (cascade)
  const { error } = await db.from("notes").delete().eq("id", id);
  if (error) return { ok: false };
  reindexLater(() => unindexNote(db, id));
  revalidatePath("/notes");
  revalidatePath("/");
  return { ok: true };
}

/** Hapus langsung dari daftar (tanpa membuka catatan). Untuk <form action>, jadi tidak mengembalikan nilai. */
export async function removeNote(id: string): Promise<void> {
  await deleteNote(id);
}
