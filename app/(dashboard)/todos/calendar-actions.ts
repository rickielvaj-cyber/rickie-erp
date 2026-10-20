"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { disconnect } from "@/lib/google/store";

// Putuskan Google Calendar: cabut akses di Google (best effort) lalu hapus token tersimpan.
export async function disconnectGoogleCalendar() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  await disconnect(user.id);
  revalidatePath("/todos");
  redirect("/todos?calendar=disconnected#calendar");
}
