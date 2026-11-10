import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { supabaseIssuer } from "./config";

// Memvalidasi access token OAuth Supabase untuk endpoint MCP.
//
// * Tanda tangan: lewat JWKS Supabase (kunci asimetris; HS256 sengaja ditolak karena
//   butuh JWT secret yang tidak boleh ada di sini).
// * Klaim: iss = issuer Supabase, aud = "authenticated", exp belum lewat, sub ada,
//   role = "authenticated".
// * client_id WAJIB ada: klaim itu hanya ada di token yang diterbitkan OAuth server
//   Supabase. Token sesi biasa (login web) tidak punya, jadi tidak diterima di sini.
//
// Data TIDAK dibaca dengan hak khusus: token yang sama dipakai membuat klien Supabase
// (lib/mcp/supabase.ts), jadi RLS berlaku persis seperti di situs.

const AUDIENCE = "authenticated";
const ALGORITHMS = ["ES256", "RS256"];

// Galat yang berarti "tokennya yang salah" (-> 401). Galat lain (JWKS tak terjangkau, dsb.)
// dilempar supaya tidak tampak seperti token tidak sah.
const INVALID_TOKEN_CODES = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_INVALID",
  "ERR_JWS_INVALID",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWKS_NO_MATCHING_KEY",
]);

export async function verifyAccessToken(
  token: string,
  options: { issuer: string; jwks: JWTVerifyGetKey },
): Promise<AuthInfo | undefined> {
  try {
    const { payload } = await jwtVerify(token, options.jwks, {
      issuer: options.issuer,
      audience: AUDIENCE,
      algorithms: ALGORITHMS,
      requiredClaims: ["exp", "sub"],
      clockTolerance: 5,
    });
    if (payload.role !== "authenticated") return undefined;
    if (typeof payload.client_id !== "string" || !payload.client_id) return undefined;
    if (typeof payload.sub !== "string" || !payload.sub) return undefined;
    return {
      token,
      clientId: payload.client_id,
      // Supabase belum mendukung scope kustom dan tidak menaruh scope di JWT.
      scopes: [],
      expiresAt: payload.exp,
      extra: { userId: payload.sub },
    };
  } catch (error) {
    if (error instanceof errors.JOSEError && INVALID_TOKEN_CODES.has(error.code)) return undefined;
    throw error;
  }
}

let cached: { issuer: string; jwks: JWTVerifyGetKey } | null = null;

function remoteKeys() {
  const issuer = supabaseIssuer();
  if (!cached || cached.issuer !== issuer) {
    cached = {
      issuer,
      // Kunci di-cache oleh jose dan diambil ulang bila ada `kid` baru (rotasi kunci).
      jwks: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 }),
    };
  }
  return cached;
}

/** verifyToken untuk withMcpAuth: tanpa token / token tidak sah -> undefined (-> 401 karena required: true). */
export async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  return verifyAccessToken(bearerToken, remoteKeys());
}
