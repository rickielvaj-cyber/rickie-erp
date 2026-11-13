"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { recordFocusSession } from "@/app/(dashboard)/focus/actions";
import { focusOutcome, parseTimerState } from "@/lib/focus";
import { beep, useNow, useTimerRaw, writeTimer } from "@/components/focus/store";

const RETRY_MS = 10_000;

/**
 * Pengendali tanpa tampilan (dipasang sekali di menu atas, jadi aktif di halaman mana pun): satu-satunya tempat yang mendeteksi timer
 * habis dan mencatat sesinya, supaya tidak tercatat dobel dan tetap jalan walau kamu sedang di halaman lain. Tampilannya ada di
 * FocusFab (tombol melayang) dan halaman Focus. Gagal menghubungi server = coba lagi tiap 10 detik selama masa tenggang; ditolak
 * server = alasannya disimpan di status timer dan ditampilkan di sana.
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

  return null;
}
