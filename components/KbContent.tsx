import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Components } from "react-markdown";
import { MermaidDiagram } from "@/components/kb/MermaidDiagram";

// remark-breaks: source content uses single newlines between lines (e.g.
// "• bullet" lines), not markdown's blank-line paragraph breaks — without
// it every line would get mashed into one paragraph.
const remarkPlugins = [remarkBreaks];

const components: Components = {
  h1: (props) => <h1 className="mb-3 mt-6 text-xl font-semibold text-brand-red" {...props} />,
  h2: (props) => <h2 className="mb-2 mt-5 text-lg font-semibold" {...props} />,
  h3: (props) => <h3 className="mb-2 mt-4 text-base font-semibold" {...props} />,
  p: (props) => <p className="mb-3 text-sm leading-relaxed whitespace-pre-line" {...props} />,
  ul: (props) => <ul className="mb-3 list-inside list-disc space-y-1 text-sm" {...props} />,
  ol: (props) => <ol className="mb-3 list-inside list-decimal space-y-1 text-sm" {...props} />,
  a: (props) => <a className="text-brand-red underline" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  // ```mermaid fenced blocks render as a diagram instead of a code block.
  // `pre` skips its own wrapper for those, since MermaidDiagram renders its
  // own container (avoids nesting a diagram inside a scrollable <pre> box).
  pre: (props) => {
    const { children, ...rest } = props;
    const child = isValidElement<{ className?: string }>(children) ? children : null;
    const isMermaid = child?.props.className?.includes("language-mermaid") ?? false;

    if (isMermaid) {
      return <>{children}</>;
    }

    return (
      <pre className="mb-3 overflow-x-auto rounded-md bg-surface p-3 text-xs" {...rest}>
        {children}
      </pre>
    );
  },
  code: (props) => {
    const { className, children, ...rest } = props;
    const language = /language-(\w+)/.exec(className ?? "")?.[1];

    if (language === "mermaid") {
      return <MermaidDiagram chart={String(children).replace(/\n$/, "")} />;
    }

    return (
      <code className="rounded bg-surface px-1 py-0.5 text-xs" {...rest}>
        {children}
      </code>
    );
  },
  table: (props) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b border-border px-2 py-1 font-medium" {...props} />,
  td: (props) => <td className="border-b border-border px-2 py-1" {...props} />,
};

export function KbContent({ content }: { content: string }) {
  return (
    <div className="max-w-none">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
