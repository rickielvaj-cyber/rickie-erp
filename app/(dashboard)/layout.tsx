import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/SidebarNav";
import { logout } from "./actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
        <h1 className="px-3 text-lg font-semibold text-brand-red">Personal Workspace</h1>
        <p className="mb-6 px-3 text-xs text-muted">{user.email}</p>

        <SidebarNav />

        <form action={logout} className="mt-auto pt-6">
          <button
            type="submit"
            className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-muted transition-colors hover:border-brand-red hover:text-brand-red"
          >
            Keluar
          </button>
        </form>
      </aside>

      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
