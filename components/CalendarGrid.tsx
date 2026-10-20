"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDayMonth, formatLongDay, formatWeekdayShort } from "@/lib/date";
import { DEFAULT_BLOCK_MIN, SNAP_MIN, dragRange, minutesToTime, slotFromOffset, snapMinutes } from "@/lib/google/block";
import { toWib, type CalendarEvent, type DayLayout, type TimedBlock } from "@/lib/google/layout";
import { createCalendarBlock, deleteCalendarBlock, updateCalendarBlock } from "@/app/(dashboard)/todos/calendar-actions";

const HOUR_REM = 3; // tinggi satu jam di grid
const MAX_MIN = 24 * 60 - 1;
const MOVE_THRESHOLD_PX = 5;

export type LinkOption = { id: string; title: string; date: string | null };
export type Prefill = { todoId: string; title: string; date: string };

type Panel = {
  mode: "create" | "edit";
  id?: string;
  title: string;
  date: string;
  start: string;
  end: string;
  link?: string;
  todoId?: string;
};

type Slot = { date: string; startMin: number; endMin: number };

type Gesture = {
  kind: "move" | "resize";
  block: TimedBlock;
  title: string;
  date: string;
  /** menit antara posisi pointer dan awal blok saat dipegang (agar blok tidak "melompat") */
  grabMin: number;
  x: number;
  y: number;
  moved: boolean;
  last: Slot;
};

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

/** Acara berjam yang bisa diubah di sini = mulai dan selesai di hari WIB yang sama. Selain itu dibuka di Google Calendar. */
function panelFor(event: CalendarEvent): Panel | null {
  if (event.allDay) return null;
  const s = toWib(event.start);
  const e = toWib(event.end);
  if (s.date !== e.date) return null;
  return { mode: "edit", id: event.id, title: event.title, date: s.date, start: minutesToTime(s.minutes), end: minutesToTime(e.minutes), link: event.link };
}

export function CalendarGrid({
  days,
  today,
  startHour,
  endHour,
  linkable,
  linkedTitles,
  prefill,
  closeHref,
}: {
  days: DayLayout[];
  today: string;
  startHour: number;
  endHour: number;
  /** To-do terbuka yang belum tertaut ke blok mana pun (untuk pilihan "Link to a to-do"). */
  linkable: LinkOption[];
  /** id acara -> judul to-do yang tertaut padanya. */
  linkedTitles: Record<string, string>;
  /** Dari tombol "Block time" di sebuah to-do: dialog langsung terbuka dengan to-do itu terpilih. */
  prefill: Prefill | null;
  closeHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel | null>(() =>
    prefill ? { mode: "create", title: prefill.title, date: prefill.date, start: "09:00", end: "10:00", todoId: prefill.todoId } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ date: string; a: number; b: number } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; slot: Slot } | null>(null);
  // Posisi sementara blok yang baru digeser; berlaku sampai data baru dari server tiba (identitas `days` berganti).
  const [ov, setOv] = useState<{ days: DayLayout[]; map: Record<string, Slot> }>({ days, map: {} });
  const overrides: Record<string, Slot> = ov.days === days ? ov.map : {};
  const setOverrides = (update: (o: Record<string, Slot>) => Record<string, Slot>) =>
    setOv((prev) => ({ days, map: update(prev.days === days ? prev.map : {}) }));
  const dragRef = useRef<{ date: string; a: number; b: number; moved: boolean } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const hasAllDay = days.some((d) => d.allDay.length > 0);
  const cols = "grid grid-cols-[3rem_repeat(7,minmax(7rem,1fr))]";
  const topRem = (min: number) => ((min - startHour * 60) / 60) * HOUR_REM;

  const close = () => {
    setPanel(null);
    setError(null);
    if (prefill) router.replace(closeHref, { scroll: false });
  };

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  // ---- buat blok baru: klik atau seret di slot kosong ----
  const minutesIn = (e: { clientY: number }, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return slotFromOffset(e.clientY - rect.top, rect.height, startHour, endHour);
  };

  const onColumnDown = (date: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return; // klik pada blok ditangani bloknya
    const m = minutesIn(e, e.currentTarget);
    dragRef.current = { date, a: m, b: m, moved: false };
    setDrag({ date, a: m, b: m });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onColumnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerType !== "mouse") return; // layar sentuh: ketuk saja (agar tidak mengganggu gulir)
    const m = minutesIn(e, e.currentTarget);
    if (m !== d.b) {
      d.b = m;
      d.moved = true;
      setDrag({ date: d.date, a: d.a, b: m });
    }
  };

  const onColumnUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const range = d.moved && e.pointerType === "mouse" ? dragRange(d.a, d.b) : dragRange(d.a, d.a);
    setError(null);
    setPanel({ mode: "create", title: "", date: d.date, start: minutesToTime(range.startMin), end: minutesToTime(range.endMin) });
  };

  // ---- geser dan ubah durasi blok yang sudah ada (mouse/pena; di layar sentuh ketuk lalu ubah di dialog) ----
  const columnAt = (clientX: number): string | null => {
    for (const d of days) {
      const rect = colRefs.current[d.date]?.getBoundingClientRect();
      if (rect && clientX >= rect.left && clientX < rect.right) return d.date;
    }
    return null;
  };

  const beginGesture = (kind: Gesture["kind"], b: TimedBlock, date: string, e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const col = colRefs.current[date];
    if (!col) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const last = { date, startMin: b.startMin, endMin: b.endMin };
    gesture.current = { kind, block: b, title: b.event.title, date, grabMin: minutesIn(e, col) - b.startMin, x: e.clientX, y: e.clientY, moved: false, last };
  };

  const updateGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < MOVE_THRESHOLD_PX) return;
    g.moved = true;
    const b = g.block;
    if (g.kind === "resize") {
      const col = colRefs.current[g.date];
      if (!col) return;
      const end = Math.min(MAX_MIN, Math.max(minutesIn(e, col), b.startMin + SNAP_MIN));
      g.last = { date: g.date, startMin: b.startMin, endMin: end };
    } else {
      const date = columnAt(e.clientX) ?? g.last.date;
      const col = colRefs.current[date];
      if (!col) return;
      const duration = b.endMin - b.startMin;
      let start = snapMinutes(minutesIn(e, col) - g.grabMin);
      start = Math.max(0, Math.min(start, MAX_MIN - duration));
      g.last = { date, startMin: start, endMin: start + duration };
    }
    setGhost({ id: b.event.id, slot: g.last });
  };

  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    setGhost(null);
    if (!g || !g.moved) return;
    suppressClick.current = true;
    const b = g.block;
    const next = g.last;
    if (next.date === g.date && next.startMin === b.startMin && next.endMin === b.endMin) return;
    setBanner(null);
    setOverrides((o) => ({ ...o, [b.event.id]: next }));
    startTransition(async () => {
      const result = await updateCalendarBlock(b.event.id, {
        title: g.title,
        date: next.date,
        start: minutesToTime(next.startMin),
        end: minutesToTime(next.endMin),
      });
      if (result.ok) router.refresh();
      else {
        setOverrides((o) => {
          const next = { ...o };
          delete next[b.event.id];
          return next;
        });
        setBanner(result.error);
      }
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!panel) return;
    const payload = { title: panel.title, date: panel.date, start: panel.start, end: panel.end, todoId: panel.todoId };
    startTransition(async () => {
      const result = panel.mode === "edit" && panel.id ? await updateCalendarBlock(panel.id, payload) : await createCalendarBlock(payload);
      if (result.ok) {
        close();
        router.refresh();
      } else setError(result.error);
    });
  };

  const remove = () => {
    if (!panel?.id) return;
    const id = panel.id;
    startTransition(async () => {
      const result = await deleteCalendarBlock(id);
      if (result.ok) {
        close();
        router.refresh();
      } else setError(result.error);
    });
  };

  const newBlock = () => {
    setError(null);
    setPanel({ mode: "create", title: "", date: today, start: "09:00", end: minutesToTime(9 * 60 + DEFAULT_BLOCK_MIN) });
  };

  const pickTodo = (id: string) => {
    if (!panel) return;
    const todo = linkable.find((t) => t.id === id);
    if (!todo) return setPanel({ ...panel, todoId: undefined });
    setPanel({ ...panel, todoId: todo.id, title: todo.title, date: todo.date ?? panel.date });
  };

  /** Blok per hari, dengan posisi sementara (setelah digeser, sebelum data baru dari server tiba). */
  const blocksFor = (d: DayLayout): TimedBlock[] => {
    const own = d.blocks.filter((b) => !overrides[b.event.id]);
    const moved = days
      .flatMap((x) => x.blocks)
      .filter((b) => overrides[b.event.id]?.date === d.date)
      .map((b) => ({ ...b, ...overrides[b.event.id], lane: 0, lanes: 1 }));
    return [...own, ...moved];
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Click or drag on an empty slot to block time. Drag a block to move it, pull its bottom edge to resize, click it to edit.</p>
        <button type="button" onClick={newBlock} className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
          + New block
        </button>
      </div>
      {banner && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          {banner}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-foreground">
        <div className="min-w-[56rem]">
          <div className={`${cols} border-b border-border`}>
            <div />
            {days.map((d) => (
              <div key={d.date} className={`border-l border-border px-2 py-2 text-center ${d.date === today ? "bg-surface font-medium" : ""}`}>
                <span className="text-sm">{formatWeekdayShort(d.date)}</span> <span className="text-xs text-muted">{formatDayMonth(d.date)}</span>
              </div>
            ))}
          </div>
          {hasAllDay && (
            <div className={`${cols} border-b border-border`}>
              <div className="px-1 py-1 text-right text-[10px] text-muted">all day</div>
              {days.map((d) => (
                <div key={d.date} className="flex flex-col gap-0.5 border-l border-border p-1">
                  {d.allDay.map((ev) => (
                    <a
                      key={ev.id + d.date}
                      href={ev.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate rounded bg-surface px-1.5 py-0.5 text-xs hover:underline"
                      title={`${ev.title} (open in Google Calendar)`}
                    >
                      {ev.title}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className={cols}>
            <div>
              {hours.map((h) => (
                <div key={h} style={{ height: `${HOUR_REM}rem` }} className="pr-1 text-right text-[10px] text-muted">
                  <span className="relative -top-1.5">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d.date}
                ref={(el) => {
                  colRefs.current[d.date] = el;
                }}
                role="group"
                aria-label={`${formatLongDay(d.date)}: click or drag to add a block`}
                onPointerDown={onColumnDown(d.date)}
                onPointerMove={onColumnMove}
                onPointerUp={onColumnUp}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setDrag(null);
                }}
                className={`relative cursor-crosshair select-none border-l border-border ${d.date === today ? "bg-surface/60" : ""}`}
                style={{ height: `${hours.length * HOUR_REM}rem`, touchAction: "pan-y" }}
              >
                {hours.map((h, i) => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: `${i * HOUR_REM}rem` }} />
                ))}
                {drag && drag.date === d.date && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-dashed border-foreground bg-foreground/10"
                    style={{ top: `${topRem(Math.min(drag.a, drag.b))}rem`, height: `${(Math.max(Math.abs(drag.b - drag.a), 15) / 60) * HOUR_REM}rem` }}
                  />
                )}
                {ghost && ghost.slot.date === d.date && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 z-20 rounded-md border-2 border-dashed border-foreground bg-foreground/10 px-1 text-[10px]"
                    style={{ top: `${topRem(ghost.slot.startMin)}rem`, height: `${((ghost.slot.endMin - ghost.slot.startMin) / 60) * HOUR_REM}rem` }}
                  >
                    {minutesToTime(ghost.slot.startMin)}–{minutesToTime(ghost.slot.endMin)}
                  </div>
                )}
                {blocksFor(d).map((b) => {
                  const editable = panelFor(b.event);
                  const height = ((b.endMin - b.startMin) / 60) * HOUR_REM;
                  const style = {
                    top: `${topRem(b.startMin)}rem`,
                    height: `${Math.max(height, 0.9)}rem`,
                    left: `calc(${(b.lane / b.lanes) * 100}% + 1px)`,
                    width: `calc(${100 / b.lanes}% - 2px)`,
                  };
                  // Blok pendek (<= 45 menit) satu baris saja supaya jamnya tidak terpotong di baris kedua.
                  const short = b.endMin - b.startMin <= 45;
                  const className = `absolute z-10 overflow-hidden rounded-md border border-foreground bg-background px-1.5 py-0.5 text-left text-xs leading-tight hover:bg-surface ${
                    short ? "truncate whitespace-nowrap" : ""
                  } ${ghost?.id === b.event.id ? "opacity-40" : ""}`;
                  const linked = linkedTitles[b.event.id];
                  const body = (
                    <>
                      <span className="font-medium">{b.event.title}</span> <span className="text-muted">{minutesToTime(b.startMin)}</span>
                    </>
                  );
                  return editable ? (
                    <button
                      key={b.event.id + b.startMin}
                      type="button"
                      className={`${className} cursor-grab active:cursor-grabbing`}
                      style={style}
                      title={linked ? `${b.event.title} (linked to to-do: ${linked})` : b.event.title}
                      onPointerDown={(e) => beginGesture("move", b, d.date, e)}
                      onPointerMove={updateGesture}
                      onPointerUp={endGesture}
                      onPointerCancel={endGesture}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        setError(null);
                        setPanel(editable);
                      }}
                    >
                      {body}
                      <span
                        aria-hidden
                        data-resize
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                        onPointerDown={(e) => beginGesture("resize", b, d.date, e)}
                        onPointerMove={updateGesture}
                        onPointerUp={endGesture}
                        onPointerCancel={endGesture}
                      />
                    </button>
                  ) : (
                    <a
                      key={b.event.id + b.startMin}
                      href={b.event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                      style={style}
                      title={`${b.event.title} (spans several days: edit in Google Calendar)`}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {body}
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 sm:items-center" onClick={close}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={panel.mode === "edit" ? "Edit time block" : "New time block"}
            className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-foreground bg-background p-6 shadow-xl"
          >
            <h3 className="text-xl font-semibold tracking-tight">{panel.mode === "edit" ? "Edit block" : "New time block"}</h3>
            {panel.mode === "create" && linkable.length > 0 && (
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Link to a to-do (optional)</span>
                <select value={panel.todoId ?? ""} onChange={(e) => pickTodo(e.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {linkable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {panel.mode === "edit" && panel.id && linkedTitles[panel.id] && (
              <p className="rounded-xl bg-surface px-3 py-2 text-sm">
                Linked to-do: <span className="font-medium">{linkedTitles[panel.id]}</span>. Its date and time follow this block.
              </p>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Title</span>
              <input
                autoFocus
                required
                maxLength={200}
                value={panel.title}
                onChange={(e) => setPanel({ ...panel, title: e.target.value })}
                placeholder="e.g. UAT prep"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Date</span>
              <input type="date" required value={panel.date} onChange={(e) => setPanel({ ...panel, date: e.target.value })} className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Start</span>
                <input type="time" step={900} required value={panel.start} onChange={(e) => setPanel({ ...panel, start: e.target.value })} className={inputClass} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted">End</span>
                <input type="time" step={900} required value={panel.end} onChange={(e) => setPanel({ ...panel, end: e.target.value })} className={inputClass} />
              </label>
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-accent px-6 py-2.5 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={close} className="rounded-full border border-foreground px-5 py-2.5 text-base hover:bg-surface">
                Cancel
              </button>
              {panel.mode === "edit" && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="ml-auto rounded-full border border-danger px-5 py-2.5 text-base text-danger hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              )}
            </div>
            {panel.link && (
              <a href={panel.link} target="_blank" rel="noopener noreferrer" className="block text-sm text-muted underline">
                Open in Google Calendar
              </a>
            )}
          </form>
        </div>
      )}
    </>
  );
}
