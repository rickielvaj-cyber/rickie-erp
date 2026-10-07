import { formatDateID } from "@/lib/date";

// Template ringkasan mingguan untuk YonWork. Murni berbasis template, tanpa AI.
// Fungsi di sini murni (tanpa akses database) supaya mudah diuji.

export type DoneTask = { title: string; goalTitle: string | null };
export type HandledIssue = { client: string | null; module: string | null; title: string };
export type PlanTask = { title: string; dueDate: string | null; goalTitle: string | null };

const OTHER = "Other";

function range(start: string, end: string) {
  return `${formatDateID(start)} – ${formatDateID(end)}`;
}

/** Kelompokkan per Goal (abjad); yang tanpa goal di paling bawah dengan label "Other". */
function groupByGoal<T extends { goalTitle: string | null }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.goalTitle?.trim() || OTHER;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === OTHER) return 1;
    if (b === OTHER) return -1;
    return a.localeCompare(b);
  });
}

function lines(groups: [string, string[]][]) {
  const out: string[] = [];
  for (const [name, items] of groups) {
    out.push(name === OTHER ? `${OTHER}:` : `Goal: ${name}`);
    for (const item of items) out.push(`- ${item}`);
  }
  return out;
}

export function buildSummaryText({
  weekStart,
  weekEnd,
  done,
  issues,
}: {
  weekStart: string;
  weekEnd: string;
  done: DoneTask[];
  issues: HandledIssue[];
}): string {
  const out: string[] = [`Summary of This Week (${range(weekStart, weekEnd)})`, ""];

  out.push(`Tasks completed (${done.length})`);
  if (done.length === 0) {
    out.push("- No completed tasks recorded.");
  } else {
    out.push(...lines(groupByGoal(done).map(([name, rows]) => [name, rows.map((r) => r.title)] as [string, string[]])));
  }

  out.push("", `Issues handled (${issues.length})`);
  if (issues.length === 0) {
    out.push("- None.");
  } else {
    const byClient = new Map<string, HandledIssue[]>();
    for (const issue of issues) {
      const key = issue.client?.trim() || "No client";
      byClient.set(key, [...(byClient.get(key) ?? []), issue]);
    }
    const clients = Array.from(byClient.entries()).sort(
      ([a, x], [b, y]) => (a === "No client" ? 1 : b === "No client" ? -1 : y.length - x.length || a.localeCompare(b)),
    );
    for (const [client, rows] of clients) {
      out.push(`${client} (${rows.length})`);
      for (const r of rows) out.push(`- ${r.module ? `[${r.module}] ` : ""}${r.title}`);
    }
  }

  return out.join("\n");
}

export function buildPlanText({
  nextStart,
  nextEnd,
  tasks,
}: {
  nextStart: string;
  nextEnd: string;
  tasks: PlanTask[];
}): string {
  const out: string[] = [`Next Week Plan (${range(nextStart, nextEnd)})`, ""];

  if (tasks.length === 0) {
    out.push("- ");
  } else {
    const label = (t: PlanTask) => {
      if (!t.dueDate) return t.title;
      const carried = t.dueDate < nextStart ? "carried over, " : "";
      return `${t.title} (${carried}due ${formatDateID(t.dueDate)})`;
    };
    out.push(
      ...lines(
        groupByGoal(tasks).map(
          ([name, rows]) =>
            [
              name,
              [...rows]
                .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
                .map(label),
            ] as [string, string[]],
        ),
      ),
    );
  }

  return out.join("\n");
}
