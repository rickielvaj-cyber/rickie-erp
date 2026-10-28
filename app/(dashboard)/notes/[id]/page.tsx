import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isNoteId } from "@/lib/notes";
import { NoteEditor } from "@/components/NoteEditor";
import { loadAttachments } from "@/lib/attachments-server";
import { getAuthUser } from "@/lib/supabase/auth";

export const metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isNoteId(id)) notFound();

  const supabase = await createClient();
  const [noteResult, clientsResult] = await Promise.all([
    supabase.from("notes").select("id, body, client_id, pinned, updated_at").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, canonical_name, active").order("canonical_name"),
  ]);
  const note = noteResult.data;
  if (!note) notFound();
  const user = await getAuthUser();
  const attachments = (await loadAttachments(supabase, "note", [note.id])).get(note.id) ?? [];

  // Klien aktif untuk dipilih, ditambah klien yang sudah tertaut ke catatan ini (walau sudah nonaktif).
  const clients = (clientsResult.data ?? []).filter((c) => c.active || c.id === note.client_id);
  return (
    <div className="mx-auto max-w-3xl">
      <NoteEditor
        initial={{ id: note.id, body: note.body, clientId: note.client_id, pinned: note.pinned, updatedAt: note.updated_at }}
        clients={clients.map((c) => ({ id: c.id, name: c.canonical_name }))}
        userId={user?.id ?? ""}
        attachments={attachments}
      />
    </div>
  );
}
