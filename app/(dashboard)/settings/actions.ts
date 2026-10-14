"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { hasEmbeddingKey } from "@/lib/search/gemini";
import { describeReindex, reindexSearch } from "@/lib/search/reindex";

export type ReindexState = { ok: boolean; message: string } | null;

// Tombol "Reindex Search": memakai sesi pengguna yang login (RLS berlaku), jadi tidak butuh service role.
export async function reindexSearchAction(_prev: ReindexState, formData: FormData): Promise<ReindexState> {
  const user = await getAuthUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  if (!hasEmbeddingKey()) return { ok: false, message: "GEMINI_API_KEY is not set on the server (see README)." };

  try {
    const supabase = await createClient();
    const result = await reindexSearch(supabase, { force: formData.get("force") === "on" });
    revalidatePath("/settings");
    return { ok: true, message: describeReindex(result) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Reindex failed." };
  }
}
