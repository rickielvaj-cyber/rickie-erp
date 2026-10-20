import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { buildAuthUrl, googleConfigured, redirectUri } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

// Mulai sambungan Google Calendar: hanya untuk pengguna yang sudah login. `state` acak disimpan di cookie httpOnly
// dan harus cocok saat Google mengembalikan pengguna (mencegah callback yang dipalsukan pihak lain).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/todos?calendar=unconfigured#calendar", request.url));

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    buildAuthUrl({ state, redirect: redirectUri(request.nextUrl.origin), loginHint: user.email }),
  );
  response.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
