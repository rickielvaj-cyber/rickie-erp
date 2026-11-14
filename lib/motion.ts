// Preferensi gerak: "system" (ikut pengaturan "kurangi gerak" perangkat), "on" (selalu tampilkan animasi), atau "off" (tanpa animasi). Disimpan
// per perangkat di localStorage. Modul murni; DOM disentuh hanya oleh components/MotionSwitch.tsx dan skrip awal. Pola sama dengan lib/theme.ts.

export type Motion = "system" | "on" | "off";
export const MOTIONS: readonly Motion[] = ["system", "on", "off"];
export const MOTION_KEY = "motion-v1";
export const MOTION_EVENT = "motion-change";
export const DEFAULT_MOTION: Motion = "system";

export function parseMotion(raw: string | null | undefined): Motion {
  return raw === "on" || raw === "off" || raw === "system" ? raw : DEFAULT_MOTION;
}

/** Nilai atribut <html data-motion>: hanya pilihan eksplisit yang diberi atribut; "system" tanpa atribut supaya CSS memakai prefers-reduced-motion. */
export const motionAttribute = (m: Motion): "on" | "off" | null => (m === "system" ? null : m);

/** Apakah animasi akhirnya aktif? `reduceMotion` = hasil matchMedia("(prefers-reduced-motion: reduce)"). */
export function motionEnabled(m: Motion, reduceMotion: boolean): boolean {
  return m === "on" || (m === "system" && !reduceMotion);
}

/** Skrip awal di <head> (sebelum halaman digambar): pilihan eksplisit langsung berlaku. Harus selaras dengan parseMotion/motionAttribute. */
export const MOTION_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(MOTION_KEY)});if(m==="on"||m==="off")document.documentElement.setAttribute("data-motion",m)}catch(e){}})()`;
