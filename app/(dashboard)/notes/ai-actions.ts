"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { todayISO } from "@/lib/date";
import { isNoteId, displayTitle } from "@/lib/notes";
import { AiError, generateText, hasAiKey } from "@/lib/ai/gemini-text";
import { describeCounts, redact } from "@/lib/ai/redact";
import { loadKnownNames } from "@/lib/ai/notes-server";
import {
  AI_ASK_MAX_CHARS,
  AI_ASK_MAX_NOTES,
  AI_NOTE_MAX_CHARS,
  AI_QUESTION_MAX,
  ASK_SYSTEM,
  SUMMARY_SYSTEM,
  TIDY_SYSTEM,
  askPrompt,
  parseSummary,
  parseTidy,
  parseTodoItems,
  summaryMarkdown,
  tidyMarkdown,
  tidyPrompt,
  type ActionItem,
} from "@/lib/ai/notes";

// AI notes. Setiap fungsi di sini dipanggil hanya oleh tombol yang ditekan pengguna. Isi catatan dibaca ulang dari database
// (bukan dari browser), catatan bertanda "jangan kirim ke AI" ditolak di sini, dan teks disensor sebelum keluar server.

export type AiMode = "tidy" | "summary";
export type AiResult =
  | { ok: true; markdown: string; actionItems: ActionItem[]; sent: string }
  | { ok: false; error: string };

type NoteRow = { id: string; title: string; body: string; ai_blocked: boolean };

async function loadNote(id: string): Promise<{ ok: true; note: NoteRow } | { ok: false; error: string }> {
  if (!isNoteId(id)) return { ok: false, error: "Unknown note." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const db = await createClient();
  const { data } = await db.from("notes").select("id, title, body, ai_blocked").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "This note no longer exists." };
  if (data.ai_blocked) return { ok: false, error: "This note is marked “never send to AI”." };
  if (data.body.trim() === "") return { ok: false, error: "The note is empty." };
  if (data.body.length > AI_NOTE_MAX_CHARS) return { ok: false, error: `This note is too long for AI (max ${AI_NOTE_MAX_CHARS.toLocaleString("en-US")} characters).` };
  return { ok: true, note: data };
}

const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof AiError ? error.message : "AI request failed. Try again.",
});

/** Pratinjau: persis teks yang akan keluar dari server (sudah disensor), tanpa memanggil Gemini. */
export async function previewAiNote(id: string): Promise<{ ok: true; text: string; sent: string } | { ok: false; error: string }> {
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded;
  const db = await createClient();
  const r = redact(loaded.note.body, await loadKnownNames(db));
  return { ok: true, text: r.text, sent: describeCounts(r.counts) };
}

/** Rapikan catatan meeting ("tidy") atau ringkas ("summary"). Hasil tidak disimpan; pengguna yang memutuskan memakainya. */
export async function runAiNote(id: string, mode: AiMode): Promise<AiResult> {
  if (mode !== "tidy" && mode !== "summary") return { ok: false, error: "Unknown action." };
  if (!hasAiKey()) return { ok: false, error: "AI is off: GEMINI_API_KEY is not set on the server." };
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded;
  const db = await createClient();
  const r = redact(loaded.note.body, await loadKnownNames(db));
  try {
    const text = await generateText({
      system: mode === "tidy" ? TIDY_SYSTEM : SUMMARY_SYSTEM,
      prompt: tidyPrompt(r.text, todayISO()),
      json: true,
    });
    const sent = describeCounts(r.counts);
    if (mode === "tidy") {
      const parsed = parseTidy(text);
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        markdown: tidyMarkdown(parsed.value, r.restore),
        actionItems: parsed.value.actionItems.map((a) => ({ task: r.restore(a.task), owner: a.owner ? r.restore(a.owner) : null, due: a.due })),
        sent,
      };
    }
    const parsed = parseSummary(text);
    if (!parsed.ok) return parsed;
    return { ok: true, markdown: summaryMarkdown(parsed.value, r.restore), actionItems: [], sent };
  } catch (error) {
    return fail(error);
  }
}

export type AskResult = { ok: true; answer: string; used: string[]; sent: string } | { ok: false; error: string };

/** Tanya beberapa catatan yang dipilih (maks. 5). Catatan bertanda "jangan kirim ke AI" ditolak. */
export async function askAiNotes(noteIds: unknown, question: unknown): Promise<AskResult> {
  const q = typeof question === "string" ? question.trim() : "";
  if (!q) return { ok: false, error: "Type a question." };
  if (q.length > AI_QUESTION_MAX) return { ok: false, error: `The question is too long (max ${AI_QUESTION_MAX} characters).` };
  const ids = Array.isArray(noteIds) ? [...new Set(noteIds.filter(isNoteId))] : [];
  if (ids.length === 0) return { ok: false, error: "Choose at least one note." };
  if (ids.length > AI_ASK_MAX_NOTES) return { ok: false, error: `Choose at most ${AI_ASK_MAX_NOTES} notes.` };
  if (!hasAiKey()) return { ok: false, error: "AI is off: GEMINI_API_KEY is not set on the server." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };

  const db = await createClient();
  const { data } = await db.from("notes").select("id, title, body, ai_blocked").in("id", ids);
  const rows = ids.map((id) => (data ?? []).find((n) => n.id === id)).filter((n): n is NoteRow => Boolean(n));
  if (rows.length !== ids.length) return { ok: false, error: "One of the notes no longer exists." };
  const blocked = rows.find((n) => n.ai_blocked);
  if (blocked) return { ok: false, error: `“${displayTitle(blocked.title)}” is marked “never send to AI”. Untick it.` };
  if (rows.reduce((sum, n) => sum + n.body.length, 0) > AI_ASK_MAX_CHARS) {
    return { ok: false, error: `The chosen notes are too long together (max ${AI_ASK_MAX_CHARS.toLocaleString("en-US")} characters). Choose fewer.` };
  }

  // Satu penyensor untuk semua catatan + pertanyaan, supaya penanda yang sama berarti hal yang sama di seluruh teks.
  const names = await loadKnownNames(db);
  const joined = [...rows.map((n) => n.title), ...rows.map((n) => n.body), q];
  const r = redact(joined.join("\u0001"), names);
  const parts = r.text.split("\u0001");
  const titles = parts.slice(0, rows.length);
  const bodies = parts.slice(rows.length, rows.length * 2);
  const redactedQuestion = parts[rows.length * 2] ?? "";
  try {
    const answer = await generateText({
      system: ASK_SYSTEM,
      prompt: askPrompt(redactedQuestion, rows.map((_, i) => ({ title: titles[i], body: bodies[i] })), todayISO()),
      maxOutputTokens: 1500,
    });
    return { ok: true, answer: r.restore(answer), used: rows.map((n) => displayTitle(n.title)), sent: describeCounts(r.counts) };
  } catch (error) {
    return fail(error);
  }
}

/** Tandai catatan "jangan pernah kirim ke AI" (atau cabut tandanya). Mengembalikan updated_at baru karena trigger menaikkannya. */
export async function setNoteAiBlocked(id: string, blocked: boolean): Promise<{ ok: true; updatedAt: string } | { ok: false }> {
  if (!isNoteId(id)) return { ok: false };
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const db = await createClient();
  const { data, error } = await db.from("notes").update({ ai_blocked: Boolean(blocked) }).eq("id", id).select("updated_at").maybeSingle();
  revalidatePath("/notes");
  return error || !data ? { ok: false } : { ok: true, updatedAt: data.updated_at };
}

/** Jadikan action item (yang dicentang pengguna) to-do biasa. Tidak ada yang dibuat tanpa tombol ini. */
export async function createTodosFromActionItems(noteId: string, raw: unknown): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  if (!isNoteId(noteId)) return { ok: false, error: "Unknown note." };
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "Your session has expired. Log in again." };
  const items = parseTodoItems(raw);
  if (items.length === 0) return { ok: false, error: "Nothing to add." };

  const db = await createClient();
  const { data: note } = await db.from("notes").select("title").eq("id", noteId).maybeSingle();
  if (!note) return { ok: false, error: "This note no longer exists." };
  const description = `From note: ${displayTitle(note.title)}`;
  const { error } = await db.from("todos").insert(
    items.map((i) => ({ user_id: user.id, title: i.title, description, status: "todo" as const, priority: "medium" as const, due_date: i.dueDate })),
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/todos");
  revalidatePath("/");
  return { ok: true, created: items.length };
}
