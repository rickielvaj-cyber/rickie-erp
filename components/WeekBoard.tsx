"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  MeasuringStrategy,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatDayMonth, formatLongDay, formatWeekdayShort } from "@/lib/date";
import { formatScheduled } from "@/lib/google/layout";
import { applyDrag, buildBoard, findContainer, placementChanged, reconcileBoard, type BoardItems } from "@/lib/todo-board";
import type { Todo, TodoPriority } from "@/lib/types";
import { TodoDeleteButton } from "@/components/TodoDeleteButton";
import { SelectBox, SelectGroup } from "@/components/todo/BatchSelection";
import { DoneCheckbox } from "@/components/todo/DoneCheckbox";
import { ResizeHandle } from "@/components/ui/ResizeHandle";
import { useStoredSize } from "@/components/ui/use-stored-size";
import { addTodoForDay, placeTodo } from "@/app/(dashboard)/todos/actions";

const BOARD_HEIGHT_KEY = "size-weekboard-v1";
const BOARD_MIN_PX = 160;
const BOARD_MAX_PX = 1600;

const PRIORITY_LABEL: Record<TodoPriority, string> = { low: "Low", medium: "Medium", high: "High" };

type Maps = { goalTitles: Record<string, string>; projectTitles: Record<string, string> };

function Checkbox({ todo }: { todo: Todo }) {
  return <DoneCheckbox id={todo.id} status={todo.status} title={todo.title} size="sm" />;
}

function TaskBody({ todo, week, goalTitle, projectTitle }: { todo: Todo; week?: string; goalTitle?: string; projectTitle?: string }) {
  const done = todo.status === "done";
  const time = todo.calendar_event_id ? formatScheduled(todo.scheduled_start, todo.scheduled_end) : null;
  return (
    <>
      <span className="mt-0.5">
        <Checkbox todo={todo} />
      </span>
      <Link
        href={week ? `/todos?edit=${todo.id}&week=${week}` : `/todos?edit=${todo.id}`}
        title={`${PRIORITY_LABEL[todo.priority]}${goalTitle ? ` · Goal: ${goalTitle}` : ""}${projectTitle ? ` · Project: ${projectTitle}` : ""} · click to edit`}
        className={`min-w-0 flex-1 break-words hover:underline ${done ? "text-muted line-through" : ""} ${todo.priority === "high" && !done ? "font-medium" : ""}`}
      >
        {todo.priority === "high" && !done && <span aria-label="High priority">! </span>}
        {todo.title}
        {time && <span className="block text-xs font-normal text-muted">{time}</span>}
      </Link>
      {!done && !todo.calendar_event_id && (
        <Link
          href={week ? `/todos?block=${todo.id}&week=${week}#calendar` : `/todos?block=${todo.id}#calendar`}
          aria-label={`Block time for ${todo.title}`}
          title="Block time in the calendar"
          className="shrink-0 rounded px-1 text-xs text-muted hover:bg-surface hover:text-foreground"
        >
          +time
        </Link>
      )}
      <TodoDeleteButton todo={todo} variant="week" />
    </>
  );
}

function SortableTask({ todo, week, goalTitle, projectTitle }: { todo: Todo; week?: string; goalTitle?: string; projectTitle?: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...listeners}
      className={`flex touch-pan-y items-start gap-1.5 text-sm leading-snug ${isDragging ? "opacity-30" : ""}`}
    >
      {/* Pegangan untuk keyboard (Spasi mengambil, panah memindahkan, Spasi menaruh); mouse/sentuh bisa menyeret seluruh baris. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        aria-label={`Move or reorder: ${todo.title}`}
        className="mt-0.5 shrink-0 cursor-grab touch-none rounded px-0.5 text-xs leading-none text-muted/60 hover:text-foreground active:cursor-grabbing"
      >
        ⋮⋮
      </button>
      <SelectBox id={todo.id} title={todo.title} className="mt-0.5" />
      <TaskBody todo={todo} week={week} goalTitle={goalTitle} projectTitle={projectTitle} />
    </li>
  );
}

function DayCard({
  day,
  today,
  todos,
  ids,
  week,
  maps,
  compact,
  minHeight,
  pending,
  onAdd,
}: {
  day: string;
  today: string;
  todos: Map<string, Todo>;
  ids: string[];
  week?: string;
  maps: Maps;
  compact?: boolean;
  /** Tinggi minimum kartu (px) yang diatur dengan menarik; kosong = bawaan CSS. */
  minHeight?: number;
  /** Judul tugas baru yang sedang disimpan di server; tampil langsung (redup) sampai data resmi tiba. */
  pending: string[];
  onAdd: (day: string, title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const isToday = day === today;
  return (
    <div
      ref={setNodeRef}
      aria-label={`${formatLongDay(day)}${isToday ? " (today)" : ""}`}
      style={minHeight ? { minHeight: `${compact ? Math.round(minHeight * 0.4) : minHeight}px` } : undefined}
      className={`flex flex-col gap-3 rounded-2xl p-3.5 ${minHeight ? "" : compact ? "min-h-[9rem]" : "min-h-[26rem]"} ${
        isToday ? "border-2 border-accent bg-accent-soft/60" : "border border-border bg-background shadow-card"
      } ${isOver ? "ring-2 ring-accent/40" : ""}`}
    >
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <span className="flex items-center gap-2">
          <SelectGroup ids={ids} label={formatLongDay(day)} />
          <span className="text-base font-medium">{formatWeekdayShort(day)}</span>
        </span>
        <span className="text-sm text-muted">{formatDayMonth(day)}</span>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-8 flex-col gap-2">
          {ids.map((id) => {
            const todo = todos.get(id);
            return todo ? (
              <SortableTask key={id} todo={todo} week={week} goalTitle={maps.goalTitles[todo.goal_id ?? ""]} projectTitle={maps.projectTitles[todo.id]} />
            ) : null;
          })}
          {pending.map((title, i) => (
            <li key={`pending-${i}`} aria-busy="true" className="rounded-lg border border-border bg-background p-2 text-sm text-muted opacity-70">
              <span className="break-words">{title}</span>
            </li>
          ))}
        </ul>
      </SortableContext>

      <form
        className="mt-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement;
          const title = input.value.trim();
          if (!title) return;
          input.value = ""; // kosong seketika; tugasnya sudah tampil di atas
          onAdd(day, title);
        }}
      >
        <input
          name="title"
          required
          placeholder="+ Add"
          aria-label={`Add task for ${formatLongDay(day)}`}
          className="w-full rounded-lg border border-dashed border-border-strong bg-background px-2.5 py-1.5 text-center text-sm placeholder:text-subtle focus:border-solid focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
      </form>
    </div>
  );
}

/**
 * Papan mingguan: seret to-do ke hari lain atau ubah urutannya dalam satu hari (mouse, sentuh dengan tekan-tahan, atau
 * keyboard lewat pegangan ⋮⋮). Perubahan tampil seketika; server menyimpan hari dan urutannya, dan bila gagal papan kembali
 * seperti semula dengan pesan.
 */
export function WeekBoard({
  todos,
  days,
  today,
  week,
  goalTitles,
  projectTitles,
}: {
  todos: Todo[];
  days: string[];
  today: string;
  week?: string;
  goalTitles: Record<string, string>;
  projectTitles: Record<string, string>;
}) {
  const [local, setLocal] = useState<{ src: Todo[]; items: BoardItems } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  // Keadaan papan sementara berlaku selama menyeret dan selama penyimpanan berjalan (data server yang datang di tengah
  // jalan, mis. dari penyimpanan sebelumnya, tidak boleh mereset pratinjau), lalu sampai data baru tiba (identitas `todos` berganti).
  // `reconcileBoard` memasukkan to-do yang baru tiba di tengah seretan (mis. baru selesai disimpan) dan membuang yang sudah terhapus.
  const items: BoardItems = local && (activeId !== null || saving || local.src === todos) ? reconcileBoard(local.items, todos, days) : buildBoard(todos, days);
  const setItems = (next: BoardItems) => setLocal({ src: todos, items: next });
  const byId = new Map(todos.map((t) => [t.id, t]));
  const start = useRef<BoardItems | null>(null);
  // Tugas baru dari kotak "+ Add": tampil seketika, disimpan di latar belakang (beberapa bisa berjalan bersamaan).
  const [pending, setPending] = useState<{ key: number; day: string; title: string }[]>([]);
  const nextKey = useRef(0);
  // Transisi terpisah dari `saving` (seretan): `saving` membuat papan memakai keadaan lokal, yang bisa sudah usang saat menambah.
  const [, startAdd] = useTransition();
  const addTask = (day: string, title: string) => {
    const key = nextKey.current++;
    setPending((p) => [...p, { key, day, title }]);
    setError(null);
    startAdd(async () => {
      const result = await addTodoForDay(day, title);
      setPending((p) => p.filter((x) => x.key !== key));
      if (!result.ok) setError(`Could not add "${title}": ${result.error}`);
    });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    start.current = items;
    setError(null);
  };

  // Setiap langkah (pindah hari maupun ubah urutan) diterapkan langsung saat menyeret, jadi saat dilepas papan sudah
  // menunjukkan hasil akhirnya; menerapkannya sekali lagi saat lepas bisa menukar posisi yang baru saja ditempati.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (over) setItems(applyDrag(items, String(active.id), String(over.id)));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    setActiveId(null);
    const next = items;

    const before = start.current ?? items;
    if (!placementChanged(before, next, id)) return;
    const day = findContainer(next, id)!;
    startTransition(async () => {
      const result = await placeTodo(id, day, next[day]);
      if (!result.ok) {
        setItems(before);
        setError(result.error);
      }
    });
  };

  const onDragCancel = () => {
    setActiveId(null);
    if (start.current) setItems(start.current);
  };

  // Pointer di atas sebuah to-do -> to-do itu (sisipkan di posisinya); di area kosong kartu -> kartunya (taruh di bawah);
  // di luar semuanya -> kotak terdekat. Tanpa ini kartu hari yang besar sering "menang" atas to-do di dalamnya.
  const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    if (within.length === 0) return closestCorners(args);
    const onItems = within.filter((c) => !(String(c.id) in items));
    return onItems.length > 0 ? onItems : within;
  };

  const maps: Maps = { goalTitles, projectTitles };
  const [boardHeight, setBoardHeight] = useStoredSize(BOARD_HEIGHT_KEY, BOARD_MIN_PX, BOARD_MAX_PX);
  const firstRow = useRef<HTMLDivElement | null>(null);
  const card = (day: string, compact?: boolean) => (
    <DayCard key={day} day={day} today={today} todos={byId} ids={items[day] ?? []} week={week} maps={maps} compact={compact} minHeight={boardHeight ?? undefined} pending={pending.filter((x) => x.day === day).map((x) => x.title)} onAdd={addTask} />
  );
  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <DndContext
      id="week-board"
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Kotak to-do bergeser saat satu to-do berpindah kolom; ukur ulang terus supaya tabrakan memakai posisi terbaru.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {/* Senin–Jumat = 5 kolom; Sabtu dan Minggu di baris sendiri di bawahnya. Di layar sangat lebar sedikit keluar dari lebar halaman. */}
      <div className="2xl:-mx-20">
        <div ref={firstRow} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">{days.slice(0, 5).map((day) => card(day))}</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{days.slice(5).map((day) => card(day, true))}</div>
        <ResizeHandle targetRef={firstRow} onResize={setBoardHeight} onReset={() => setBoardHeight(null)} min={BOARD_MIN_PX} max={BOARD_MAX_PX} label="Resize week board height" measureFirstChild />
      </div>
      <DragOverlay>
        {active ? (
          <ul className="rounded-lg border border-border bg-background p-2 text-sm shadow-pop">
            <li className="flex items-start gap-1.5">
              <span className="text-xs text-muted">⋮⋮</span>
              <span className="min-w-0 flex-1 break-words">{active.title}</span>
            </li>
          </ul>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
