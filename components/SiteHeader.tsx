import { getAuthUser } from "@/lib/supabase/auth";
import { TopNav } from "@/components/TopNav";

// Dipasang di root layout: ada di semua halaman, termasuk Home dan Login yang publik.
export async function SiteHeader() {
  const user = await getAuthUser();

  return <TopNav email={user?.email ?? null} />;
}
