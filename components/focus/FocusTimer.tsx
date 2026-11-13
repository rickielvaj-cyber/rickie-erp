"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_FOCUS, FOCUS_CHOICES, LABEL_MAX, POINTS_PER_SESSION, breakMinutes, formatClock, parseTimerState, remainingSeconds } from "@/lib/focus";
import { startBreakTimer, startFocusTimer, useNow, useTimerRaw, writeTimer } from "@/components/focus/store";

const button = "rounded-full border border-border-strong px-5 py-2 text-base font-medium transition-colors hover:bg-surface";
const primary = "rounded-full bg-accent px-6 py-2.5 text-base font-medium text-white transition-colors hover:bg-accent-hover";

/**
 * Timer Pomodoro bebas (tidak terikat to-do). Status timer ada di localStorage, jadi tetap jalan saat pindah halaman atau memuat ulang.
 * Pencatatan sesi selesai dilakukan FocusBadge (menu atas); komponen ini hanya menampilkan dan mengendalikan timernya.
 */
export function FocusTimer({ sessionsToday }: { sessionsToday: number }) {
  const raw = useTimerRaw();
  const state = useMemo(() => parseTimerState(raw), [raw]);
  const running = state?.phase === "focus" || state?.phase === "break";
  const now = useNow(running);
  const [minutes, setMinutes] = useState<number>(DEFAULT_FOCUS);
  const [label, setLabel] = useState("");

  const left = running && now > 0 ? remainingSeconds(state.endsAt, now) : null;

  // Hitung mundur juga terlihat di judul tab selama berjalan.
  const titleText = running && left !== null ? `${formatClock(left)} · ${state.phase === "focus" ? "Focus" : "Break"}` : null;
  useEffect(() => {
    if (!titleText) return;
    const previous = document.title;
    document.title = titleText;
    return () => {
      document.title = previous;
    };
  }, [titleText]);

  const startFocus = () => startFocusTimer(minutes, label);
  // Setelah sesi selesai, jumlah sesi hari ini datang bersama hasil pencatatan (halaman baru menyusul beberapa saat kemudian).
  const countToday = state?.phase === "done" && state.sessionsToday !== undefined ? state.sessionsToday : sessionsToday;
  const startBreak = () => startBreakTimer(countToday);
  const stopFocus = () => {
    if (window.confirm("Stop this session? It will not count and no points are added.")) writeTimer(null);
  };

  const card = "rounded-3xl border border-border bg-surface p-6 sm:p-8";

  if (state?.phase === "focus" || state?.phase === "break") {
    const total = state.minutes * 60;
    const done = left === null ? 0 : Math.min(1, Math.max(0, 1 - left / total));
    const isFocus = state.phase === "focus";
    const ended = isFocus && left === 0;
    return (
      <section aria-label="Timer" className={`${card} text-center`}>
        <p className={`text-sm font-semibold uppercase tracking-wide ${isFocus ? "text-accent-ink" : "text-success"}`}>{isFocus ? "Focus" : "Break"}</p>
        <p role="timer" aria-live="off" className="mt-2 text-7xl font-semibold tabular-nums tracking-tight sm:text-8xl">
          {left === null ? "--:--" : formatClock(left)}
        </p>
        {isFocus && state.label && <p className="mt-2 text-lg">{state.label}</p>}
        <div className="mx-auto mt-6 h-1.5 max-w-md overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div className={`h-full transition-[width] duration-1000 ease-linear ${isFocus ? "bg-accent" : "bg-success"}`} style={{ width: `${done * 100}%` }} />
        </div>
        <div className="mt-8 flex justify-center gap-3">
          {ended ? (
            <p role="status" className="text-base text-muted">
              Saving your session…
            </p>
          ) : isFocus ? (
            <button type="button" onClick={stopFocus} className={button}>
              Stop
            </button>
          ) : (
            <button type="button" onClick={() => writeTimer(null)} className={button}>
              Skip break
            </button>
          )}
        </div>
        {isFocus && !ended && <p className="mt-4 text-sm text-muted">Finish the full {state.minutes} minutes to earn {POINTS_PER_SESSION} points.</p>}
      </section>
    );
  }

  if (state?.phase === "done") {
    const m = breakMinutes(countToday);
    return (
      <section aria-label="Timer" className={`${card} text-center`}>
        {state.error ? (
          <>
            <p className="text-2xl font-semibold tracking-tight">Session finished</p>
            <p role="alert" className="mx-auto mt-3 max-w-md rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
              {state.error}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-success">Session complete</p>
            <p role="status" className="mt-2 text-6xl font-semibold tracking-tight text-accent-ink">
              +{state.points}
            </p>
            <p className="mt-1 text-base text-muted">
              points · {state.minutes} min{state.label ? ` · ${state.label}` : ""}
            </p>
          </>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={startBreak} className={primary}>
            Start {m}-min break
          </button>
          <button type="button" onClick={() => writeTimer(null)} className={button}>
            Skip break
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Timer" className={card}>
      {state?.phase === "expired" && (
        <p role="status" className="mb-6 rounded-xl border border-border bg-background px-4 py-3 text-sm">
          Your last {state.minutes}-minute session ended while this site was closed for more than 15 minutes, so it was not counted.{" "}
          <button type="button" onClick={() => writeTimer(null)} className="underline underline-offset-4">
            Dismiss
          </button>
        </p>
      )}
      <p className="text-center text-7xl font-semibold tabular-nums tracking-tight sm:text-8xl">{formatClock(minutes * 60)}</p>
      <div className="mx-auto mt-8 grid max-w-xl gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm text-muted">
          What are you working on? (optional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={LABEL_MAX}
            placeholder="e.g. Blueprint review"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
        </label>
        <div>
          <p id="focus-length-label" className="text-sm text-muted">
            Length
          </p>
          <div role="group" aria-labelledby="focus-length-label" className="mt-1 flex gap-1.5">
            {FOCUS_CHOICES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                aria-pressed={minutes === m}
                className={`h-11 rounded-xl border px-3 text-sm tabular-nums transition-colors ${
                  minutes === m ? "border-accent bg-accent text-white" : "border-border hover:border-accent"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8 flex justify-center">
        <button type="button" onClick={startFocus} className={primary}>
          Start focus
        </button>
      </div>
    </section>
  );
}
