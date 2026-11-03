"use client";

import { useActionState } from "react";
import { addCalendarSource, type CalendarSourceState } from "@/app/(dashboard)/settings/calendar-sources-actions";

export function CalendarSourcesForm({ full }: { full: boolean }) {
  const [state, action, pending] = useActionState<CalendarSourceState, FormData>(addCalendarSource, null);
  const input = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block text-sm text-muted">
          Calendar ID
          <input name="calendar_id" required disabled={pending || full} placeholder="e.g. abc123@group.calendar.google.com" autoComplete="off" spellCheck={false} className={`${input} mt-1`} />
        </label>
        <label className="block text-sm text-muted">
          Name (optional)
          <input name="label" maxLength={80} disabled={pending || full} placeholder="e.g. Office" className={`${input} mt-1`} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || full}
        className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Checking with Google…" : "Add calendar"}
      </button>
      {full && <p className="text-sm text-muted">The limit is reached. Remove a calendar to add another.</p>}
      {state && !pending && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2.5 text-sm ${state.ok ? "border border-border bg-surface" : "bg-red-50 text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
