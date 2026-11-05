"use client";

import { createContext, useContext, useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { batchDeleteTodos, batchUpdateTodos } from "@/app/(dashboard)/todos/actions";
import { addDaysISO, formatDayMonth, mondayOfISO } from "@/lib/date";
import { isTextEntry } from "@/lib/auto-refresh";

// Dipakai di daftar Hari ini dan di papan mingguan (masing-masing satu instance; mode memilih hanya aktif di salah satunya).
// Edit massal di daftar Hari ini. Kotak pilihan TIDAK tampil secara bawaan (supaya tidak tertukar dengan kotak "selesai");
// tombol Select di atas daftar membuka mode memilih: kotak muncul di tiap to-do (dan tiap kelompok), lalu bar aksi di bawah layar
// mengubah tanggal, prioritas, status, goal, proyek/fase atau menghapus semuanya sekaligus. Done / Esc / selesai mengedit = keluar mode.

export type BatchGoal = { id: string; title: string };
export type BatchProject = { id: string; label: string; phases: { id: string; name: string }[] };

type Ctx = {
  /** Mode memilih aktif: hanya saat itu kotak pilihan ditampilkan. */
  selecting: boolean;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
};
const SelectionContext = createContext<Ctx | null>(null);

const box = "h-4 w-4 shrink-0 cursor-pointer rounded border border-border-strong accent-accent";

/** Kotak centang satu to-do. Di luar BatchSelection tidak menampilkan apa pun. */
export function SelectBox({ id, title, className = "" }: { id: string; title: string; className?: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx || !ctx.selecting) return null;
  return (
    <input
      type="checkbox"
      className={`${box} ${className}`}
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      aria-label={`Select: ${title}`}
    />
  );
}

/** Kotak centang satu kelompok (semua to-do di dalamnya); setengah terpilih tampil indeterminate. */
export function SelectGroup({ ids, label, className = "" }: { ids: string[]; label: string; className?: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx || !ctx.selecting) return null;
  const count = ids.filter((id) => ctx.selected.has(id)).length;
  return (
    <input
      type="checkbox"
      className={`${box} ${className}`}
      checked={count === ids.length && ids.length > 0}
      ref={(el) => {
        if (el) el.indeterminate = count > 0 && count < ids.length;
      }}
      onChange={() => ctx.setMany(ids, count !== ids.length)}
      aria-label={`Select all: ${label}`}
    />
  );
}

const field = "h-9 rounded-lg border border-border bg-background px-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

export function BatchSelection({
  children,
  today,
  goals,
  projects,
  canSelect = true,
}: {
  children: React.ReactNode;
  today: string;
  goals: BatchGoal[];
  projects: BatchProject[];
  /** Ada to-do yang bisa dipilih; bila tidak, tombol Select disembunyikan. */
  canSelect?: boolean;
}) {
  const router = useRouter();
  const instanceId = useId();
  const [selecting, setSelecting] = useState(false);
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
      selecting,
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
    [selecting, selected],
  );

  const reset = () => {
    setSelecting(false);
    setSelected(new Set());
    setOpen(false);
    setDueDate("");
    setPriority("");
    setStatus("");
    setGoal("");
    setProject("");
    setPhase("");
  };

  const stopSelecting = () => {
    reset();
    setMessage(null);
  };

  // Dua daftar di satu halaman (Hari ini dan papan mingguan): membuka mode memilih di satu menutup yang lain,
  // supaya bar aksi tidak saling menimpa dan tidak ada pilihan tersisa di daftar yang tidak terlihat.
  useEffect(() => {
    if (!selecting) return;
    window.dispatchEvent(new CustomEvent("batch-select-start", { detail: instanceId }));
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== instanceId) stopSelecting();
    };
    window.addEventListener("batch-select-start", onOther);
    return () => window.removeEventListener("batch-select-start", onOther);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecting, instanceId]);

  // Esc keluar dari mode memilih (kecuali saat mengetik di sebuah kolom).
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Setelah mencentang kotak, fokus tetap di kotak itu: Esc harus tetap berlaku. Hanya kolom teks dan daftar pilihan yang dikecualikan.
      const typing = isTextEntry(el?.tagName, el instanceof HTMLInputElement ? el.type : null) || el?.tagName === "SELECT";
      if (e.key === "Escape" && !typing) stopSelecting();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecting]);

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
        dueDate === value ? "border-accent bg-accent text-white" : "border-border hover:border-accent"
      }`}
    >
      {label}
    </button>
  );

  return (
    <SelectionContext.Provider value={ctx}>
      {(canSelect || selecting) && (
        <div className="mb-3 flex items-center justify-end gap-3">
          {selecting && selected.size === 0 && <span className="text-sm text-muted">Tick the tasks to edit together.</span>}
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            aria-pressed={selecting}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              selecting ? "border-accent bg-accent text-white" : "border-border-strong hover:bg-surface"
            }`}
          >
            {selecting ? "Done" : "Select"}
          </button>
        </div>
      )}
      {children}
      {/* Ruang kosong di bawah daftar supaya baris terakhir tidak tertutup bar aksi. */}
      {selected.size > 0 && <div aria-hidden="true" className={open ? "h-[28rem] sm:h-48" : "h-28 sm:h-48"} />}
      {message && selected.size === 0 && (
        <p role="status" className={`mt-4 text-sm ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
      {selected.size > 0 && (
        <div role="region" aria-label="Edit selected tasks" data-pause-refresh className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-10px_30px_rgb(20_22_26/0.10)] backdrop-blur">
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
                className="rounded-full border border-border-strong px-3 py-1 text-sm sm:hidden"
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
                className="rounded-full border border-danger px-4 py-2 text-sm text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
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
