"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { batchDeleteTodos, batchUpdateTodos } from "@/app/(dashboard)/todos/actions";
import { addDaysISO, formatDayMonth, mondayOfISO } from "@/lib/date";

// Edit massal di daftar Hari ini: kotak centang di tiap to-do (dan di tiap kelompok proyek), lalu bar aksi di bawah layar
// untuk mengubah tanggal, prioritas, status, goal, proyek/fase atau menghapus semuanya sekaligus.

export type BatchGoal = { id: string; title: string };
export type BatchProject = { id: string; label: string; phases: { id: string; name: string }[] };

type Ctx = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
};
const SelectionContext = createContext<Ctx | null>(null);

const box = "h-4 w-4 shrink-0 cursor-pointer rounded border border-foreground accent-foreground";

/** Kotak centang satu to-do. Di luar BatchSelection tidak menampilkan apa pun. */
export function SelectBox({ id, title }: { id: string; title: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className={box}
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      aria-label={`Select: ${title}`}
    />
  );
}

/** Kotak centang satu kelompok (semua to-do di dalamnya); setengah terpilih tampil indeterminate. */
export function SelectGroup({ ids, label }: { ids: string[]; label: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  const count = ids.filter((id) => ctx.selected.has(id)).length;
  return (
    <input
      type="checkbox"
      className={box}
      checked={count === ids.length && ids.length > 0}
      ref={(el) => {
        if (el) el.indeterminate = count > 0 && count < ids.length;
      }}
      onChange={() => ctx.setMany(ids, count !== ids.length)}
      aria-label={`Select all: ${label}`}
    />
  );
}

const field = "h-9 rounded-lg border border-border bg-background px-2.5 text-sm focus:border-foreground focus:outline-none";

export function BatchSelection({
  children,
  today,
  goals,
  projects,
}: {
  children: React.ReactNode;
  today: string;
  goals: BatchGoal[];
  projects: BatchProject[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [dueDate, setDueDate] = useState(""); // "" = tidak diubah, "none" = hapus tanggal, selain itu YYYY-MM-DD
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [goal, setGoal] = useState("");
  const [project, setProject] = useState("");
  const [phase, setPhase] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Layar kecil: kolom ubah terlipat di balik tombol "Edit…" supaya bar tidak menutupi daftar. Layar lebar: selalu terbuka.
  const [open, setOpen] = useState(false);

  const ctx = useMemo<Ctx>(
    () => ({
      selected,
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setMany: (ids, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
    }),
    [selected],
  );

  const reset = () => {
    setSelected(new Set());
    setOpen(false);
    setDueDate("");
    setPriority("");
    setStatus("");
    setGoal("");
    setProject("");
    setPhase("");
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await batchUpdateTodos({ ids: Array.from(selected), dueDate, priority, status, goal, project, phase });
      if (result.ok) {
        const kept = result.keptDate > 0 ? ` ${result.keptDate} linked to a calendar block kept its date.` : "";
        setMessage({ text: `Updated ${result.updated} ${result.updated === 1 ? "task" : "tasks"}.${kept}`, error: false });
        reset();
        router.refresh();
      } else setMessage({ text: result.error, error: true });
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete ${selected.size} selected ${selected.size === 1 ? "task" : "tasks"}? This cannot be undone.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await batchDeleteTodos(Array.from(selected));
      if (result.ok) {
        setMessage({ text: `Deleted ${result.deleted} ${result.deleted === 1 ? "task" : "tasks"}.`, error: false });
        reset();
        router.refresh();
      } else setMessage({ text: result.error, error: true });
    });
  };

  const tomorrow = addDaysISO(today, 1);
  const nextMonday = addDaysISO(mondayOfISO(today), 7);
  const chosenProject = projects.find((p) => p.id === project);
  const dateChip = (value: string, label: string) => (
    <button
      type="button"
      onClick={() => setDueDate(dueDate === value ? "" : value)}
      aria-pressed={dueDate === value}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        dueDate === value ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <SelectionContext.Provider value={ctx}>
      {children}
      {/* Ruang kosong di bawah daftar supaya baris terakhir tidak tertutup bar aksi. */}
      {selected.size > 0 && <div aria-hidden="true" className={open ? "h-[28rem] sm:h-48" : "h-28 sm:h-48"} />}
      {message && selected.size === 0 && (
        <p role="status" className={`mt-4 text-sm ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
      {selected.size > 0 && (
        <div role="region" aria-label="Edit selected tasks" data-pause-refresh className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground bg-background/95 backdrop-blur">
          <form onSubmit={apply} className="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-base font-medium">{selected.size} selected</span>
              <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-muted underline underline-offset-4 hover:text-foreground">
                Clear
              </button>
              {message && (
                <span role="status" className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}>
                  {message.text}
                </span>
              )}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="rounded-full border border-foreground px-3 py-1 text-sm sm:hidden"
              >
                {open ? "Hide" : "Edit…"}
              </button>
            </div>

            <div className={`flex-col gap-3 sm:flex ${open ? "flex" : "hidden"} max-h-[55vh] overflow-y-auto sm:max-h-none`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Date</span>
              {dateChip(today, "Today")}
              {dateChip(tomorrow, "Tomorrow")}
              {dateChip(nextMonday, `Next Mon (${formatDayMonth(nextMonday)})`)}
              {dateChip("none", "No date")}
              <input
                type="date"
                aria-label="Set date"
                value={dueDate === "none" ? "" : dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={field}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className={field}>
                <option value="">Priority: no change</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
                <option value="">Status: no change</option>
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
              <select aria-label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)} className={`${field} max-w-48`}>
                <option value="">Goal: no change</option>
                <option value="none">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <select
                aria-label="Project"
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  setPhase("");
                }}
                className={`${field} max-w-56`}
              >
                <option value="">Project: no change</option>
                <option value="none">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {chosenProject && (
                <select aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)} className={`${field} max-w-44`}>
                  <option value="">No phase</option>
                  {chosenProject.phases.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {ph.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className={`${open ? "" : "hidden sm:inline-block"} rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60`}
              >
                {pending ? "Applying…" : "Apply to selected"}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="rounded-full border border-danger px-4 py-2 text-sm text-danger transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                Delete selected
              </button>
            </div>
          </form>
        </div>
      )}
    </SelectionContext.Provider>
  );
}
