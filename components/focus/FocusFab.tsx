"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_FOCUS, FOCUS_CHOICES, LABEL_MAX, POINTS_PER_SESSION, formatClock, parseFabPos, parseTimerState, remainingSeconds, snapFabPos, type FabPos } from "@/lib/focus";
import { startBreakTimer, startFocusTimer, useNow, useTimerRaw, writeTimer } from "@/components/focus/store";

// Tombol timer fokus yang selalu terlihat (ala "assistive touch"): mengambang di tepi layar, bisa diseret ke mana saja, dan menempel ke
// sisi kiri/kanan terdekat. Posisinya diingat di localStorage. Saat timer berjalan ia berubah jadi pil berisi hitung mundur; mengkliknya
// membuka panel kecil untuk memulai / menghentikan tanpa pindah halaman. Pencatatan sesi selesai tetap dilakukan FocusBadge.

const POS_KEY = "focus-fab-v1";
const POS_EVENT = "focus-fab-change";
const DRAG_THRESHOLD = 6;

function subscribePos(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(POS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(POS_EVENT, onChange);
  };
}
function posSnapshot(): string | null {
  try {
    return window.localStorage.getItem(POS_KEY);
  } catch {
    return null;
  }
}
function savePos(pos: FabPos) {
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* penyimpanan diblokir: posisi hanya berlaku selama halaman terbuka */
  }
  window.dispatchEvent(new Event(POS_EVENT));
}

const btn = "rounded-full border border-border-strong px-4 py-1.5 text-sm font-medium transition-colors hover:bg-surface";
const primary = "rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover";

function TimerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
    </svg>
  );
}

export function FocusFab() {
  const pathname = usePathname();
  const raw = useTimerRaw();
  const state = useMemo(() => parseTimerState(raw), [raw]);
  const running = state?.phase === "focus" || state?.phase === "break";
  const now = useNow(running);
  const posRaw = useSyncExternalStore(subscribePos, posSnapshot, () => null);
  const pos = useMemo(() => parseFabPos(posRaw), [posRaw]);

  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [minutes, setMinutes] = useState<number>(DEFAULT_FOCUS);
  const [label, setLabel] = useState("");
  const wrap = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{ px: number; py: number; left: number; top: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  // Tutup panel dengan Escape atau klik di luar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Halaman Focus sudah menampilkan timernya sendiri.
  if (pathname.startsWith("/focus")) return null;

  const left = running && now > 0 && state ? remainingSeconds(state.endsAt, now) : null;
  const isFocus = state?.phase === "focus";
  const ended = isFocus && left === 0;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    gesture.current = { px: e.clientX, py: e.clientY, left: r.left, top: r.top, moved: false };
    justDragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    setOpen(false);
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(window.innerWidth - r.width, Math.max(0, g.left + dx));
    const y = Math.min(window.innerHeight - r.height, Math.max(0, g.top + dy));
    setDrag({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g?.moved || !drag) return;
    const r = e.currentTarget.getBoundingClientRect();
    savePos(snapFabPos(drag.x + r.width / 2, drag.y + r.height / 2, window.innerWidth, window.innerHeight));
    justDragged.current = true; // klik yang menyusul seretan tidak boleh membuka panel
    setDrag(null);
  };
  const onClick = () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    setOpen((v) => !v);
  };

  const place: React.CSSProperties = drag
    ? { left: drag.x, top: drag.y }
    : { [pos.side === "l" ? "left" : "right"]: "0.75rem", top: `clamp(4.5rem, ${pos.frac * 100}dvh, calc(100dvh - 4.5rem - env(safe-area-inset-bottom, 0px)))` };
  const panelUp = (drag ? drag.y / window.innerHeight : pos.frac) > 0.5;
  const panelLeft = drag ? drag.x + 24 < window.innerWidth / 2 : pos.side === "l";

  const tone = !state || state.phase === "expired" ? "idle" : state.phase === "break" ? "break" : state.phase === "done" ? "done" : "focus";
  const pill =
    tone === "idle"
      ? "border-accent bg-accent text-white hover:bg-accent-hover"
      : tone === "focus"
        ? "border-accent/30 bg-accent-soft text-accent-ink"
        : tone === "break"
          ? "border-success/30 bg-success-soft text-success-ink"
          : "border-accent bg-accent text-white";
  const face =
    tone === "idle" ? null : tone === "done" ? (state?.phase === "done" && state.error ? "Done" : `+${state?.phase === "done" ? state.points : 0}`) : left === null ? "--:--" : ended ? "Saving…" : formatClock(left);
  const aria =
    tone === "idle"
      ? "Focus timer: start a session"
      : tone === "done"
        ? "Focus session finished"
        : `${isFocus ? "Focus" : "Break"} timer, ${left === null ? "" : formatClock(left) + " left"}`;

  return (
    <div ref={wrap} className="fixed z-40 touch-none select-none" style={place}>
      {open && (
        <div
          role="dialog"
          aria-label="Focus timer"
          className={`anim-pop absolute w-64 rounded-2xl border border-border bg-background p-4 text-sm shadow-pop ${panelUp ? "bottom-full mb-2" : "top-full mt-2"} ${panelLeft ? "left-0" : "right-0"}`}
          style={{ transformOrigin: `${panelUp ? "bottom" : "top"} ${panelLeft ? "left" : "right"}` }}
        >
          {(tone === "idle" || tone === "focus" || tone === "break" || tone === "done") && (
            <>
              {tone === "idle" && (
                <>
                  <p className="font-semibold">Start a focus session</p>
                  <div role="group" aria-label="Length in minutes" className="mt-3 flex gap-1.5">
                    {FOCUS_CHOICES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMinutes(m)}
                        aria-pressed={minutes === m}
                        className={`h-9 flex-1 rounded-lg border text-sm tabular-nums transition-colors ${minutes === m ? "border-accent bg-accent text-white" : "border-border hover:border-accent"}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    maxLength={LABEL_MAX}
                    placeholder="Working on… (optional)"
                    aria-label="What are you working on? (optional)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        startFocusTimer(minutes, label);
                        setLabel("");
                        setOpen(false);
                      }
                    }}
                    className="mt-3 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      startFocusTimer(minutes, label);
                      setLabel("");
                      setOpen(false);
                    }}
                    className={`${primary} mt-3 w-full`}
                  >
                    Start {minutes} min
                  </button>
                  <p className="mt-2 text-center text-xs text-muted">Finish the full session to earn {POINTS_PER_SESSION} points.</p>
                </>
              )}
              {(tone === "focus" || tone === "break") && state && (state.phase === "focus" || state.phase === "break") && (
                <>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isFocus ? "text-accent" : "text-success"}`}>{isFocus ? "Focus" : "Break"}</p>
                  <p role="timer" aria-live="off" className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
                    {left === null ? "--:--" : formatClock(left)}
                  </p>
                  {isFocus && state.label && <p className="mt-1 truncate">{state.label}</p>}
                  <div className="mt-4 flex gap-2">
                    {ended ? (
                      <p role="status" className="text-muted">
                        Saving your session…
                      </p>
                    ) : isFocus ? (
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          if (window.confirm("Stop this session? It will not count and no points are added.")) {
                            writeTimer(null);
                            setOpen(false);
                          }
                        }}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          writeTimer(null);
                          setOpen(false);
                        }}
                      >
                        Skip break
                      </button>
                    )}
                  </div>
                </>
              )}
              {tone === "done" && state?.phase === "done" && (
                <>
                  {state.error ? (
                    <>
                      <p className="font-semibold">Session finished</p>
                      <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                        {state.error}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-success">Session complete</p>
                      <p role="status" className="mt-1 text-4xl font-semibold tracking-tight text-accent">
                        +{state.points}
                      </p>
                      <p className="text-muted">
                        points · {state.minutes} min{state.label ? ` · ${state.label}` : ""}
                      </p>
                    </>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={primary}
                      onClick={() => {
                        startBreakTimer(state.sessionsToday ?? 0);
                        setOpen(false);
                      }}
                    >
                      Start break
                    </button>
                    <button
                      type="button"
                      className={btn}
                      onClick={() => {
                        writeTimer(null);
                        setOpen(false);
                      }}
                    >
                      Skip break
                    </button>
                  </div>
                </>
              )}
              {tone === "idle" && state?.phase === "expired" && (
                <p role="status" className="mt-3 text-xs text-muted">
                  Your last {state.minutes}-minute session ended while this site was closed for more than 15 minutes, so it was not counted.
                </p>
              )}
              <Link href="/focus" onClick={() => setOpen(false)} className="mt-3 inline-block text-xs text-muted underline underline-offset-4 hover:text-foreground">
                Open Focus page
              </Link>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label={aria}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        className={`flex items-center justify-center gap-2 rounded-full border shadow-lift transition-colors ${tone === "idle" ? "h-12 w-12" : "h-11 px-4"} ${pill} ${drag ? "cursor-grabbing" : "cursor-grab"}`}
      >
        {tone === "idle" ? (
          <TimerIcon />
        ) : (
          <>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone === "focus" ? "bg-accent" : tone === "break" ? "bg-success" : "bg-white"}`} />
            <span className="text-sm font-medium tabular-nums">{face}</span>
          </>
        )}
      </button>
    </div>
  );
}
