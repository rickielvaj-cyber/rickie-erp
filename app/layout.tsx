import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Workspace — ERP Consultant",
  description: "Personal workspace: Knowledge Base, To-Do, Notes, Goals, Issue Log, and Weekly Summary.",
  applicationName: "Personal Workspace",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Workspace", statusBarStyle: "default" },
};

// Pasang ke layar utama iPhone/Android: judul pendek, ikon sentuh, dan mode layar penuh.
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
