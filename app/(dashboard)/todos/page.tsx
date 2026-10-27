import { EMPTY_MUTED } from "@/lib/ui";
import { safeReturnPath } from "@/lib/return-to";
import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { CalendarSection, CalendarSkeleton } from "@/components/CalendarSection";
import { WeekBoard } from "@/components/WeekBoard";
import { formatScheduled } from "@/lib/google/layout";
import {
  addDaysISO,
  formatDayMonth,
  formatLongDay,
  isISODate,
  mondayOfISO,
  todayISO,
} from "@/lib/date";
import { sortPhases } from "@/lib/projects";
import type { Goal, Todo, TodoPriority } from "@/lib/types";
import { ProjectPhasePicker, type PickerProject } from "@/components/projects/ProjectPhasePicker";
import { TodoDeleteButton } from "@/components/TodoDeleteButton";
import { TodoUndoToast } from "@/components/TodoUndoToast";
import { createTodo, createTodoForDay, moveTodoToToday, toggleTodoDone, updateTodo } from "./actions";

const PRIORITY_LABEL: Record<TodoPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// Hitam-putih: prioritas dibedakan lewat isi pill, bukan warna.
const PRIORITY_PILL: Record<TodoPriority, string> = {
  high: "bg-foreground text-background border-foreground",
  medium: "border-foreground",
  low: "border-border text-muted",
};

type SearchParams = {
  show?: string;
  priority?: string;
  goal?: string;
  week?: string;
  new?: string;
  edit?: string;
  error?: string;
  calendar?: string;
  block?: string;
  from?: string;
};

type Show = "all" | "open" | "done";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GoalOption = Pick<Goal, "id" | "title" | "status">;

function buildHref(params: { show?: Show; priority?: string; goal?: string; week?: string }) {
  const q = new URLSearchParams();
  if (params.show && params.show !== "all") q.set("show", params.show);
  if (params.priority && params.priority !== "all") q.set("priority", params.priority);
  if (params.goal && params.goal !== "all") q.set("goal", params.goal);
  if (params.week) q.set("week", params.week);
  const s = q.toString();
  return s ? `/todos?${s}` : "/todos";
}

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const show: Show = params.show === "open" || params.show === "done" ? params.show : "all";
  const priority = ["low", "medium", "high"].includes(params.priority ?? "") ? params.priority! : "all";
  // Filter Goal: "all" | "none" (tanpa goal) | id goal tertentu.
  const goal = params.goal === "none" || UUID_RE.test(params.goal ?? "") ? params.goal! : "all";
  const isNew = params.new === "1";
  const editId = params.edit ?? null;

  const today = todayISO();
  const weekParam = isISODate(params.week) ? mondayOfISO(params.week) : null;
  const weekStart = weekParam ?? mondayOfISO(today);
  const weekEnd = addDaysISO(weekStart, 6);
  const isCurrentWeek = weekStart === mondayOfISO(today);

  const supabase = await createClient();
  const authUser = await getAuthUser();

  // Panel "Hari ini": tugas jatuh tempo hari ini + yang terlewat/belum bertanggal
  // selama belum selesai (biar nggak hilang dari pandangan). Filter berlaku di
  // panel ini saja; pelacak mingguan selalu menampilkan semua tugas minggunya.
  let todayQuery = supabase
    .from("todos")
    .select("*")
    .or(
      `due_date.eq.${today},and(due_date.lt.${today},status.neq.done),and(due_date.is.null,status.neq.done)`,
    );
  if (priority !== "all") todayQuery = todayQuery.eq("priority", priority as TodoPriority);
  if (show === "done") todayQuery = todayQuery.eq("status", "done");
  if (show === "open") todayQuery = todayQuery.neq("status", "done");
  if (goal === "none") todayQuery = todayQuery.is("goal_id", null);
  else if (goal !== "all") todayQuery = todayQuery.eq("goal_id", goal);

  const [todayResult, weekResult, editResult, goalsResult, projectsResult, clientsResult, phasesResult] = await Promise.all([
    todayQuery
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("todos")
      .select("*")
      .gte("due_date", weekStart)
      .lte("due_date", weekEnd)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    editId ? supabase.from("todos").select("*").eq("id", editId).maybeSingle() : Promise.resolve(null),
    supabase.from("goals").select("id, title, status").order("created_at", { ascending: true }),
    supabase.from("projects").select("id, name, client_id, status").order("created_at", { ascending: false }),
    supabase.from("clients").select("id, canonical_name"),
    supabase.from("project_phases").select("*"),
  ]);

  const todayTodos = todayResult.data ?? [];
  const weekTodos = weekResult.data ?? [];
  const editingTodo = editResult?.data ?? null;
  const goals: GoalOption[] = goalsResult.data ?? [];
  const goalTitles = new Map(goals.map((g) => [g.id, g.title]));
  const activeGoals = goals.filter((g) => g.status === "active");
  const projectRows = projectsResult.data ?? [];
  const projectNames = new Map(projectRows.map((p) => [p.id, p.name]));
  const clientNames = new Map((clientsResult.data ?? []).map((c) => [c.id, c.canonical_name]));
  const phaseRows = phasesResult.data ?? [];
  const phaseNames = new Map(phaseRows.map((ph) => [ph.id, ph.name]));
  const projectOptions: PickerProject[] = projectRows.map((p) => ({
    id: p.id,
    done: p.status === "done",
    label: `${clientNames.get(p.client_id) ?? "Client"} — ${p.name}`,
    phases: sortPhases(phaseRows.filter((ph) => ph.project_id === p.id)).map((ph) => ({ id: ph.id, name: ph.name })),
  }));
  // Label "Proyek · Fase" per to-do (kunci = id to-do), dipakai di daftar Hari ini dan pelacak mingguan.
  const projectTitles = new Map<string, string>();
  for (const t of [...todayTodos, ...weekTodos]) {
    const name = t.project_id ? projectNames.get(t.project_id) : undefined;
    if (!name) continue;
    const phase = t.phase_id ? phaseNames.get(t.phase_id) : undefined;
    projectTitles.set(t.id, phase ? `${name} · ${phase}` : name);
  }
  const fetchError = todayResult.error ?? weekResult.error ?? goalsResult.error ?? phasesResult.error;

  const overdue = todayTodos.filter((t) => t.due_date !== null && t.due_date < today);
  const dueToday = todayTodos.filter((t) => t.due_date === today);
  const undated = todayTodos.filter((t) => t.due_date === null);

  // Untuk bagian Calendar: to-do terbuka yang belum tertaut (pilihan "Link to a to-do"), judul to-do yang sudah tertaut,
  // dan to-do yang dituju tombol "Block time" (?block=<id>) supaya dialognya langsung terbuka.
  const seenTodos = new Map<string, Todo>();
  for (const t of [...todayTodos, ...weekTodos]) seenTodos.set(t.id, t);
  const linkable = Array.from(seenTodos.values())
    .filter((t) => t.status !== "done" && !t.calendar_event_id)
    .slice(0, 50)
    .map((t) => ({ id: t.id, title: t.title, date: t.due_date }));
  const linkedTitles = Object.fromEntries(
    Array.from(seenTodos.values())
      .filter((t) => t.calendar_event_id)
      .map((t) => [t.calendar_event_id as string, t.title]),
  );
  let prefill: { todoId: string; title: string; date: string } | null = null;
  if (UUID_RE.test(params.block ?? "")) {
    const { data: target } = await supabase.from("todos").select("id, title, due_date, status, calendar_event_id").eq("id", params.block!).maybeSingle();
    if (target && target.status !== "done" && !target.calendar_event_id) prefill = { todoId: target.id, title: target.title, date: target.due_date ?? today };
  }
  const calendarCloseHref = `${buildHref({ show, priority, goal, week: weekParam ?? undefined })}#calendar`;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const weekDone = weekTodos.filter((t) => t.status === "done").length;

  const tabClass = (active: boolean) =>
    `rounded-full border px-4 py-1 text-sm transition-colors ${
      active ? "border-accent bg-accent text-white" : "border-foreground hover:bg-surface"
    }`;

  return (
    <div className="mx-auto">
      {(isNew || editingTodo) && (
        <div className="mx-auto mb-10 max-w-2xl">
          <TodoForm key={editingTodo?.id ?? "new"} todo={editingTodo} goals={goals} projects={projectOptions} error={params.error} from={safeReturnPath(params.from)} />
        </div>
      )}

      {/* ---- Hari ini ---- */}
      <section aria-labelledby="today-heading" className="mx-auto flex max-w-2xl flex-col gap-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 id="today-heading" className="text-4xl font-semibold tracking-tight">
              Today
            </h1>
            <p className="mt-1 text-base text-muted">{formatLongDay(today)}</p>
          </div>
          {!isNew && !editingTodo && (
            <Link
              href="/todos?new=1"
              className="shrink-0 rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
            >
              + Add task
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex gap-2" role="group" aria-label="Status filter">
            {(
              [
                ["all", "All"],
                ["open", "Open"],
                ["done", "Done"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={buildHref({ show: value, priority, goal, week: weekParam ?? undefined })}
                aria-current={show === value ? "true" : undefined}
                className={tabClass(show === value)}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm" role="group" aria-label="Priority filter">
            <span className="text-muted">Priority</span>
            {(
              [
                ["all", "All"],
                ["high", "High"],
                ["medium", "Medium"],
                ["low", "Low"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={buildHref({ show, priority: value, goal, week: weekParam ?? undefined })}
                aria-current={priority === value ? "true" : undefined}
                className={
                  priority === value ? "font-medium underline underline-offset-4" : "text-muted hover:text-foreground"
                }
              >
                {label}
              </Link>
            ))}
          </div>
          {goals.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" role="group" aria-label="Goal filter">
              <span className="text-muted">Goal</span>
              {[
                { value: "all", label: "All" },
                { value: "none", label: "No goal" },
                ...activeGoals.map((g) => ({ value: g.id, label: g.title })),
              ].map(({ value, label }) => (
                <Link
                  key={value}
                  href={buildHref({ show, priority, goal: value, week: weekParam ?? undefined })}
                  aria-current={goal === value ? "true" : undefined}
                  className={
                    goal === value ? "font-medium underline underline-offset-4" : "text-muted hover:text-foreground"
                  }
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {fetchError && (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
            Failed to load data: {fetchError.message}
          </p>
        )}

        <div className="flex flex-col gap-6">
          <TaskGroup title="Overdue" tone="danger" todos={overdue} goalTitles={goalTitles} projectTitles={projectTitles} moveToToday={today} />
          <TaskGroup title={overdue.length || undated.length ? "Today" : undefined} todos={dueToday} goalTitles={goalTitles} projectTitles={projectTitles} />
          <TaskGroup title="No date" todos={undated} goalTitles={goalTitles} projectTitles={projectTitles} />

          {todayTodos.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
              {show === "done" ? "No tasks completed today yet." : "No tasks for today. Enjoy your day."}
            </p>
          )}
        </div>

        <form action={createTodoForDay.bind(null, today)}>
          {/* Sedang memfilter satu goal: tugas baru dari kotak ini ikut tertaut ke goal itu. */}
          {UUID_RE.test(goal) && <input type="hidden" name="goal_id" value={goal} />}
          <input
            name="title"
            required
            placeholder="+ Write a new task, then press Enter"
            aria-label="New task for today"
            className="h-12 w-full rounded-2xl border border-dashed border-muted/60 px-5 text-base placeholder:text-muted focus:border-solid focus:border-foreground focus:outline-none"
          />
        </form>
      </section>

      {/* ---- Pelacak mingguan ---- */}
      <section aria-labelledby="week-heading" className="mt-16 border-t border-foreground pt-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="week-heading" className="text-3xl font-semibold tracking-tight">
              {isCurrentWeek ? "This week" : "Week"}
            </h2>
            <p className="mt-1 text-base text-muted">
              {formatDayMonth(weekStart)} – {formatDayMonth(weekEnd)} · {weekDone} of {weekTodos.length} tasks
              completed
            </p>
          </div>
          <nav aria-label="Select week" className="flex gap-2 text-sm">
            <Link
              href={buildHref({ show, priority, goal, week: addDaysISO(weekStart, -7) })}
              className="rounded-full border border-foreground px-4 py-1.5 hover:bg-surface"
            >
              ‹ Previous
            </Link>
            <Link
              href={buildHref({ show, priority, goal })}
              className={`rounded-full border border-foreground px-4 py-1.5 ${isCurrentWeek ? "bg-surface font-medium" : "hover:bg-surface"}`}
            >
              This week
            </Link>
            <Link
              href={buildHref({ show, priority, goal, week: addDaysISO(weekStart, 7) })}
              className="rounded-full border border-foreground px-4 py-1.5 hover:bg-surface"
            >
              Next ›
            </Link>
          </nav>
        </div>

        <WeekBoard
          todos={weekTodos}
          days={weekDays}
          today={today}
          week={weekParam ?? undefined}
          goalTitles={Object.fromEntries(goalTitles)}
          projectTitles={Object.fromEntries(projectTitles)}
        />
      </section>

      {authUser && (
        <Suspense fallback={<CalendarSkeleton />}>
          <CalendarSection userId={authUser.id} weekStart={weekStart} today={today} notice={params.calendar}
            linkable={linkable}
            linkedTitles={linkedTitles}
            prefill={prefill}
            closeHref={calendarCloseHref}
          />
        </Suspense>
      )}

      <TodoUndoToast />
    </div>
  );
}

function Checkbox({ todo, size = "md" }: { todo: Todo; size?: "md" | "sm" }) {
  const done = todo.status === "done";
  return (
    <form action={toggleTodoDone.bind(null, todo.id, todo.status)} className="flex">
      <button
        type="submit"
        aria-label={done ? `Mark as not done: ${todo.title}` : `Mark as done: ${todo.title}`}
        className={`flex shrink-0 items-center justify-center border border-foreground transition-colors ${
          size === "md" ? "h-5 w-5 rounded-md text-xs" : "h-4 w-4 rounded text-[10px]"
        } ${done ? "bg-foreground text-background" : "hover:bg-surface"}`}
      >
        {done ? "✓" : ""}
      </button>
    </form>
  );
}

function PriorityPill({ priority }: { priority: TodoPriority }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${PRIORITY_PILL[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

function TaskGroup({
  title,
  todos,
  tone,
  goalTitles,
  projectTitles,
  moveToToday,
}: {
  title?: string;
  todos: Todo[];
  tone?: "danger";
  goalTitles: Map<string, string>;
  projectTitles: Map<string, string>;
  /** Isi dengan tanggal hari ini untuk menampilkan tombol "Move to today" (grup Overdue). */
  moveToToday?: string;
}) {
  if (todos.length === 0) return null;
  return (
    <div>
      {title && (
        <h2 className={`mb-2 text-sm font-medium ${tone === "danger" ? "text-danger" : "text-muted"}`}>
          {title} · {todos.length}
        </h2>
      )}
      <ul className="overflow-hidden rounded-2xl border border-foreground">
        {todos.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            goalTitle={goalTitles.get(todo.goal_id ?? "")}
            projectTitle={projectTitles.get(todo.id)}
            moveToToday={moveToToday}
          />
        ))}
      </ul>
    </div>
  );
}

function TodoRow({
  todo,
  goalTitle,
  projectTitle,
  moveToToday,
}: {
  todo: Todo;
  goalTitle?: string;
  projectTitle?: string;
  moveToToday?: string;
}) {
  const done = todo.status === "done";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0">
      <Checkbox todo={todo} />
      <div className="min-w-0 flex-1 basis-40">
        <p className={`text-lg ${done ? "text-muted line-through" : ""}`}>{todo.title}</p>
        {todo.description && <p className="mt-0.5 truncate text-sm text-muted">{todo.description}</p>}
        {todo.status === "in_progress" && <p className="mt-0.5 text-xs text-muted">In progress</p>}
        {todo.calendar_event_id && (
          <p className="mt-0.5 text-xs text-muted">
            Blocked in calendar{formatScheduled(todo.scheduled_start, todo.scheduled_end) ? ` · ${formatScheduled(todo.scheduled_start, todo.scheduled_end)}` : ""}
          </p>
        )}
        {goalTitle && <p className="mt-0.5 truncate text-xs text-muted">Goal: {goalTitle}</p>}
        {projectTitle && <p className="mt-0.5 truncate text-xs text-muted">Project: {projectTitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {moveToToday && (
          <form action={moveTodoToToday.bind(null, todo.id, moveToToday)}>
            <button
              type="submit"
              className="rounded-full border border-foreground px-3 py-1 text-sm transition-colors hover:bg-surface"
            >
              Move to today
            </button>
          </form>
        )}
        <PriorityPill priority={todo.priority} />
        <div className="flex shrink-0 items-center gap-1 text-sm">
          {!done && !todo.calendar_event_id && (
            <Link
              href={`/todos?block=${todo.id}#calendar`}
              className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              Block time
            </Link>
          )}
          <Link
            href={`/todos?edit=${todo.id}`}
            className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            Edit
          </Link>
          <TodoDeleteButton todo={todo} />
        </div>
      </div>
    </li>
  );
}

function TodoForm({
  todo,
  goals,
  projects,
  error,
  from,
}: {
  todo: Todo | null;
  goals: GoalOption[];
  projects: PickerProject[];
  error?: string;
  /** Halaman asal (mis. /projects/abc): tombol Batal dan hasil simpan kembali ke sana. */
  from: string | null;
}) {
  const action = todo ? updateTodo.bind(null, todo.id) : createTodo;
  const field =
    "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">{todo ? "Edit task" : "New task"}</h2>
      {todo && from && <input type="hidden" name="from" value={from} />}

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Title
        </label>
        <input id="title" name="title" type="text" required defaultValue={todo?.title} className={field} />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={todo?.description ?? ""}
          className={field}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select id="status" name="status" defaultValue={todo?.status ?? "todo"} className={field}>
            <option value="todo">To-Do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-medium">
            Priority
          </label>
          <select id="priority" name="priority" defaultValue={todo?.priority ?? "medium"} className={field}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label htmlFor="due_date" className="block text-sm font-medium">
            Date
          </label>
          {todo?.calendar_event_id ? (
            <p id="due_date" className="mt-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-base">
              {todo.due_date ? formatDayMonth(todo.due_date) : "—"}
              {formatScheduled(todo.scheduled_start, todo.scheduled_end) ? ` · ${formatScheduled(todo.scheduled_start, todo.scheduled_end)}` : ""}
              <span className="mt-0.5 block text-xs text-muted">Set by its calendar block. Move the block in the Calendar section to change the date.</span>
            </p>
          ) : (
            <input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={todo ? (todo.due_date ?? "") : todayISO()}
              className={field}
            />
          )}
        </div>
      </div>

      <div>
        <label htmlFor="goal_id" className="block text-sm font-medium">
          Goal
        </label>
        <select id="goal_id" name="goal_id" defaultValue={todo?.goal_id ?? ""} className={`${field} ${EMPTY_MUTED}`}>
          <option value="" className="text-muted">
            No goal
          </option>
          {goals
            // Goal aktif saja untuk dipilih, kecuali goal yang sudah terpasang di tugas ini.
            .filter((g) => g.status === "active" || g.id === todo?.goal_id)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
                {g.status === "done" ? " (done)" : ""}
              </option>
            ))}
        </select>
        {goals.length === 0 && (
          <p className="mt-1 text-xs text-muted">
            No goals yet.{" "}
            <Link href="/goals?new=1" className="underline underline-offset-2 hover:text-foreground">
              Create goal
            </Link>
          </p>
        )}
      </div>

      <ProjectPhasePicker projects={projects} projectId={todo?.project_id ?? null} phaseId={todo?.phase_id ?? null} field={field} />

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href={todo && from ? from : "/todos"}
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
