import { createClient } from "@/lib/supabase/server";
import { NoteEditor } from "@/components/NoteEditor";

export const metadata = { title: "New note" };

export default async function NewNotePage() {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, canonical_name, active").eq("active", true).order("canonical_name");
  return (
    <div className="mx-auto max-w-3xl">
      <NoteEditor
        initial={{ id: null, body: "", clientId: null, pinned: false, updatedAt: null }}
        clients={(data ?? []).map((c) => ({ id: c.id, name: c.canonical_name }))}
      />
    </div>
  );
}
