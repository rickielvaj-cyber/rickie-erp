"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/lib/return-to";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // Setelah login kembali ke halaman asal (mis. /oauth/consent?authorization_id=...); hanya path relatif yang diterima.
  const next = safeReturnPath(String(formData.get("next") ?? ""));
  const nextParam = next ? "&next=" + encodeURIComponent(next) : "";

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Email and password are required.") + nextParam);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent("Incorrect email or password.") + nextParam);
  }

  redirect(next ?? "/");
}
