import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addDaysISO,
  formatDayMonth,
  formatLongDay,
  formatWeekdayShort,
  isISODate,
  mondayOfISO,
  todayISO,
} from "@/lib/date";
import type { Goal, Todo, TodoPriority } from "@/lib/types";
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

  const [todayResult, weekResult, editResult, goalsResult] = await Promise.all([
    todayQuery.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    supabase
      .from("todos")
      .select("*")
      .gte("due_date", weekStart)
      .lte("due_date", weekEnd)
      .order("created_at", { ascending: true }),
    editId ? supabase.from("todos").select("*").eq("id", editId).maybeSingle() : Promise.resolve(null),
    supabase.from("goals").select("id, title, status").order("created_at", { ascending: true }),
  ]);

  const todayTodos = todayResult.data ?? [];
  const weekTodos = weekResult.data ?? [];
  const editingTodo = editResult?.data ?? null;
  const goals: GoalOption[] = goalsResult.data ?? [];
  const goalTitles = new Map(goals.map((g) => [g.id, g.title]));
  const activeGoals = goals.filter((g) => g.status === "active");
  const fetchError = todayResult.error ?? weekResult.error ?? goalsResult.error;

  const overdue = todayTodos.filter((t) => t.due_date !== null && t.due_date < today);
  const dueToday = todayTodos.filter((t) => t.due_date === today);
  const undated = todayTodos.filter((t) => t.due_date === null);

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
          <TodoForm key={editingTodo?.id ?? "new"} todo={editingTodo} goals={goals} error={params.error} />
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
          <TaskGroup title="Overdue" tone="danger" todos={overdue} goalTitles={goalTitles} moveToToday={today} />
          <TaskGroup title={overdue.length || undated.length ? "Today" : undefined} todos={dueToday} goalTitles={goalTitles} />
          <TaskGroup title="No date" todos={undated} goalTitles={goalTitles} />

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekDays.map((day) => {
            const dayTodos = weekTodos.filter((t) => t.due_date === day);
            const isToday = day === today;
            return (
              <div
                key={day}
                aria-label={`${formatLongDay(day)}${isToday ? " (today)" : ""}`}
                className={`flex min-h-[22rem] flex-col gap-3 rounded-2xl p-3.5 ${
                  isToday ? "border-2 border-foreground bg-surface" : "border border-border"
                }`}
              >
                <div className="flex items-baseline justify-between border-b border-border pb-2">
                  <span className="text-base font-medium">{formatWeekdayShort(day)}</span>
                  <span className="text-sm text-muted">{formatDayMonth(day)}</span>
                </div>

                <ul className="flex flex-col gap-2">
                  {dayTodos.map((todo) => (
                    <WeekTask key={todo.id} todo={todo} week={weekParam ?? undefined} goalTitle={goalTitles.get(todo.goal_id ?? "")} />
                  ))}
                </ul>

                <form action={createTodoForDay.bind(null, day)} className="mt-auto">
                  <input
                    name="title"
                    required
                    placeholder="+ Add"
                    aria-label={`Add task for ${formatLongDay(day)}`}
                    className="w-full rounded-lg border border-dashed border-muted/60 bg-background px-2.5 py-1.5 text-center text-sm placeholder:text-muted focus:border-solid focus:border-foreground focus:outline-none"
                  />
                </form>
              </div>
            );
          })}
        </div>
      </section>

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
  moveToToday,
}: {
  title?: string;
  todos: Todo[];
  tone?: "danger";
  goalTitles: Map<string, string>;
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
          <TodoRow key={todo.id} todo={todo} goalTitle={goalTitles.get(todo.goal_id ?? "")} moveToToday={moveToToday} />
        ))}
      </ul>
    </div>
  );
}

function TodoRow({ todo, goalTitle, moveToToday }: { todo: Todo; goalTitle?: string; moveToToday?: string }) {
  const done = todo.status === "done";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0">
      <Checkbox todo={todo} />
      <div className="min-w-0 flex-1 basis-40">
        <p className={`text-lg ${done ? "text-muted line-through" : ""}`}>{todo.title}</p>
        {todo.description && <p className="mt-0.5 truncate text-sm text-muted">{todo.description}</p>}
        {todo.status === "in_progress" && <p className="mt-0.5 text-xs text-muted">In progress</p>}
        {goalTitle && <p className="mt-0.5 truncate text-xs text-muted">Goal: {goalTitle}</p>}
      </div>
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
        <Link
          href={`/todos?edit=${todo.id}`}
          className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Edit
        </Link>
        <TodoDeleteButton todo={todo} />
      </div>
    </li>
  );
}

function WeekTask({ todo, week, goalTitle }: { todo: Todo; week?: string; goalTitle?: string }) {
  const done = todo.status === "done";
  return (
    <li className="flex items-start gap-2 text-sm leading-snug">
      <span className="mt-0.5">
        <Checkbox todo={todo} size="sm" />
      </span>
      <Link
        href={week ? `/todos?edit=${todo.id}&week=${week}` : `/todos?edit=${todo.id}`}
        title={`${PRIORITY_LABEL[todo.priority]}${goalTitle ? ` · Goal: ${goalTitle}` : ""} · click to edit`}
        className={`min-w-0 flex-1 break-words hover:underline ${done ? "text-muted line-through" : ""} ${
          todo.priority === "high" && !done ? "font-medium" : ""
        }`}
      >
        {todo.priority === "high" && !done && <span aria-label="High priority">! </span>}
        {todo.title}
      </Link>
      <TodoDeleteButton todo={todo} variant="week" />
    </li>
  );
}

function TodoForm({ todo, goals, error }: { todo: Todo | null; goals: GoalOption[]; error?: string }) {
  const action = todo ? updateTodo.bind(null, todo.id) : createTodo;
  const field =
    "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">{todo ? "Edit task" : "New task"}</h2>

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
          <input
            id="due_date"
            name="due_date"
            type="date"
            defaultValue={todo?.due_date ?? ""}
            className={field}
          />
        </div>
      </div>

      <div>
        <label htmlFor="goal_id" className="block text-sm font-medium">
          Goal
        </label>
        <select id="goal_id" name="goal_id" defaultValue={todo?.goal_id ?? ""} className={field}>
          <option value="">No goal</option>
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

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href="/todos"
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
