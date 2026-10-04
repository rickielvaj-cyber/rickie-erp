import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { Root } from "hast";
import { MermaidDiagram } from "@/components/kb/MermaidDiagram";

// Render hast dari buildKbChapter() (lib/kb/chapter.ts) — jangan parse
// markdown sendiri di sini, biar id heading selalu sama dengan indeks search.

const components: Partial<Components> = {
  h1: (props) => <h1 className="mb-3 mt-6 scroll-mt-6 text-xl font-semibold text-brand-red" {...props} />,
  h2: (props) => (
    <h2 className="mb-3 scroll-mt-6 pr-20 text-xl font-semibold text-brand-red" {...props} />
  ),
  h3: (props) => <h3 className="mb-2 mt-4 scroll-mt-6 text-base font-semibold" {...props} />,
  h4: (props) => <h4 className="mb-2 mt-3 scroll-mt-6 text-sm font-semibold" {...props} />,
  p: (props) => <p className="mb-3 text-sm leading-relaxed whitespace-pre-line" {...props} />,
  ul: (props) => <ul className="mb-3 list-inside list-disc space-y-1 text-sm" {...props} />,
  ol: (props) => <ol className="mb-3 list-inside list-decimal space-y-1 text-sm" {...props} />,
  a: (props) => <a className="text-brand-red underline" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  code: (props) => <code className="rounded bg-surface px-1 py-0.5 text-xs" {...props} />,
  pre: (props) => (
    <pre className="mb-3 overflow-x-auto rounded-md bg-surface p-3 text-xs [&_code]:bg-transparent [&_code]:p-0" {...props} />
  ),
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className="mb-3 max-w-full rounded-md border border-border" loading="lazy" {...props} />
  ),
  // Placeholder ```mermaid dari buildKbChapter. data-kb-skip: SVG-nya nggak
  // ada di indeks, jadi highlighter search juga melewatinya.
  div: (props) => {
    const chart = (props as { "data-kb-mermaid"?: string })["data-kb-mermaid"];
    if (typeof chart === "string") {
      return (
        <div data-kb-skip>
          <MermaidDiagram chart={chart} />
        </div>
      );
    }
    return <div {...props} />;
  },
  blockquote: (props) => (
    <blockquote className="mb-3 border-l-2 border-border pl-3 text-sm text-muted" {...props} />
  ),
  table: (props) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b border-border px-2 py-1 font-medium" {...props} />,
  td: (props) => <td className="border-b border-border px-2 py-1" {...props} />,
};

export function KbContent({ tree }: { tree: Root }) {
  return (
    <div className="max-w-none">
      {toJsxRuntime(tree, { Fragment, jsx, jsxs, components, passKeys: true, ignoreInvalidStyle: true })}
    </div>
  );
}
