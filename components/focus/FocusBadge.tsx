"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordFocusSession } from "@/app/(dashboard)/focus/actions";
import { focusOutcome, formatClock, parseTimerState, remainingSeconds } from "@/lib/focus";
import { beep, useNow, useTimerRaw, writeTimer } from "@/components/focus/store";

const RETRY_MS = 10_000;

/**
 * Lencana kecil di menu atas selama timer berjalan (di halaman mana pun). Ini JUGA satu-satunya tempat yang mendeteksi timer habis dan
 * mencatat sesinya, supaya tidak tercatat dobel dan tetap jalan walau kamu sedang di halaman lain. Gagal menghubungi server = coba lagi
 * tiap 10 detik selama masa tenggang; ditolak server = tampilkan alasannya.
 */
export function FocusBadge() {
  const router = useRouter();
  const raw = useTimerRaw();
  const state = useMemo(() => parseTimerState(raw), [raw]);
  const running = state?.phase === "focus" || state?.phase === "break";
  const now = useNow(running);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!state || now === 0) return;
    if (state.phase === "break") {
      if (now < state.endsAt || handled.current === `break-${state.startedAt}`) return;
      handled.current = `break-${state.startedAt}`;
      writeTimer(null);
      beep();
      return;
    }
    if (state.phase !== "focus") return;
    const outcome = focusOutcome(state.endsAt, now);
    const key = `focus-${state.startedAt}`;
    if (outcome === "running" || handled.current === key) return;
    handled.current = key;
    if (outcome === "discard") {
      writeTimer({ phase: "expired", minutes: state.minutes, at: now });
      return;
    }
    void (async () => {
      try {
        const result = await recordFocusSession({ startedAt: new Date(state.startedAt).toISOString(), minutes: state.minutes, label: state.label });
        writeTimer({
          phase: "done",
          minutes: state.minutes,
          label: state.label,
          points: result.ok ? result.points : 0,
          at: Date.now(),
          ...(result.ok ? { sessionsToday: result.sessionsToday } : {}),
          ...(result.ok ? {} : { error: result.error }),
        });
        beep();
        router.refresh();
      } catch {
        // Tidak sampai ke server: coba lagi sebentar lagi (masih dalam masa tenggang).
        setTimeout(() => {
          handled.current = null;
        }, RETRY_MS);
      }
    })();
  }, [state, now, router]);

  if (!state || state.phase === "expired") return null;
  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm tabular-nums transition-colors";

  if (state.phase === "done") {
    return (
      <Link href="/focus" className={`${base} border-foreground bg-foreground text-background`}>
        {state.error ? "Focus ended" : `Focus done · +${state.points}`}
      </Link>
    );
  }
  if (now === 0) return null;
  const left = remainingSeconds(state.endsAt, now);
  const ended = state.phase === "focus" && left === 0;
  return (
    <Link href="/focus" className={`${base} border-foreground hover:bg-surface`} aria-label={ended ? "Saving the focus session" : `${state.phase === "focus" ? "Focus" : "Break"} timer, ${formatClock(left)} left`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${state.phase === "focus" ? "bg-foreground" : "border border-foreground"}`} />
      {ended ? "Saving…" : `${state.phase === "focus" ? "Focus" : "Break"} ${formatClock(left)}`}
    </Link>
  );
}
