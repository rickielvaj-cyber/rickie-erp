import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dipanggil Vercel Cron setiap hari (vercel.json). Supabase free tier mem-pause project yang
// tidak ada aktivitas selama seminggu; satu permintaan ringan per hari mencegahnya.
// Memakai kunci anon publik: RLS membuat hasilnya kosong, tapi permintaannya tetap sampai ke database.
//
// Jika CRON_SECRET diisi di Vercel, Vercel Cron mengirimnya sebagai Bearer token dan permintaan
// tanpa token ditolak. Tanpa CRON_SECRET endpoint ini tetap tidak berbahaya (tidak mengembalikan data).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from("clients").select("id", { count: "exact", head: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
