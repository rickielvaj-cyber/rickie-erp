import Link from "next/link";
import { kbModuleLabel, type KbModuleSlug } from "@/lib/kb/modules";
import { KB_MODULE_ICONS, KB_REFERENCE, KB_START_HERE, KB_STEPS } from "@/lib/kb/sequence";

type Counts = Map<string, number>;

function NodePill({
  slug,
  count,
  variant = "step",
}: {
  slug: KbModuleSlug;
  count?: number;
  variant?: "step" | "start" | "reference";
}) {
  const styles = {
    step: "border-border bg-background hover:border-foreground",
    start: "border-accent bg-accent text-white hover:bg-accent-hover",
    reference: "border-dashed border-muted/60 bg-surface text-muted hover:border-foreground hover:text-foreground",
  }[variant];

  return (
    <Link
      href={`/knowledge-base/${slug}`}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${styles}`}
    >
      <span aria-hidden="true">{KB_MODULE_ICONS[slug]}</span>
      <span>{kbModuleLabel(slug)}</span>
      {count !== undefined && (
        <span className={`text-xs font-normal ${variant === "start" ? "text-white/80" : "text-muted"}`}>
          {count}
        </span>
      )}
    </Link>
  );
}

// Satu baris timeline: marker di rail kiri + garis ke baris berikutnya.
function Row({
  marker,
  connect,
  children,
}: {
  marker: React.ReactNode;
  connect: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-5">
      <div className="relative flex w-8 shrink-0 justify-center">
        {connect && <span aria-hidden="true" className="absolute -bottom-5 top-8 w-0.5 bg-border" />}
        {marker}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}

export function KbFlowDiagram({ counts }: { counts: Counts }) {
  return (
    <nav aria-label="Knowledge Base learning path">
      <ol>
        <Row
          connect
          marker={
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent bg-background text-foreground">
              <svg viewBox="0 0 16 16" className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden="true">
                <path d="M4 2.5v11l9-5.5z" />
              </svg>
            </span>
          }
        >
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-foreground">Start here</p>
          <NodePill slug={KB_START_HERE} count={counts.get(KB_START_HERE)} variant="start" />
        </Row>

        {KB_STEPS.map((step, i) => (
          <Row
            key={step.join("+")}
            connect={i < KB_STEPS.length - 1}
            marker={
              <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {i + 1}
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {step.map((slug) => (
                <NodePill key={slug} slug={slug} count={counts.get(slug)} />
              ))}
              {step.length > 1 && <span className="text-xs text-muted">parallel — any order</span>}
            </div>
          </Row>
        ))}
      </ol>

      <div className="ml-12 mt-4 rounded-md border border-dashed border-border p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Cross-chapter reference</p>
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Not sequential steps — open any time you need them, from any chapter.
        </p>
        <div className="flex flex-wrap gap-2">
          {KB_REFERENCE.map((slug) => (
            <NodePill key={slug} slug={slug} count={counts.get(slug)} variant="reference" />
          ))}
        </div>
      </div>
    </nav>
  );
}
