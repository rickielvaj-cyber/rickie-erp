import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { loadAllKbChapters } from "@/lib/kb/data";
import { kbChapterSearchSections } from "@/lib/kb/chapter";

// Section untuk indeks search di browser. Sumbernya cuma tabel kb_entries, lewat
// jalur render yang sama dengan halaman bab — anchor dijamin cocok dengan DOM.
export async function GET() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chapters, error } = await loadAllKbChapters(supabase);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { sections: chapters.flatMap(kbChapterSearchSections) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
