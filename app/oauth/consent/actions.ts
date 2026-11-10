"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";

/** Approve / Deny permintaan OAuth (supabase.auth.oauth). Setelah itu pengguna dikirim ke redirect_url dari Supabase. */
export async function decideAuthorization(formData: FormData) {
  const authorizationId = String(formData.get("authorization_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (!authorizationId || authorizationId.length > 200) redirect("/oauth/consent");

  const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  const user = await getAuthUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const supabase = await createClient();
  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (error || !data?.redirect_url) {
    redirect(`${here}&error=${encodeURIComponent(error?.message ?? "Could not complete the request.")}`);
  }
  redirect(data.redirect_url);
}
