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
import { applyDrag, buildBoard, findContainer, placementChanged, type BoardItems } from "@/lib/todo-board";
import type { Todo, TodoPriority } from "@/lib/types";
import { TodoDeleteButton } from "@/components/TodoDeleteButton";
import { createTodoForDay, placeTodo, toggleTodoDone } from "@/app/(dashboard)/todos/actions";

const PRIORITY_LABEL: Record<TodoPriority, string> = { low: "Low", medium: "Medium", high: "High" };

type Maps = { goalTitles: Record<string, string>; projectTitles: Record<string, string> };

function Checkbox({ todo }: { todo: Todo }) {
  const done = todo.status === "done";
  return (
    <form action={toggleTodoDone.bind(null, todo.id, todo.status)} className="flex">
      <button
        type="submit"
        aria-label={done ? `Mark as not done: ${todo.title}` : `Mark as done: ${todo.title}`}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border border-foreground text-[10px] transition-colors ${
          done ? "bg-foreground text-background" : "hover:bg-surface"
        }`}
      >
        {done ? "✓" : ""}
      </button>
    </form>
  );
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
}: {
  day: string;
  today: string;
  todos: Map<string, Todo>;
  ids: string[];
  week?: string;
  maps: Maps;
  compact?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const isToday = day === today;
  return (
    <div
      ref={setNodeRef}
      aria-label={`${formatLongDay(day)}${isToday ? " (today)" : ""}`}
      className={`flex flex-col gap-3 rounded-2xl p-3.5 ${compact ? "min-h-[9rem]" : "min-h-[26rem]"} ${
        isToday ? "border-2 border-foreground bg-surface" : "border border-border"
      } ${isOver ? "ring-2 ring-foreground/40" : ""}`}
    >
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <span className="text-base font-medium">{formatWeekdayShort(day)}</span>
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
        </ul>
      </SortableContext>

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
  const items: BoardItems = local && (activeId !== null || saving || local.src === todos) ? local.items : buildBoard(todos, days);
  const setItems = (next: BoardItems) => setLocal({ src: todos, items: next });
  const byId = new Map(todos.map((t) => [t.id, t]));
  const start = useRef<BoardItems | null>(null);

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
  const card = (day: string, compact?: boolean) => (
    <DayCard key={day} day={day} today={today} todos={byId} ids={items[day] ?? []} week={week} maps={maps} compact={compact} />
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
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {/* Senin–Jumat = 5 kolom; Sabtu dan Minggu di baris sendiri di bawahnya. Di layar sangat lebar sedikit keluar dari lebar halaman. */}
      <div className="2xl:-mx-20">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">{days.slice(0, 5).map((day) => card(day))}</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{days.slice(5).map((day) => card(day, true))}</div>
      </div>
      <DragOverlay>
        {active ? (
          <ul className="rounded-lg border border-foreground bg-background p-2 text-sm shadow-lg">
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
