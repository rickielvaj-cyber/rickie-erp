import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { searchAll } from "@/lib/search/query";
import { normalizeQuery } from "@/lib/search/text";

// Embedding query + 2 panggilan database: bisa beberapa detik, jangan di-cache.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Wajib login: setiap pencarian memakai kuota OpenAI dan membaca data pribadi.
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  if (!query) return NextResponse.json({ error: "Type at least 2 characters." }, { status: 400 });

  try {
    const supabase = await createClient();
    return NextResponse.json(await searchAll(supabase, query));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}
