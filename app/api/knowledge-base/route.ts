import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { isKbModuleSlug } from "@/lib/kb/modules";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const moduleFilter = request.nextUrl.searchParams.get("module");
  if (moduleFilter && !isKbModuleSlug(moduleFilter)) {
    return NextResponse.json({ error: `Unknown module: ${moduleFilter}` }, { status: 400 });
  }

  let query = supabase.from("kb_entries").select("*").order("title", { ascending: true });
  if (moduleFilter) query = query.eq("module", moduleFilter);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}
