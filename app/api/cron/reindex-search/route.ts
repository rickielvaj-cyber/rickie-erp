import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { hasOpenAiKey } from "@/lib/search/openai";
import { describeReindex, reindexSearch } from "@/lib/search/reindex";

// Dipanggil Vercel Cron setiap hari (vercel.json): hanya konten baru/berubah yang di-embed
// ulang (dibandingkan lewat hash), jadi hari tanpa perubahan tidak memakai OpenAI sama sekali.
//
// Tidak ada sesi login di sini, jadi route ini memakai service role (melewati RLS). Karena itu:
// * wajib CRON_SECRET (kalau kosong, route menolak semua permintaan);
// * butuh SUPABASE_SERVICE_ROLE_KEY di Vercel. Tanpa kunci itu auto-reindex mati dan tombol
//   manual di Settings tetap bisa dipakai.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not set." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !hasOpenAiKey()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY must both be set." },
      { status: 503 },
    );
  }

  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  });
  try {
    const result = await reindexSearch(db);
    return NextResponse.json({ ok: true, ...result, message: describeReindex(result) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Reindex failed." },
      { status: 500 },
    );
  }
}
