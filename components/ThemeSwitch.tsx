"use client";

import { useSyncExternalStore } from "react";
import { THEMES, THEME_EVENT, THEME_KEY, parseTheme, themeAttribute, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}
function snapshot(): string | null {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/** Pasang tema ke <html> dan simpan. Dipakai saklar di bawah; skrip awal di <head> melakukan hal yang sama sebelum halaman digambar. */
export function applyTheme(theme: Theme): void {
  const attr = themeAttribute(theme);
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  else document.documentElement.removeAttribute("data-theme");
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* penyimpanan diblokir: tema hanya berlaku selama halaman terbuka */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Tiga pilihan tema (System / Light / Dark) di menu akun. Tetap terbuka saat memilih supaya hasilnya langsung terlihat. */
export function ThemeSwitch() {
  const current = parseTheme(useSyncExternalStore(subscribe, snapshot, () => null));
  return (
    <div className="px-3 py-2">
      <p id="theme-label" className="text-xs text-muted">
        Appearance
      </p>
      <div role="group" aria-labelledby="theme-label" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-surface p-0.5">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={current === t}
            onClick={() => applyTheme(t)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${current === t ? "bg-background font-medium text-foreground shadow-card" : "text-muted hover:text-foreground"}`}
          >
            {LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
