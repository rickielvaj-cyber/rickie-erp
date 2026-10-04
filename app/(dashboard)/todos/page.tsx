import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createTodo, cycleTodoStatus, deleteTodo, updateTodo } from "./actions";

const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: "To-Do",
  in_progress: "Dikerjakan",
  done: "Selesai",
};

const PRIORITY_LABEL: Record<TodoPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const PRIORITY_BADGE: Record<TodoPriority, string> = {
  low: "bg-zinc-100 text-zinc-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-brand-red/10 text-brand-red",
};

type SearchParams = {
  status?: string;
  priority?: string;
  new?: string;
  edit?: string;
  error?: string;
};

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "all";
  const priorityFilter = params.priority ?? "all";
  const isNew = params.new === "1";
  const editId = params.edit ?? null;

  const supabase = await createClient();

  let query = supabase.from("todos").select("*");
  if (statusFilter !== "all") query = query.eq("status", statusFilter as TodoStatus);
  if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as TodoPriority);

  const { data: todos, error: fetchError } = await query.order("due_date", {
    ascending: true,
    nullsFirst: false,
  });

  const editingTodo = editId ? (todos ?? []).find((t) => t.id === editId) ?? null : null;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-red">To-Do List</h1>
        {!isNew && !editingTodo && (
          <Link
            href="/todos?new=1"
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-red-dark"
          >
            + Tambah To-Do
          </Link>
        )}
      </div>

      {(isNew || editingTodo) && (
        <TodoForm
          key={editingTodo?.id ?? "new"}
          todo={editingTodo}
          error={params.error}
        />
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-4">
        <div>
          <label className="block text-xs font-medium text-muted">Status</label>
          <select name="status" defaultValue={statusFilter} className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm">
            <option value="all">Semua</option>
            <option value="todo">To-Do</option>
            <option value="in_progress">Dikerjakan</option>
            <option value="done">Selesai</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">Prioritas</label>
          <select name="priority" defaultValue={priorityFilter} className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm">
            <option value="all">Semua</option>
            <option value="low">Rendah</option>
            <option value="medium">Sedang</option>
            <option value="high">Tinggi</option>
          </select>
        </div>
        <button type="submit" className="rounded-md border border-border px-4 py-1.5 text-sm font-medium hover:border-brand-red hover:text-brand-red">
          Terapkan Filter
        </button>
        {(statusFilter !== "all" || priorityFilter !== "all") && (
          <Link href="/todos" className="text-sm text-muted underline">
            Reset
          </Link>
        )}
      </form>

      {fetchError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
          Gagal memuat data: {fetchError.message}
        </p>
      )}

      <ul className="space-y-2">
        {(todos ?? []).map((todo) => (
          <TodoRow key={todo.id} todo={todo} />
        ))}
        {todos && todos.length === 0 && (
          <li className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
            Belum ada to-do yang cocok dengan filter ini.
          </li>
        )}
      </ul>
    </div>
  );
}

function TodoRow({ todo }: { todo: Todo }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <form action={cycleTodoStatus.bind(null, todo.id, todo.status)}>
            <button
              type="submit"
              title="Klik buat ganti status"
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                todo.status === "done"
                  ? "bg-green-100 text-green-700"
                  : todo.status === "in_progress"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {STATUS_LABEL[todo.status]}
            </button>
          </form>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[todo.priority]}`}>
            {PRIORITY_LABEL[todo.priority]}
          </span>
          {todo.due_date && (
            <span className="text-xs text-muted">Jatuh tempo: {formatDateID(todo.due_date)}</span>
          )}
        </div>
        <p className={`mt-1 font-medium ${todo.status === "done" ? "text-muted line-through" : ""}`}>
          {todo.title}
        </p>
        {todo.description && <p className="mt-0.5 text-sm text-muted">{todo.description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/todos?edit=${todo.id}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-brand-red hover:text-brand-red"
        >
          Edit
        </Link>
        <form action={deleteTodo.bind(null, todo.id)}>
          <ConfirmButton
            label="Hapus"
            confirmText={`Hapus to-do "${todo.title}"?`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:border-brand-red hover:text-brand-red"
          />
        </form>
      </div>
    </li>
  );
}

function TodoForm({ todo, error }: { todo: Todo | null; error?: string }) {
  const action = todo ? updateTodo.bind(null, todo.id) : createTodo;

  return (
    <form action={action} className="mb-6 space-y-4 rounded-md border border-border bg-surface p-5">
      <h2 className="font-medium">{todo ? "Edit To-Do" : "Tambah To-Do Baru"}</h2>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">{error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Judul
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={todo?.title}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={todo?.description ?? ""}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="status" className="block text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={todo?.status ?? "todo"}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="todo">To-Do</option>
            <option value="in_progress">Dikerjakan</option>
            <option value="done">Selesai</option>
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-medium">
            Prioritas
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={todo?.priority ?? "medium"}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="low">Rendah</option>
            <option value="medium">Sedang</option>
            <option value="high">Tinggi</option>
          </select>
        </div>
        <div>
          <label htmlFor="due_date" className="block text-sm font-medium">
            Jatuh Tempo
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            defaultValue={todo?.due_date ?? ""}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
        >
          Simpan
        </button>
        <Link
          href="/todos"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
