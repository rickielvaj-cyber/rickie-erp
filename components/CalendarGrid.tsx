"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDayMonth, formatLongDay, formatWeekdayShort } from "@/lib/date";
import { dragRange, minutesToTime, slotFromOffset, DEFAULT_BLOCK_MIN } from "@/lib/google/block";
import { toWib, type CalendarEvent, type DayLayout } from "@/lib/google/layout";
import { createCalendarBlock, deleteCalendarBlock, updateCalendarBlock } from "@/app/(dashboard)/todos/calendar-actions";

const HOUR_REM = 3; // tinggi satu jam di grid

type Panel = {
  mode: "create" | "edit";
  id?: string;
  title: string;
  date: string;
  start: string;
  end: string;
  link?: string;
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
  suggestions,
}: {
  days: DayLayout[];
  today: string;
  startHour: number;
  endHour: number;
  suggestions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ date: string; a: number; b: number } | null>(null);
  const dragRef = useRef<{ date: string; a: number; b: number; moved: boolean } | null>(null);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const hasAllDay = days.some((d) => d.allDay.length > 0);
  const cols = "grid grid-cols-[3rem_repeat(7,minmax(7rem,1fr))]";
  const topOf = (min: number) => `${((min - startHour * 60) / 60) * HOUR_REM}rem`;

  const close = () => {
    setPanel(null);
    setError(null);
  };

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  const pointerMinutes = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return slotFromOffset(e.clientY - rect.top, rect.height, startHour, endHour);
  };

  const onColumnDown = (date: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // klik pada acara ditangani acaranya
    if (e.button !== 0) return;
    const m = pointerMinutes(e);
    dragRef.current = { date, a: m, b: m, moved: false };
    setDrag({ date, a: m, b: m });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onColumnMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerType !== "mouse") return; // layar sentuh: ketuk saja (agar tidak mengganggu gulir)
    const m = pointerMinutes(e);
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!panel) return;
    const payload = { title: panel.title, date: panel.date, start: panel.start, end: panel.end };
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

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Click or drag on an empty slot to block time. Click a block to edit or delete it.</p>
        <button type="button" onClick={newBlock} className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover">
          + New block
        </button>
      </div>

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
                    style={{
                      top: topOf(Math.min(drag.a, drag.b)),
                      height: `${(Math.max(Math.abs(drag.b - drag.a), 15) / 60) * HOUR_REM}rem`,
                    }}
                  />
                )}
                {d.blocks.map((b) => {
                  const editable = panelFor(b.event);
                  const top = ((b.startMin - startHour * 60) / 60) * HOUR_REM;
                  const height = ((b.endMin - b.startMin) / 60) * HOUR_REM;
                  const style = {
                    top: `${top}rem`,
                    height: `${Math.max(height, 0.9)}rem`,
                    left: `calc(${(b.lane / b.lanes) * 100}% + 1px)`,
                    width: `calc(${100 / b.lanes}% - 2px)`,
                  };
                  // Blok pendek (<= 45 menit) satu baris saja supaya jamnya tidak terpotong di baris kedua.
                  const short = b.endMin - b.startMin <= 45;
                  const className = `absolute z-10 cursor-pointer overflow-hidden rounded-md border border-foreground bg-background px-1.5 py-0.5 text-left text-xs leading-tight hover:bg-surface ${
                    short ? "truncate whitespace-nowrap" : ""
                  }`;
                  const body = (
                    <>
                      <span className="font-medium">{b.event.title}</span> <span className="text-muted">{minutesToTime(b.startMin)}</span>
                    </>
                  );
                  return editable ? (
                    <button
                      key={b.event.id + b.startMin}
                      type="button"
                      className={className}
                      style={style}
                      title={b.event.title}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setError(null);
                        setPanel(editable);
                      }}
                    >
                      {body}
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
            className="w-full max-w-md space-y-4 rounded-3xl border border-foreground bg-background p-6 shadow-xl"
          >
            <h3 className="text-xl font-semibold tracking-tight">{panel.mode === "edit" ? "Edit block" : "New time block"}</h3>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Title</span>
              <input
                autoFocus
                required
                maxLength={200}
                list="calendar-todo-suggestions"
                value={panel.title}
                onChange={(e) => setPanel({ ...panel, title: e.target.value })}
                placeholder="e.g. UAT prep, or pick one of your to-dos"
                className={inputClass}
              />
              <datalist id="calendar-todo-suggestions">
                {suggestions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
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
