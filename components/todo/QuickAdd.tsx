"use client";

import { useRef, useState, useTransition } from "react";
import { createTodoQuick } from "@/app/(dashboard)/todos/actions";

const inputClass =
  "h-10 rounded-xl border border-border bg-background px-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

/** Jam WIB berikutnya (pembulatan ke jam penuh): "14:00" -> mulai, +1 jam -> selesai. */
function defaultTimes(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "9") % 24;
  const start = Math.min(hour + 1, 22);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${pad(start)}:00`, end: `${pad(start + 1)}:00` };
}

/**
 * Kotak "tugas baru" dengan pilihan memasukkannya ke kalender: tombol "Calendar" membuka tanggal + jam mulai/selesai, dan
 * to-do langsung punya blok di Google Calendar. Tanpa pilihan itu perilakunya sama seperti sebelumnya.
 */
export function QuickAdd({
  date,
  goalId,
  calendarConnected,
  placeholder = "+ Write a new task, then press Enter",
  ariaLabel = "New task for today",
}: {
  date: string;
  goalId?: string;
  calendarConnected: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [withCalendar, setWithCalendar] = useState(false);
  const [times, setTimes] = useState(defaultTimes);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await createTodoQuick(data);
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
        return;
      }
      form.reset();
      setWithCalendar(false);
      if (result.warning) setMessage({ text: result.warning, error: true });
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-2">
      {goalId && <input type="hidden" name="goal_id" value={goalId} />}
      <div className="flex items-center gap-2">
        <input
          name="title"
          required
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-dashed border-border-strong px-5 text-base placeholder:text-subtle focus:border-solid focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
        {calendarConnected && (
          <button
            type="button"
            onClick={() => setWithCalendar((v) => !v)}
            aria-pressed={withCalendar}
            aria-label="Add to calendar"
            title="Also put it on Google Calendar"
            className={`h-12 shrink-0 rounded-2xl border px-4 text-sm transition-colors ${
              withCalendar ? "border-accent bg-accent-soft text-accent-ink" : "border-border-strong text-muted hover:bg-surface"
            }`}
          >
            Calendar
          </button>
        )}
      </div>

      {withCalendar && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted">Date</span>
            <input type="date" name="date" defaultValue={date} required className={inputClass} />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted">From</span>
            <input type="time" name="start_time" value={times.start} onChange={(e) => setTimes({ ...times, start: e.target.value })} required className={inputClass} />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted">To</span>
            <input type="time" name="end_time" value={times.end} onChange={(e) => setTimes({ ...times, end: e.target.value })} required className={inputClass} />
          </label>
          <span className="text-xs text-subtle">Press Enter in the title to add.</span>
        </div>
      )}

      {pending && <p className="sr-only" role="status">Adding…</p>}
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
