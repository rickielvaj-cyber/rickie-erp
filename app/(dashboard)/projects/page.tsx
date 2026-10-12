import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/date";
import { kindOf } from "@/lib/clients";
import { PHASE_STATUS_LABEL, STANDARD_PHASES, currentPhase, isOverdue, phaseProgress } from "@/lib/projects";
import type { Client, Project, ProjectPartner, ProjectPhase } from "@/lib/types";
import { ProgressBar, ProjectStatusPill } from "@/components/projects/ProjectBits";
import { createProject } from "./actions";

type SearchParams = { show?: string; new?: string; error?: string };
type Show = "open" | "done" | "all";

const FILTERS: [Show, string][] = [
  ["open", "Open"],
  ["done", "Done"],
  ["all", "All"],
];

const field =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const show: Show = params.show === "done" || params.show === "all" ? params.show : "open";
  const isNew = params.new === "1";
  const today = todayISO();

  const supabase = await createClient();
  const [projectsResult, phasesResult, partnersResult, clientsResult, todosResult, issuesResult] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("project_phases").select("*"),
    supabase.from("project_partners").select("*"),
    supabase.from("clients").select("*").order("canonical_name", { ascending: true }),
    supabase.from("todos").select("project_id, status").not("project_id", "is", null),
    supabase.from("issue_log").select("project_id").not("project_id", "is", null),
  ]);

  const clients: Client[] = clientsResult.data ?? [];
  const clientName = new Map(clients.map((c) => [c.id, c.canonical_name]));
  const allProjects: Project[] = projectsResult.data ?? [];
  const projects = allProjects.filter((p) =>
    show === "all" ? true : show === "done" ? p.status === "done" : p.status !== "done",
  );
  const fetchError =
    projectsResult.error ?? phasesResult.error ?? partnersResult.error ?? clientsResult.error ?? todosResult.error ?? issuesResult.error;

  const phasesBy = new Map<string, ProjectPhase[]>();
  for (const phase of phasesResult.data ?? []) phasesBy.set(phase.project_id, [...(phasesBy.get(phase.project_id) ?? []), phase]);
  const partnersBy = new Map<string, ProjectPartner[]>();
  for (const pp of partnersResult.data ?? []) partnersBy.set(pp.project_id, [...(partnersBy.get(pp.project_id) ?? []), pp]);
  const openTodos = new Map<string, number>();
  for (const t of todosResult.data ?? []) {
    if (t.project_id && t.status !== "done") openTodos.set(t.project_id, (openTodos.get(t.project_id) ?? 0) + 1);
  }
  const issueCount = new Map<string, number>();
  for (const i of issuesResult.data ?? []) {
    if (i.project_id) issueCount.set(i.project_id, (issueCount.get(i.project_id) ?? 0) + 1);
  }

  // Kelompokkan per klien (abjad); di dalam klien, proyek terbaru di atas.
  const byClient = new Map<string, Project[]>();
  for (const p of projects) byClient.set(p.client_id, [...(byClient.get(p.client_id) ?? []), p]);
  const groups = Array.from(byClient.entries()).sort(([a], [b]) => (clientName.get(a) ?? "").localeCompare(clientName.get(b) ?? ""));

  const tabClass = (active: boolean) =>
    `rounded-full border px-4 py-1 text-sm transition-colors ${
      active ? "border-accent bg-accent text-white" : "border-foreground hover:bg-surface"
    }`;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-base text-muted">Client work by phase, with partners and the to-dos and issues behind it.</p>
        </div>
        {!isNew && (
          <Link
            href="/projects?new=1"
            className="rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
          >
            + New project
          </Link>
        )}
      </div>

      {isNew && (
        <div className="mt-8">
          <NewProjectForm clients={clients} error={params.error} />
        </div>
      )}

      <div className="mt-8 flex gap-2" role="group" aria-label="Project status filter">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={value === "open" ? "/projects" : `/projects?show=${value}`}
            aria-current={show === value ? "true" : undefined}
            className={tabClass(show === value)}
          >
            {label}
          </Link>
        ))}
      </div>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load data: {fetchError.message}</p>
      )}

      {groups.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
          {allProjects.length === 0
            ? "No projects yet. Click “+ New project” to add your first one."
            : show === "done"
              ? "No finished projects yet."
              : "No open projects."}
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(([clientId, list]) => (
            <section key={clientId} aria-label={clientName.get(clientId) ?? "Client"}>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">{clientName.get(clientId) ?? "Unknown client"}</h2>
              <ul className="flex flex-col gap-3">
                {list.map((project) => {
                  const phases = phasesBy.get(project.id) ?? [];
                  const progress = phaseProgress(phases);
                  const current = currentPhase(phases);
                  const partners = (partnersBy.get(project.id) ?? [])
                    .map((pp) => clientName.get(pp.partner_id))
                    .filter((n): n is string => Boolean(n))
                    .sort((a, b) => a.localeCompare(b));
                  const overdue = isOverdue(project.target_date, today, project.status === "done");
                  const todos = openTodos.get(project.id) ?? 0;
                  const issues = issueCount.get(project.id) ?? 0;
                  return (
                    <li key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="group block rounded-2xl border border-foreground p-5 transition-colors hover:bg-surface"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-xl font-semibold tracking-tight group-hover:underline">{project.name}</span>
                          <ProjectStatusPill status={project.status} />
                        </div>
                        {partners.length > 0 && <p className="mt-1 text-sm text-muted">With {partners.join(", ")}</p>}
                        <div className="mt-3">
                          <ProgressBar done={progress.done} total={progress.total} label={`Phase progress: ${project.name}`} />
                        </div>
                        <p className="mt-2 text-sm">
                          {current ? (
                            <>
                              <span className="text-muted">Now:</span> {current.name}{" "}
                              <span className="text-muted">({PHASE_STATUS_LABEL[current.status].toLowerCase()})</span>
                            </>
                          ) : progress.total > 0 ? (
                            <span className="text-muted">All phases done</span>
                          ) : null}
                        </p>
                        <p className="mt-1.5 text-sm text-muted">
                          {project.target_date && (
                            <span className={overdue ? "font-medium text-danger" : undefined}>
                              {overdue ? "Overdue · " : "Target "}
                              {formatDate(project.target_date)}
                              {" · "}
                            </span>
                          )}
                          {todos} open {todos === 1 ? "to-do" : "to-dos"} · {issues} {issues === 1 ? "issue" : "issues"}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NewProjectForm({ clients, error }: { clients: Client[]; error?: string }) {
  const active = clients.filter((c) => c.active);
  const partners = active.filter((c) => kindOf(c) === "partner");

  return (
    <form action={createProject} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">New project</h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Project name
          </label>
          <input id="name" name="name" type="text" required placeholder="e.g. Project Nagiya" className={field} />
        </div>
        <div>
          <label htmlFor="client_id" className="block text-sm font-medium">
            Client
          </label>
          <select id="client_id" name="client_id" required defaultValue="" className={field}>
            <option value="" disabled>
              Select client
            </option>
            {(["client", "partner"] as const).map((kind) => {
              const group = active.filter((c) => kindOf(c) === kind);
              if (group.length === 0) return null;
              return (
                <optgroup key={kind} label={kind === "client" ? "Clients" : "Partners"}>
                  {group.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.canonical_name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <p className="mt-1 text-xs text-muted">
            Not listed?{" "}
            <Link href="/clients" className="underline underline-offset-2 hover:text-foreground">
              Add a client or partner
            </Link>
          </p>
        </div>
      </div>

      {partners.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">Partners involved (optional)</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
            {partners.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-base">
                <input type="checkbox" name="partner_ids" value={p.id} className="h-4 w-4 accent-foreground" />
                {p.canonical_name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue="active" className={field}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label htmlFor="start_date" className="block text-sm font-medium">
            Start date
          </label>
          <input id="start_date" name="start_date" type="date" className={field} />
        </div>
        <div>
          <label htmlFor="target_date" className="block text-sm font-medium">
            Target date
          </label>
          <input id="target_date" name="target_date" type="date" className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="note" className="block text-sm font-medium">
          Note (optional)
        </label>
        <textarea id="note" name="note" rows={2} className={field} />
      </div>

      <label className="flex items-start gap-2 text-base">
        <input type="checkbox" name="standard_phases" defaultChecked className="mt-1 h-4 w-4 accent-foreground" />
        <span>
          Start with the standard phases
          <span className="block text-sm text-muted">{STANDARD_PHASES.join(" → ")}. You can rename, reorder, or remove them later.</span>
        </span>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Create project
        </button>
        <Link
          href="/projects"
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
