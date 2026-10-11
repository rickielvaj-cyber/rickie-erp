import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { Root } from "hast";
import { MermaidDiagram } from "@/components/kb/MermaidDiagram";

// Render hast dari buildKbChapter() (lib/kb/chapter.ts) — jangan parse
// markdown sendiri di sini, biar id heading selalu sama dengan indeks search.

const components: Partial<Components> = {
  // Ukuran dasar 16px + leading-7: isi KB adalah bacaan panjang. scroll-mt-28 supaya
  // judul tidak tertutup menu atas yang sticky saat dituju lewat anchor.
  h1: (props) => <h1 className="mb-4 mt-10 scroll-mt-28 text-2xl font-semibold tracking-tight text-foreground" {...props} />,
  h2: (props) => (
    <h2 className="mb-5 scroll-mt-28 pr-20 text-2xl font-semibold tracking-tight text-foreground" {...props} />
  ),
  h3: (props) => <h3 className="mb-3 mt-9 scroll-mt-28 text-lg font-semibold tracking-tight" {...props} />,
  h4: (props) => <h4 className="mb-2 mt-7 scroll-mt-28 text-base font-semibold" {...props} />,
  p: (props) => <p className="mb-4 text-base leading-7 whitespace-pre-line" {...props} />,
  ul: (props) => <ul className="mb-4 list-outside list-disc space-y-1.5 pl-6 text-base leading-7" {...props} />,
  ol: (props) => <ol className="mb-4 list-outside list-decimal space-y-1.5 pl-6 text-base leading-7" {...props} />,
  a: (props) => <a className="text-foreground underline underline-offset-2" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  code: (props) => <code className="rounded bg-surface px-1.5 py-0.5 text-[0.9em]" {...props} />,
  pre: (props) => (
    <pre className="mb-4 overflow-x-auto rounded-xl bg-surface p-4 text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0" {...props} />
  ),
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className="mb-4 max-w-full rounded-xl border border-border" loading="lazy" {...props} />
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
    <blockquote className="mb-4 border-l-4 border-border pl-4 text-base leading-7 text-muted" {...props} />
  ),
  table: (props) => (
    <div className="mb-5 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] leading-6" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b border-foreground px-3 py-2 align-bottom font-semibold" {...props} />,
  td: (props) => <td className="border-b border-border px-3 py-2 align-top" {...props} />,
};

export function KbContent({ tree }: { tree: Root }) {
  return (
    <div className="max-w-none">
      {toJsxRuntime(tree, { Fragment, jsx, jsxs, components, passKeys: true, ignoreInvalidStyle: true })}
    </div>
  );
}
