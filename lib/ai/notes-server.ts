import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { type KnownName } from "@/lib/ai/redact";

/** Nama klien/partner (nama resmi + alias) dan proyek milik pengguna, untuk disensor dari teks catatan. */
export async function loadKnownNames(db: SupabaseClient<Database>): Promise<KnownName[]> {
  const [clients, projects] = await Promise.all([db.from("clients").select("canonical_name, aliases"), db.from("projects").select("name")]);
  const names: KnownName[] = [];
  for (const c of clients.data ?? []) {
    names.push({ value: c.canonical_name, kind: "CLIENT" });
    for (const alias of c.aliases ?? []) names.push({ value: alias, kind: "CLIENT" });
  }
  for (const p of projects.data ?? []) names.push({ value: p.name, kind: "PROJECT" });
  return names;
}
