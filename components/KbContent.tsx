import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const components: Components = {
  h1: (props) => <h1 className="mb-3 mt-6 text-xl font-semibold text-brand-red" {...props} />,
  h2: (props) => <h2 className="mb-2 mt-5 text-lg font-semibold" {...props} />,
  h3: (props) => <h3 className="mb-2 mt-4 text-base font-semibold" {...props} />,
  p: (props) => <p className="mb-3 text-sm leading-relaxed" {...props} />,
  ul: (props) => <ul className="mb-3 list-inside list-disc space-y-1 text-sm" {...props} />,
  ol: (props) => <ol className="mb-3 list-inside list-decimal space-y-1 text-sm" {...props} />,
  a: (props) => <a className="text-brand-red underline" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  code: (props) => <code className="rounded bg-surface px-1 py-0.5 text-xs" {...props} />,
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
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
