"use client";

import { useEffect, useId, useRef, useState } from "react";

// Matches --accent / --surface / --border in app/globals.css. Mermaid's
// themeVariables need literal color values (not CSS custom properties), so
// these are kept in sync by hand rather than read at runtime.
const MERMAID_THEME_VARIABLES = {
  primaryColor: "#fafafa",
  primaryBorderColor: "#111111",
  primaryTextColor: "#111111",
  lineColor: "#555555",
  secondaryColor: "#ffffff",
  tertiaryColor: "#ffffff",
  fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
};

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rawId = useId();
  const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    import("mermaid").then(async ({ default: mermaid }) => {
      if (cancelled) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: MERMAID_THEME_VARIABLES,
      });

      try {
        const { svg } = await mermaid.render(diagramId, chart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal render diagram.");
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId]);

  if (error) {
    return (
      <div className="mb-3 rounded-md border border-border bg-red-50 p-3 text-xs text-danger">
        Gagal render diagram mermaid: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mb-3 overflow-x-auto rounded-md border border-border bg-white p-4 [&_svg]:mx-auto"
    />
  );
}
