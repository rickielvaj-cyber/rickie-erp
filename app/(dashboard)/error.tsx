"use client";

import { useEffect } from "react";
import { logClientError } from "@/app/(dashboard)/settings/error-actions";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Galat server sudah dicatat oleh instrumentation.ts (dengan digest yang sama). Di sini hanya galat render di BROWSER (tanpa digest).
  useEffect(() => {
    if (error.digest) return;
    void logClientError({ name: error.name, message: error.message, stack: error.stack, path: window.location.pathname }).catch(() => undefined);
  }, [error]);

  return (
    <div className="max-w-lg rounded-md border border-border bg-surface p-6">
      <h2 className="font-medium text-danger">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">{error.message || "Failed to load this page."}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Try again
      </button>
    </div>
  );
}
