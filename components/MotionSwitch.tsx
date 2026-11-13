"use client";

import { useSyncExternalStore } from "react";
import { MOTIONS, MOTION_EVENT, MOTION_KEY, motionAttribute, parseMotion, type Motion } from "@/lib/motion";

const LABEL: Record<Motion, string> = { system: "System", on: "On", off: "Off" };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(MOTION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(MOTION_EVENT, onChange);
  };
}
function snapshot(): string | null {
  try {
    return window.localStorage.getItem(MOTION_KEY);
  } catch {
    return null;
  }
}

/** Pasang preferensi gerak ke <html> dan simpan (skrip awal di <head> melakukan hal yang sama sebelum halaman digambar). */
export function applyMotion(m: Motion): void {
  const attr = motionAttribute(m);
  if (attr) document.documentElement.setAttribute("data-motion", attr);
  else document.documentElement.removeAttribute("data-motion");
  try {
    window.localStorage.setItem(MOTION_KEY, m);
  } catch {
    /* penyimpanan diblokir: berlaku selama halaman terbuka */
  }
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/** Pilihan animasi (System / On / Off) di menu akun. "On" menimpa pengaturan "kurangi gerak" perangkat. */
export function MotionSwitch() {
  const current = parseMotion(useSyncExternalStore(subscribe, snapshot, () => null));
  return (
    <div className="px-3 pb-2">
      <p id="motion-label" className="text-xs text-muted">
        Animations
      </p>
      <div role="group" aria-labelledby="motion-label" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-surface p-0.5">
        {MOTIONS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={current === m}
            onClick={() => applyMotion(m)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${current === m ? "bg-background font-medium text-foreground shadow-card" : "text-muted hover:text-foreground"}`}
          >
            {LABEL[m]}
          </button>
        ))}
      </div>
      {current === "system" && <p className="mt-1.5 text-[11px] leading-snug text-subtle">Follows your device&apos;s &ldquo;reduce motion&rdquo; setting. Choose On to always show them.</p>}
    </div>
  );
}
