import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { todayISO } from "@/lib/date";
import { fetchAll } from "@/lib/export";

// Ekspor semua data ke satu berkas JSON: to-do, goals + checklist, issue log, knowledge base.
// Jalur ini hanya membaca; RLS memastikan hanya baris milik akun yang login yang ikut.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  try {
    const [todos, goals, goalItems, issues, kbEntries] = await Promise.all([
      fetchAll((from, to) =>
        supabase.from("todos").select("*").order("created_at").order("id").range(from, to),
      ),
      fetchAll((from, to) =>
        supabase.from("goals").select("*").order("created_at").order("id").range(from, to),
      ),
      fetchAll((from, to) =>
        supabase.from("goal_items").select("*").order("goal_id").order("position").order("id").range(from, to),
      ),
      fetchAll((from, to) =>
        supabase.from("issue_log").select("*").order("created_at").order("id").range(from, to),
      ),
      // Kolom search_vector (indeks pencarian turunan) sengaja tidak ikut.
      fetchAll((from, to) =>
        supabase
          .from("kb_entries")
          .select("id, module, title, content, created_at, updated_at")
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
    ]);

    const payload = {
      app: "personal-workspace",
      version: 1,
      exported_at: new Date().toISOString(),
      counts: {
        todos: todos.length,
        goals: goals.length,
        goal_items: goalItems.length,
        issue_log: issues.length,
        kb_entries: kbEntries.length,
      },
      todos,
      goals,
      goal_items: goalItems,
      issue_log: issues,
      kb_entries: kbEntries,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="personal-workspace-export-${todayISO()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 500 },
    );
  }
}
