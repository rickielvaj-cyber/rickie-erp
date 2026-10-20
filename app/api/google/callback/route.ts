import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { safeEqual } from "@/lib/google/crypto";
import { exchangeCode, googleConfigured, redirectUri } from "@/lib/google/oauth";
import { saveConnection } from "@/lib/google/store";

export const dynamic = "force-dynamic";

function back(request: NextRequest, status: string) {
  const response = NextResponse.redirect(new URL(`/todos?calendar=${status}#calendar`, request.url));
  response.cookies.delete({ name: "g_oauth_state", path: "/api/google" });
  return response;
}

// Google mengembalikan pengguna ke sini dengan ?code=...&state=.... Yang diterima hanya bila pengguna masih login DAN
// state cocok dengan cookie yang kita pasang di /api/google/connect. Refresh token langsung dienkripsi dan disimpan;
// tidak pernah dikirim ke browser.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!googleConfigured()) return back(request, "unconfigured");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(request, "denied");

  const expected = request.cookies.get("g_oauth_state")?.value;
  const state = params.get("state");
  const code = params.get("code");
  if (!expected || !state || !code || !safeEqual(expected, state)) return back(request, "failed");

  try {
    const tokens = await exchangeCode(code, redirectUri(request.nextUrl.origin));
    await saveConnection(user.id, tokens.refreshToken, tokens.scope);
    return back(request, "connected");
  } catch (error) {
    console.error("google callback failed:", error instanceof Error ? error.message : error);
    return back(request, "failed");
  }
}
