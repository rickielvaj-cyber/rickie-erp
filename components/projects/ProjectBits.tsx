import type { PhaseStatus, ProjectStatus } from "@/lib/types";
import { PHASE_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/projects";

// Hitam-putih: status dibedakan lewat isi pill, bukan warna (sama dengan prioritas di To-Do).
const PROJECT_PILL: Record<ProjectStatus, string> = {
  active: "border-foreground bg-foreground text-background",
  planning: "border-foreground",
  on_hold: "border-border text-muted",
  done: "border-border text-muted line-through",
};

export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${PROJECT_PILL[status]}`}>
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}

const PHASE_PILL: Record<PhaseStatus, string> = {
  in_progress: "border-foreground bg-foreground text-background",
  not_started: "border-border text-muted",
  done: "border-foreground",
};

export function phasePillClass(status: PhaseStatus) {
  return `whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${PHASE_PILL[status]}`;
}

export function phasePillText(status: PhaseStatus) {
  return status === "done" ? `✓ ${PHASE_STATUS_LABEL.done}` : PHASE_STATUS_LABEL[status];
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
      </div>
      <span className="whitespace-nowrap text-muted">
        {total === 0 ? "No phases yet" : `${done} of ${total} phases`}
      </span>
    </div>
  );
}
