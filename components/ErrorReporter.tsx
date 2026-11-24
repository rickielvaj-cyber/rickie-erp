"use client";

import { useEffect } from "react";
import { logClientError } from "@/app/(dashboard)/settings/error-actions";
import { createRateLimiter } from "@/lib/error-log";

/**
 * Tanpa tampilan. Mengirim galat JavaScript yang tidak tertangani di browser (window "error" dan "unhandledrejection") ke log galat situs.
 * Maksimal 5 laporan per menit per tab dan setiap pesan yang sama hanya sekali per pemuatan halaman. Kegagalan mengirim diabaikan (tidak dilaporkan
 * ulang, supaya tidak berputar). Galat server tidak lewat sini: itu dicatat oleh instrumentation.ts.
 */
export function ErrorReporter() {
  useEffect(() => {
    const allowed = createRateLimiter(5, 60_000);
    const seen = new Set<string>();
    const send = (name: string, message: string, stack: string) => {
      const key = `${name}|${message}`;
      if (!message || seen.has(key) || !allowed(Date.now())) return;
      seen.add(key);
      void logClientError({ name, message, stack, path: window.location.pathname }).catch(() => undefined);
    };
    const onError = (e: ErrorEvent) => send(e.error?.name ?? "Error", e.error?.message ?? e.message ?? "", e.error?.stack ?? "");
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      send(r?.name ?? "UnhandledRejection", r?.message ?? (typeof r === "string" ? r : ""), r?.stack ?? "");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
