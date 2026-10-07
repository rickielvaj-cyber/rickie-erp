import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Workspace — ERP Consultant",
  description: "Workspace pribadi: Knowledge Base, To-Do, Issue Log, dan Ringkasan Mingguan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
