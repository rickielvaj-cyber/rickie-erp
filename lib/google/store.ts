import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { decryptToken, encryptToken } from "./crypto";
import { GoogleAuthError, refreshAccessToken, revokeToken } from "./oauth";

// google_connections tidak bisa diakses dari browser (RLS tanpa policy), jadi semua akses lewat service role di server.
// Setiap fungsi di sini menerima userId dari sesi login yang SUDAH diverifikasi pemanggil (getAuthUser).

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

export async function isConnected(userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("google_connections").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function saveConnection(userId: string, refreshToken: string, scope: string): Promise<void> {
  const { error } = await serviceClient()
    .from("google_connections")
    .upsert(
      { user_id: userId, refresh_token_enc: encryptToken(refreshToken, userId), scope, connected_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(error.message);
}

async function loadRefreshToken(userId: string): Promise<string | null> {
  const { data, error } = await serviceClient().from("google_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decryptToken(data.refresh_token_enc, userId) : null;
}

export async function deleteConnection(userId: string): Promise<void> {
  const { error } = await serviceClient().from("google_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Access token segar untuk pengguna ini, atau null bila belum tersambung. Bila Google menolak refresh token
 * (dicabut / kedaluwarsa), sambungan dihapus dan GoogleAuthError(reconnect) dilempar supaya UI meminta sambung ulang.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const refresh = await loadRefreshToken(userId);
  if (!refresh) return null;
  try {
    return await refreshAccessToken(refresh);
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reconnect) await deleteConnection(userId);
    throw error;
  }
}

/** Putuskan: cabut di Google (best effort) lalu hapus baris. */
export async function disconnect(userId: string): Promise<void> {
  const refresh = await loadRefreshToken(userId).catch(() => null);
  if (refresh) await revokeToken(refresh);
  await deleteConnection(userId);
}
