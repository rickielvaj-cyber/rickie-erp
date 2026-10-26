import type { MetadataRoute } from "next";

// PWA: bisa dipasang ke layar utama HP dan dibuka layar penuh seperti aplikasi (iPhone: Share -> Add to Home Screen).
// Tanpa service worker: situs tetap butuh koneksi (data ada di Supabase), jadi tidak ada mode offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Workspace",
    short_name: "Workspace",
    description: "Personal workspace for an ERP consultant: notes, to-dos, issues, and knowledge base.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New note", short_name: "New note", url: "/notes/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "To-Do List", short_name: "To-Do", url: "/todos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
