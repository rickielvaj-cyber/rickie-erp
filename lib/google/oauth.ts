// OAuth 2.0 (authorization code, akses offline) untuk Google Calendar. Hanya dipanggil dari server.
// URL bisa diganti lewat env HANYA untuk pengujian terhadap server tiruan.

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const REVOKE_URL = () => process.env.GOOGLE_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    /** true = refresh token sudah tidak berlaku (dicabut/kedaluwarsa): pengguna harus menyambungkan ulang. */
    readonly reconnect = false,
  ) {
    super(message);
  }
}

/** Env yang dibutuhkan agar fitur ini hidup. Tanpa itu halaman menampilkan petunjuk, bukan galat. */
export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/google/callback`;
}

export function buildAuthUrl(args: { state: string; redirect: string; loginHint?: string | null }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: args.redirect,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    // offline + consent: memastikan Google selalu memberi refresh_token (tanpa prompt, penyambungan ulang tidak memberinya).
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: args.state,
    ...(args.loginHint ? { login_hint: args.loginHint } : {}),
  }).toString();
  return url.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...body,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || json.error) {
    const reason = json.error_description ?? json.error ?? `HTTP ${response.status}`;
    throw new GoogleAuthError(`Google token request failed: ${reason}`, json.error === "invalid_grant");
  }
  return json;
}

export async function exchangeCode(code: string, redirect: string) {
  const json = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
  if (!json.refresh_token || !json.access_token) throw new GoogleAuthError("Google did not return a refresh token. Try connecting again.");
  return { accessToken: json.access_token, refreshToken: json.refresh_token, scope: json.scope ?? GOOGLE_SCOPE };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const json = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (!json.access_token) throw new GoogleAuthError("Google did not return an access token.");
  return json.access_token;
}

/** Cabut akses di sisi Google (best effort: gagal tidak menghalangi pemutusan di sini). */
export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => undefined);
}
