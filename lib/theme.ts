// Pilihan tema: "system" (ikut pengaturan perangkat), "light", atau "dark". Disimpan per perangkat di localStorage (tema memang bergantung pada
// perangkat dan waktu, jadi tidak disinkronkan antar perangkat). Modul murni; DOM disentuh hanya oleh components/ThemeSwitch.tsx dan skrip awal.

export type Theme = "system" | "light" | "dark";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];
export const THEME_KEY = "theme-v1";
export const THEME_EVENT = "theme-change";
export const DEFAULT_THEME: Theme = "system";

export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_THEME;
}

/** Apakah tampilan akhirnya gelap? `systemDark` = hasil matchMedia("(prefers-color-scheme: dark)"). */
export function isDark(theme: Theme, systemDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemDark);
}

/** Nilai atribut <html data-theme>: hanya pilihan eksplisit yang diberi atribut; "system" tanpa atribut supaya CSS memakai prefers-color-scheme. */
export const themeAttribute = (theme: Theme): "light" | "dark" | null => (theme === "system" ? null : theme);

/**
 * Skrip kecil yang dijalankan di <head> SEBELUM halaman digambar (inline, tanpa menunggu React) supaya pilihan eksplisit langsung berlaku dan
 * halaman tidak berkedip terang lalu gelap. Isinya harus selaras dengan parseTheme/themeAttribute di atas.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
