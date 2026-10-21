import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/date";
import { kindOf } from "@/lib/clients";
import { PHASE_STATUSES, PHASE_STATUS_LABEL, groupTodosByPhase, isOverdue, phaseProgress, sortPhases } from "@/lib/projects";
import type { Client, Project, ProjectPhase, Todo } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ProgressBar, ProjectStatusPill, phasePillClass, phasePillText } from "@/components/projects/ProjectBits";
import { toggleTodoDone } from "../../todos/actions";
import {
  addPhase,
  createTodoForProject,
  cyclePhaseStatus,
  deletePhase,
  deleteProject,
  movePhase,
  updatePhase,
  updateProject,
} from "../actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

type SearchParams = { edit?: string; phase?: string; error?: string };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const query = await searchParams;
  const today = todayISO();

  const supabase = await createClient();
  const [projectResult, phasesResult, partnersResult, clientsResult, todosResult, issuesResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("project_phases").select("*").eq("project_id", id),
    supabase.from("project_partners").select("*").eq("project_id", id),
    supabase.from("clients").select("*").order("canonical_name", { ascending: true }),
    supabase
      .from("todos")
      .select("*")
      .eq("project_id", id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("issue_log")
      .select("id, title, module, date_resolved, client_name")
      .eq("project_id", id)
      .order("date_resolved", { ascending: false, nullsFirst: false }),
  ]);

  const project: Project | null = projectResult.data;
  if (!project) notFound();

  const clients: Client[] = clientsResult.data ?? [];
  const clientName = new Map(clients.map((c) => [c.id, c.canonical_name]));
  const phases = sortPhases<ProjectPhase>(phasesResult.data ?? []);
  const partnerIds = new Set((partnersResult.data ?? []).map((p) => p.partner_id));
  const partnerNames = Array.from(partnerIds)
    .map((pid) => clientName.get(pid))
    .filter((n): n is string => Boolean(n))
    .sort((a, b) => a.localeCompare(b));
  const todos: Todo[] = todosResult.data ?? [];
  const doneCount = todos.filter((t) => t.status === "done").length;
  const { byPhase, unphased } = groupTodosByPhase(todos, phases);
  const issues = issuesResult.data ?? [];
  const progress = phaseProgress(phases);
  const editing = query.edit === "1";
  const editingPhaseId = UUID_RE.test(query.phase ?? "") ? query.phase : null;
  const overdue = isOverdue(project.target_date, today, project.status === "done");
  const fetchError =
    projectResult.error ?? phasesResult.error ?? partnersResult.error ?? clientsResult.error ?? todosResult.error ?? issuesResult.error;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/projects" className="text-sm text-muted hover:text-foreground">
        ‹ All projects
      </Link>

      {editing ? (
        <div className="mt-4">
          <ProjectEditForm project={project} clients={clients} partnerIds={partnerIds} error={query.error} />
        </div>
      ) : (
        <header className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight">{project.name}</h1>
              <p className="mt-1 text-base text-muted">
                {clientName.get(project.client_id) ?? "Unknown client"}
                {partnerNames.length > 0 && <> · with {partnerNames.join(", ")}</>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-sm">
              <Link
                href={`/projects/${project.id}?edit=1`}
                className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                Edit
              </Link>
              <form action={deleteProject.bind(null, project.id)}>
                <ConfirmButton
                  label="Delete"
                  confirmText={`Delete project "${project.name}" and its ${phases.length} ${phases.length === 1 ? "phase" : "phases"}? Linked to-dos and issues are kept, just unlinked.`}
                  className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger"
                />
              </form>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <ProjectStatusPill status={project.status} />
            {project.start_date && <span>Started {formatDate(project.start_date)}</span>}
            {project.target_date && (
              <span className={overdue ? "font-medium text-danger" : undefined}>
                {overdue ? "Overdue · target " : "Target "}
                {formatDate(project.target_date)}
              </span>
            )}
          </div>
          {project.note && <p className="mt-3 whitespace-pre-line text-base text-muted">{project.note}</p>}
          <div className="mt-4">
            <ProgressBar done={progress.done} total={progress.total} label="Phase progress" />
          </div>
        </header>
      )}

      {!editing && query.error && !editingPhaseId && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{query.error}</p>
      )}
      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">Failed to load data: {fetchError.message}</p>
      )}

      {/* ---- Fase, masing-masing dengan daftar to-do sendiri ---- */}
      <section aria-labelledby="phases-heading" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="phases-heading" className="text-2xl font-semibold tracking-tight">
            Phases &amp; to-dos
          </h2>
          <span className="text-sm text-muted">
            {doneCount} / {todos.length} to-dos done
          </span>
        </div>
        <p className="mb-4 mt-1 text-sm text-muted">
          Each phase has its own to-do list. A phase's status follows its to-dos: all done → Done, some done → In progress. You can still
          set it by hand; it updates again the next time one of its to-dos changes.
        </p>

        {phases.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
            No phases yet. Add the first one below, then add to-dos under it.
          </p>
        ) : (
          <div className="space-y-4">
            {phases.map((phase, index) => {
              const list = byPhase.get(phase.id) ?? [];
              return (
                <div key={phase.id} className="overflow-hidden rounded-2xl border border-foreground">
                  {editingPhaseId === phase.id ? (
                    <div className="border-b border-border bg-surface p-4">
                      <PhaseEditForm projectId={project.id} phase={phase} error={query.error} />
                    </div>
                  ) : (
                    <PhaseRow
                      projectId={project.id}
                      phase={phase}
                      today={today}
                      isFirst={index === 0}
                      isLast={index === phases.length - 1}
                      todoCount={list.length}
                      todoDone={list.filter((t) => t.status === "done").length}
                    />
                  )}
                  <TodoList todos={list} today={today} />
                  <AddTodoForm projectId={project.id} phaseId={phase.id} placeholder={`+ Add a to-do to ${phase.name}`} today={today} />
                </div>
              );
            })}
          </div>
        )}

        <form action={addPhase.bind(null, project.id)} className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-muted/60 p-3">
          <input
            name="name"
            required
            placeholder="+ Add a phase (e.g. Data migration)"
            aria-label="New phase name"
            className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-background px-3.5 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add
          </button>
        </form>

        {(unphased.length > 0 || phases.length === 0) && (
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-medium text-muted">
              {phases.length === 0 ? "To-dos" : "Not in any phase"} · {unphased.length}
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border">
              <TodoList todos={unphased} today={today} />
              <AddTodoForm projectId={project.id} phaseId="" placeholder="+ Add a to-do (no phase)" today={today} />
            </div>
          </div>
        )}
      </section>

      {/* ---- Issue ---- */}
      <section aria-labelledby="issues-heading" className="mt-12">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="issues-heading" className="text-2xl font-semibold tracking-tight">
            Issues
          </h2>
          <span className="text-sm text-muted">
            {issues.length} {issues.length === 1 ? "issue" : "issues"}
          </span>
        </div>
        <p className="mb-4 mt-1 text-sm text-muted">
          Issues linked to this project. Link one by choosing the project when you add or edit an issue.
        </p>

        {issues.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">No linked issues yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-foreground">
            {issues.map((issue) => (
              <li key={issue.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-3.5 last:border-b-0">
                <Link href={`/issues?edit=${issue.id}`} className="min-w-0 flex-1 basis-60 text-lg hover:underline">
                  {issue.title}
                </Link>
                <span className="text-sm text-muted">
                  {issue.module ? `${issue.module} · ` : ""}
                  {formatDate(issue.date_resolved)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PhaseRow({
  projectId,
  phase,
  today,
  isFirst,
  isLast,
  todoCount,
  todoDone,
}: {
  projectId: string;
  phase: ProjectPhase;
  today: string;
  isFirst: boolean;
  isLast: boolean;
  todoCount: number;
  todoDone: number;
}) {
  const done = phase.status === "done";
  const overdue = isOverdue(phase.target_date, today, done);
  const move = "rounded-full px-2 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-3.5">
      <form action={cyclePhaseStatus.bind(null, projectId, phase.id, phase.status)}>
        <button
          type="submit"
          title="Click to change the status (it also updates by itself as to-dos are ticked)"
          aria-label={`${phase.name}: ${PHASE_STATUS_LABEL[phase.status]}. Click to change status`}
          className={`${phasePillClass(phase.status)} min-w-28 hover:opacity-80`}
        >
          {phasePillText(phase.status)}
        </button>
      </form>

      <div className="min-w-0 flex-1 basis-40">
        <p className={`text-lg ${done ? "text-muted line-through" : ""}`}>{phase.name}</p>
        <p className="text-xs text-muted">{todoCount === 0 ? "No to-dos yet" : `${todoDone} of ${todoCount} to-dos done`}</p>
        {(phase.start_date || phase.target_date) && (
          <p className="text-xs text-muted">
            {phase.start_date && <>From {formatDate(phase.start_date)}</>}
            {phase.start_date && phase.target_date && " · "}
            {phase.target_date && (
              <span className={overdue ? "font-medium text-danger" : undefined}>
                {overdue ? "Overdue · " : "Target "}
                {formatDate(phase.target_date)}
              </span>
            )}
          </p>
        )}
        {phase.note && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{phase.note}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 text-sm">
        <form action={movePhase.bind(null, projectId, phase.id, "up")}>
          <button type="submit" disabled={isFirst} aria-label={`Move up: ${phase.name}`} title="Move up" className={move}>
            ↑
          </button>
        </form>
        <form action={movePhase.bind(null, projectId, phase.id, "down")}>
          <button type="submit" disabled={isLast} aria-label={`Move down: ${phase.name}`} title="Move down" className={move}>
            ↓
          </button>
        </form>
        <Link
          href={`/projects/${projectId}?phase=${phase.id}`}
          className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Edit
        </Link>
        <form action={deletePhase.bind(null, projectId, phase.id)}>
          <ConfirmButton
            label="Delete"
            confirmText={`Delete phase "${phase.name}"?`}
            className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger"
          />
        </form>
      </div>
    </div>
  );
}

function TodoList({ todos, today }: { todos: Todo[]; today: string }) {
  if (todos.length === 0) return null;
  return (
    <ul>
      {todos.map((todo) => (
        <TodoRow key={todo.id} todo={todo} today={today} />
      ))}
    </ul>
  );
}

function AddTodoForm({ projectId, phaseId, placeholder, today }: { projectId: string; phaseId: string; placeholder: string; today: string }) {
  return (
    <form action={createTodoForProject.bind(null, projectId)} className="flex flex-wrap items-center gap-2 border-t border-dashed border-border px-4 py-3">
      <input type="hidden" name="phase_id" value={phaseId} />
      <input
        name="title"
        required
        placeholder={placeholder}
        aria-label={placeholder.replace(/^\+ /, "")}
        className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-background px-3.5 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
      />
      <input
        name="due_date"
        type="date"
        defaultValue={today}
        aria-label="To-do date"
        className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:border-foreground focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Add
      </button>
    </form>
  );
}

function TodoRow({ todo, today }: { todo: Todo; today: string }) {
  const done = todo.status === "done";
  const overdue = isOverdue(todo.due_date, today, done);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-3 pl-8 pr-4 last:border-b-0">
      <form action={toggleTodoDone.bind(null, todo.id, todo.status)} className="flex">
        <button
          type="submit"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark as not done: ${todo.title}` : `Mark as done: ${todo.title}`}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-foreground text-xs transition-colors ${
            done ? "bg-foreground text-background" : "hover:bg-surface"
          }`}
        >
          {done ? "✓" : ""}
        </button>
      </form>
      <div className="min-w-0 flex-1 basis-40">
        <Link href={`/todos?edit=${todo.id}`} className={`text-lg hover:underline ${done ? "text-muted line-through" : ""}`}>
          {todo.title}
        </Link>
        <p className={`text-xs ${overdue ? "font-medium text-danger" : "text-muted"}`}>
          {todo.due_date ? `${overdue ? "Overdue · " : ""}${formatDate(todo.due_date)}` : "No date"}
          {todo.status === "in_progress" ? " · In progress" : ""}
        </p>
      </div>
    </li>
  );
}

function PartnerChecklist({ partners, selected }: { partners: Client[]; selected: Set<string> }) {
  if (partners.length === 0) return null;
  return (
    <fieldset>
      <legend className="text-sm font-medium">Partners involved</legend>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
        {partners.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              name="partner_ids"
              value={p.id}
              defaultChecked={selected.has(p.id)}
              className="h-4 w-4 accent-foreground"
            />
            {p.canonical_name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProjectEditForm({
  project,
  clients,
  partnerIds,
  error,
}: {
  project: Project;
  clients: Client[];
  partnerIds: Set<string>;
  error?: string;
}) {
  // Hanya entri aktif untuk dipilih, kecuali yang sudah terpasang di proyek ini.
  const selectable = clients.filter((c) => c.active || c.id === project.client_id || partnerIds.has(c.id));
  const partners = selectable.filter((c) => kindOf(c) === "partner" && c.id !== project.client_id);

  return (
    <form action={updateProject.bind(null, project.id)} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">Edit project</h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Project name
          </label>
          <input id="name" name="name" type="text" required defaultValue={project.name} className={field} />
        </div>
        <div>
          <label htmlFor="client_id" className="block text-sm font-medium">
            Client
          </label>
          <select id="client_id" name="client_id" required defaultValue={project.client_id} className={field}>
            {(["client", "partner"] as const).map((kind) => {
              const group = selectable.filter((c) => kindOf(c) === kind);
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
        </div>
      </div>

      <PartnerChecklist partners={partners} selected={partnerIds} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={project.status} className={field}>
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
          <input id="start_date" name="start_date" type="date" defaultValue={project.start_date ?? ""} className={field} />
        </div>
        <div>
          <label htmlFor="target_date" className="block text-sm font-medium">
            Target date
          </label>
          <input id="target_date" name="target_date" type="date" defaultValue={project.target_date ?? ""} className={field} />
        </div>
      </div>

      <div>
        <label htmlFor="note" className="block text-sm font-medium">
          Note
        </label>
        <textarea id="note" name="note" rows={3} defaultValue={project.note ?? ""} className={field} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href={`/projects/${project.id}`}
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function PhaseEditForm({ projectId, phase, error }: { projectId: string; phase: ProjectPhase; error?: string }) {
  return (
    <form action={updatePhase.bind(null, projectId, phase.id)} className="space-y-3">
      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`name-${phase.id}`} className="block text-sm font-medium">
            Phase name
          </label>
          <input id={`name-${phase.id}`} name="name" required defaultValue={phase.name} className={field} />
        </div>
        <div>
          <label htmlFor={`status-${phase.id}`} className="block text-sm font-medium">
            Status
          </label>
          <select id={`status-${phase.id}`} name="status" defaultValue={phase.status} className={field}>
            {PHASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PHASE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`start-${phase.id}`} className="block text-sm font-medium">
            Start date
          </label>
          <input id={`start-${phase.id}`} name="start_date" type="date" defaultValue={phase.start_date ?? ""} className={field} />
        </div>
        <div>
          <label htmlFor={`target-${phase.id}`} className="block text-sm font-medium">
            Target date
          </label>
          <input id={`target-${phase.id}`} name="target_date" type="date" defaultValue={phase.target_date ?? ""} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor={`note-${phase.id}`} className="block text-sm font-medium">
          Note
        </label>
        <textarea id={`note-${phase.id}`} name="note" rows={2} defaultValue={phase.note ?? ""} className={field} />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href={`/projects/${projectId}`}
          className="rounded-full border border-foreground px-5 py-2 text-sm font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
