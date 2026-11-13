"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { THEME_EVENT } from "@/lib/theme";

// Mermaid's themeVariables need literal color values (not CSS custom properties), so a light and a dark set are kept here by hand
// (dark values match --background / --surface / --foreground in app/globals.css). The diagram is drawn again when the theme changes.
const FONT = "var(--font-inter), ui-sans-serif, system-ui, sans-serif";
const MERMAID_LIGHT = {
  primaryColor: "#fafafa",
  primaryBorderColor: "#111111",
  primaryTextColor: "#111111",
  lineColor: "#555555",
  secondaryColor: "#ffffff",
  tertiaryColor: "#ffffff",
  fontFamily: FONT,
};
const MERMAID_DARK = {
  primaryColor: "#1c2029",
  primaryBorderColor: "#b4bac6",
  primaryTextColor: "#e7e9ee",
  lineColor: "#9aa1ae",
  secondaryColor: "#161920",
  tertiaryColor: "#161920",
  fontFamily: FONT,
};

function subscribeTheme(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
// `color-scheme` di <html> sudah mengikuti pilihan tema dan perangkat (lihat globals.css), jadi nilai terhitungnya adalah sumber kebenaran.
const darkSnapshot = () => getComputedStyle(document.documentElement).colorScheme === "dark";

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rawId = useId();
  const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const dark = useSyncExternalStore(subscribeTheme, darkSnapshot, () => false);

  useEffect(() => {
    let cancelled = false;

    import("mermaid").then(async ({ default: mermaid }) => {
      if (cancelled) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: dark ? MERMAID_DARK : MERMAID_LIGHT,
      });

      try {
        const { svg } = await mermaid.render(diagramId, chart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram.");
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId, dark]);

  if (error) {
    return (
      <div className="mb-3 rounded-md border border-border bg-danger-soft p-3 text-xs text-danger">
        Failed to render mermaid diagram: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mb-3 overflow-x-auto rounded-md border border-border bg-background p-4 [&_svg]:mx-auto"
    />
  );
}
