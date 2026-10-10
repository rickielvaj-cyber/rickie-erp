import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/date";
import type { Goal, GoalItem, GoalType, Todo, TodoPriority } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { toggleTodoDone } from "../../todos/actions";
import {
  addGoalItem,
  createTodoForGoal,
  deleteGoal,
  deleteGoalItem,
  moveGoalItem,
  toggleGoalDone,
  toggleGoalItem,
  updateGoal,
  updateGoalItem,
} from "../actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_LABEL: Record<GoalType, string> = { learning: "Learning", work: "Work" };
const PRIORITY_LABEL: Record<TodoPriority, string> = { low: "Low", medium: "Medium", high: "High" };

const field =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

type SearchParams = { edit?: string; item?: string; error?: string };

type Group = { name: string | null; items: GoalItem[] };

// Grup muncul sesuai urutan item pertamanya; item tanpa grup berkumpul tanpa judul.
function groupItems(items: GoalItem[]): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.name === item.group_name);
    if (!group) {
      group = { name: item.group_name, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const [goalResult, itemsResult, todosResult] = await Promise.all([
    supabase.from("goals").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("goal_items")
      .select("*")
      .eq("goal_id", id)
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("todos")
      .select("*")
      .eq("goal_id", id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  const goal = goalResult.data;
  if (!goal) notFound();

  const items = itemsResult.data ?? [];
  // To-do harian yang tertaut ke goal ini: yang belum selesai di atas, yang selesai di bawah.
  const linkedTodos = todosResult.data ?? [];
  const openTodos = linkedTodos.filter((t) => t.status !== "done");
  const doneTodos = linkedTodos.filter((t) => t.status === "done");
  const groups = groupItems(items);
  const groupNames = groups.map((g) => g.name).filter((n): n is string => n !== null);
  const doneCount = items.filter((i) => i.is_done).length;
  const percent = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100);
  const editingGoal = query.edit === "1";
  const editingItemId = UUID_RE.test(query.item ?? "") ? query.item : null;
  const done = goal.status === "done";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/goals" className="text-sm text-muted hover:text-foreground">
        ‹ All goals
      </Link>

      {editingGoal ? (
        <div className="mt-4">
          <GoalEditForm goal={goal} error={query.error} />
        </div>
      ) : (
        <header className="mt-4">
          <div className="flex items-start gap-4">
            <form action={toggleGoalDone.bind(null, goal.id, goal.status)} className="mt-3 flex">
              <button
                type="submit"
                role="checkbox"
                aria-checked={done}
                aria-label={done ? "Reopen this goal" : "Mark this goal as done"}
                title={done ? "Reopen goal" : "Mark goal as done"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-foreground text-sm transition-colors ${
                  done ? "bg-foreground text-background" : "hover:bg-surface"
                }`}
              >
                {done ? "✓" : ""}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <h1 className={`text-4xl font-semibold tracking-tight ${done ? "text-muted line-through" : ""}`}>
                {goal.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs">{TYPE_LABEL[goal.type]}</span>
                {done && goal.completed_at ? (
                  <span>Completed {formatDate(todayISO(new Date(goal.completed_at)))}</span>
                ) : (
                  <span>Tick the box left of the title to mark the goal as done.</span>
                )}
              </div>
              {goal.description && <p className="mt-3 whitespace-pre-line text-base text-muted">{goal.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-sm">
              <Link
                href={`/goals/${goal.id}?edit=1`}
                className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
              >
                Edit
              </Link>
              <form action={deleteGoal.bind(null, goal.id)}>
                <ConfirmButton
                  label="Delete"
                  confirmText={`Delete goal "${goal.title}" and its ${items.length} checklist ${items.length === 1 ? "item" : "items"}? Linked to-dos are not deleted.`}
                  className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger"
                />
              </form>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 text-sm">
            <span className="whitespace-nowrap">
              {doneCount} / {items.length} {items.length === 1 ? "item" : "items"}
            </span>
            {items.length > 0 && (
              <>
                <div
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Checklist progress"
                  className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-border"
                >
                  <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
                </div>
                <span className="text-muted">{percent}%</span>
              </>
            )}
          </div>
        </header>
      )}

      {!editingGoal && !editingItemId && query.error && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{query.error}</p>
      )}
      {(goalResult.error || itemsResult.error || todosResult.error) && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Failed to load data: {(goalResult.error ?? itemsResult.error ?? todosResult.error)?.message}
        </p>
      )}

      {/* <details> bawaan browser: bisa dilipat/dibuka tanpa JavaScript. Default terbuka. */}
      <details open className="group mt-10">
        <summary className="mb-4 flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-lg [&::-webkit-details-marker]:hidden">
          <h2 id="checklist-heading" className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="inline-block text-base text-muted transition-transform group-open:rotate-90"
            >
              ▸
            </span>
            Checklist
          </h2>
          <span className="text-sm text-muted">
            {doneCount} / {items.length} done
            <span className="ml-2 group-open:hidden">· click to expand</span>
          </span>
        </summary>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
            No items yet. Add the first step below.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.name ?? "__none"}>
                {group.name && <h3 className="mb-2 text-sm font-medium text-muted">{group.name}</h3>}
                <ul className="overflow-hidden rounded-2xl border border-foreground">
                  {group.items.map((item, index) =>
                    editingItemId === item.id ? (
                      <li key={item.id} className="border-b border-border bg-surface p-4 last:border-b-0">
                        <ItemEditForm goalId={goal.id} item={item} groupNames={groupNames} error={query.error} />
                      </li>
                    ) : (
                      <ItemRow
                        key={item.id}
                        goalId={goal.id}
                        item={item}
                        isFirst={index === 0}
                        isLast={index === group.items.length - 1}
                      />
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}

        <form action={addGoalItem.bind(null, goal.id)} className="mt-6 space-y-3 rounded-2xl border border-dashed border-muted/60 p-4">
          <p className="text-sm font-medium">Add item</p>
          <input
            name="title"
            required
            placeholder="+ Write a new item"
            aria-label="New item title"
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="group_name"
              list="group-options"
              placeholder="Group (e.g. Phase 1 — Foundation), optional"
              aria-label="Item group"
              className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm placeholder:text-muted focus:border-foreground focus:outline-none"
            />
            <input
              name="note"
              placeholder="Note, optional"
              aria-label="Item note"
              className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm placeholder:text-muted focus:border-foreground focus:outline-none"
            />
          </div>
          <datalist id="group-options">
            {groupNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add
          </button>
        </form>
      </details>

      {/* <details> bawaan browser: bisa dilipat/dibuka tanpa JavaScript. Default terbuka. */}
      <details open className="group mt-12">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-lg [&::-webkit-details-marker]:hidden">
          <h2 id="todos-heading" className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="inline-block text-base text-muted transition-transform group-open:rotate-90"
            >
              ▸
            </span>
            Linked to-dos
          </h2>
          <span className="text-sm text-muted">
            {doneTodos.length} / {linkedTodos.length} done
            <span className="ml-2 group-open:hidden">· click to expand</span>
          </span>
        </summary>
        <p className="mb-4 mt-1 text-sm text-muted">
          Daily to-dos linked to this goal. Ticking them does not change the checklist or the goal status.
        </p>

        {linkedTodos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
            No linked to-dos yet. Pick this goal when writing a to-do, or add one directly below.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-foreground">
            {[...openTodos, ...doneTodos].map((todo) => (
              <LinkedTodoRow key={todo.id} todo={todo} />
            ))}
          </ul>
        )}

        <form
          action={createTodoForGoal.bind(null, goal.id)}
          className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-muted/60 p-3"
        >
          <input
            name="title"
            required
            placeholder="+ Write a new to-do for this goal"
            aria-label="New to-do for this goal"
            className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-background px-3.5 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
          />
          <input
            name="due_date"
            type="date"
            defaultValue={todayISO()}
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
      </details>
    </div>
  );
}

function LinkedTodoRow({ todo }: { todo: Todo }) {
  const done = todo.status === "done";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3.5 last:border-b-0">
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
        <Link
          href={`/todos?edit=${todo.id}`}
          className={`text-lg hover:underline ${done ? "text-muted line-through" : ""}`}
        >
          {todo.title}
        </Link>
        <p className="text-xs text-muted">
          {todo.due_date ? formatDate(todo.due_date) : "No date"}
          {todo.status === "in_progress" ? " · In progress" : ""}
        </p>
      </div>
      <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
        {PRIORITY_LABEL[todo.priority]}
      </span>
    </li>
  );
}

function ItemRow({
  goalId,
  item,
  isFirst,
  isLast,
}: {
  goalId: string;
  item: GoalItem;
  isFirst: boolean;
  isLast: boolean;
}) {
  const move = "rounded-full px-2 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3.5 last:border-b-0">
      <form action={toggleGoalItem.bind(null, goalId, item.id, item.is_done)} className="flex">
        <button
          type="submit"
          role="checkbox"
          aria-checked={item.is_done}
          aria-label={item.is_done ? `Mark as not done: ${item.title}` : `Mark as done: ${item.title}`}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-foreground text-xs transition-colors ${
            item.is_done ? "bg-foreground text-background" : "hover:bg-surface"
          }`}
        >
          {item.is_done ? "✓" : ""}
        </button>
      </form>

      <div className="min-w-0 flex-1 basis-40">
        <p className={`text-lg ${item.is_done ? "text-muted line-through" : ""}`}>{item.title}</p>
        {item.note && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{item.note}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 text-sm">
        <form action={moveGoalItem.bind(null, goalId, item.id, "up")}>
          <button type="submit" disabled={isFirst} aria-label={`Move up: ${item.title}`} title="Move up" className={move}>
            ↑
          </button>
        </form>
        <form action={moveGoalItem.bind(null, goalId, item.id, "down")}>
          <button type="submit" disabled={isLast} aria-label={`Move down: ${item.title}`} title="Move down" className={move}>
            ↓
          </button>
        </form>
        <Link
          href={`/goals/${goalId}?item=${item.id}`}
          className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Edit
        </Link>
        <form action={deleteGoalItem.bind(null, goalId, item.id)}>
          <ConfirmButton
            label="Delete"
            confirmText={`Delete item "${item.title}"?`}
            className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger"
          />
        </form>
      </div>
    </li>
  );
}

function ItemEditForm({
  goalId,
  item,
  groupNames,
  error,
}: {
  goalId: string;
  item: GoalItem;
  groupNames: string[];
  error?: string;
}) {
  return (
    <form action={updateGoalItem.bind(null, goalId, item.id)} className="space-y-3">
      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}
      <div>
        <label htmlFor={`title-${item.id}`} className="block text-sm font-medium">
          Item title
        </label>
        <input id={`title-${item.id}`} name="title" required defaultValue={item.title} className={field} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`group-${item.id}`} className="block text-sm font-medium">
            Group
          </label>
          <input
            id={`group-${item.id}`}
            name="group_name"
            list={`group-edit-${item.id}`}
            defaultValue={item.group_name ?? ""}
            className={field}
          />
          <datalist id={`group-edit-${item.id}`}>
            {groupNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={`note-${item.id}`} className="block text-sm font-medium">
            Note
          </label>
          <input id={`note-${item.id}`} name="note" defaultValue={item.note ?? ""} className={field} />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href={`/goals/${goalId}`}
          className="rounded-full border border-foreground px-5 py-2 text-sm font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function GoalEditForm({ goal, error }: { goal: Goal; error?: string }) {
  return (
    <form action={updateGoal.bind(null, goal.id)} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">Edit goal</h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Title
        </label>
        <input id="title" name="title" type="text" required defaultValue={goal.title} className={field} />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea id="description" name="description" rows={3} defaultValue={goal.description ?? ""} className={field} />
      </div>

      <div>
        <label htmlFor="type" className="block text-sm font-medium">
          Type
        </label>
        <select id="type" name="type" defaultValue={goal.type} className={field}>
          <option value="learning">Learning</option>
          <option value="work">Work</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href={`/goals/${goal.id}`}
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
