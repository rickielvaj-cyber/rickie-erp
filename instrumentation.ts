import type { Instrumentation } from "next";

// Hook galat resmi Next.js: dipanggil untuk SETIAP galat server yang tidak tertangani (render halaman, route handler, server action, proxy),
// dengan galat aslinya (di produksi browser hanya melihat digest). Di sini dicatat ke tabel error_log (lib/error-report.ts). Hanya runtime Node.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { buildEntry } = await import("@/lib/error-log");
    const { currentRelease, writeEntry } = await import("@/lib/error-report");
    const e = error as { name?: string; message?: string; stack?: string; digest?: string };
    const entry = buildEntry({
      source: "server",
      // Pola rute (tanpa id dan query) + jenisnya: "render /(dashboard)/todos", "action /(dashboard)/todos", "route /api/mcp".
      route: `${context.routeType} ${context.routePath}`,
      method: request.method,
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      digest: e?.digest,
      release: currentRelease(),
    });
    if (entry) await writeEntry(entry);
  } catch {
    /* pencatatan tidak boleh menambah masalah */
  }
};
