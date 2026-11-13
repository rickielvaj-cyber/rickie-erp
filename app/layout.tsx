import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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
// themeColor mengikuti tema perangkat (bilah alamat di HP). Pilihan tema yang eksplisit di situs tidak bisa memengaruhinya.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: skrip di <head> menyetel data-theme sebelum React hidrasi (tanpa itu halaman berkedip saat memuat).
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
