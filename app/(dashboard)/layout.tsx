import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";

// Penjaga login untuk semua halaman privat. Menu atas ada di root layout.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>;
}
