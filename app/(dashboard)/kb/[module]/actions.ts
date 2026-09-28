"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isKbModuleSlug, kbModuleLabel } from "@/lib/kb/modules";

export async function saveKbEntry(module: string, formData: FormData) {
  if (!isKbModuleSlug(module)) {
    redirect("/kb");
  }

  const title = String(formData.get("title") ?? "").trim() || kbModuleLabel(module);
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    redirect(`/kb/${module}/edit?error=` + encodeURIComponent("Konten wajib diisi."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("kb_entries")
    .upsert(
      { user_id: user.id, module, title, content },
      { onConflict: "user_id,module" },
    );

  if (error) {
    redirect(`/kb/${module}/edit?error=` + encodeURIComponent(error.message));
  }

  revalidatePath("/kb");
  revalidatePath(`/kb/${module}`);
  redirect(`/kb/${module}`);
}
