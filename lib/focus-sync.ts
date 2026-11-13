import { GRACE_MS, LABEL_MAX, type TimerState } from "@/lib/focus";

// Sinkronisasi timer fokus antar perangkat. Timer yang sedang BERJALAN (fokus atau istirahat) disimpan satu baris per pengguna di tabel
// `focus_timer` (migrasi 0033) supaya laptop dan HP melihat timer yang sama; localStorage tetap jadi cache instan. Modul ini murni
// (tanpa jaringan/penyimpanan) supaya aturan rekonsiliasi bisa diuji.

export type RunningTimer = Extract<TimerState, { phase: "focus" | "break" }>;

export const isRunningTimer = (s: TimerState | null | undefined): s is RunningTimer => s?.phase === "focus" || s?.phase === "break";

const MAX_SPAN_MS = 125 * 60_000; // sesi terpanjang 120 menit + sedikit toleransi
const MAX_FUTURE_START_MS = 5 * 60_000; // selisih jam antar perangkat yang masih wajar

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Validasi timer berjalan dari sumber yang tidak dipercaya (browser atau isi database). null = tidak sah. Tidak menolak timer yang
 * sudah lama habis (itu urusan `reconcileTimer`); hanya bentuk dan batas yang masuk akal.
 */
export function parseRunningTimer(raw: unknown, now: number): RunningTimer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (s.phase !== "focus" && s.phase !== "break") return null;
  if (!isNum(s.startedAt) || !isNum(s.endsAt) || !isNum(s.minutes)) return null;
  if (s.endsAt <= s.startedAt || s.endsAt - s.startedAt > MAX_SPAN_MS) return null;
  if (!Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 120) return null;
  if (s.startedAt > now + MAX_FUTURE_START_MS) return null;
  if (s.phase === "break") return { phase: "break", startedAt: s.startedAt, endsAt: s.endsAt, minutes: s.minutes };
  const label = typeof s.label === "string" ? s.label.slice(0, LABEL_MAX) : "";
  return { phase: "focus", startedAt: s.startedAt, endsAt: s.endsAt, minutes: s.minutes, label };
}

/**
 * Catatan sinkronisasi di perangkat ini. `synced` = waktu mulai timer yang sudah pasti ada di server. `pendingClear` = penghapusan yang belum
 * berhasil: waktu mulai timer yang sudah dihentikan di sini, jadi hanya baris yang TIDAK lebih baru dari itu yang boleh dihapus (timer baru
 * milik perangkat lain tidak boleh ikut terhapus).
 */
export type SyncMeta = { synced: number | null; pendingClear: number | null };
export const EMPTY_SYNC_META: SyncMeta = { synced: null, pendingClear: null };

export function parseSyncMeta(raw: string | null): SyncMeta {
  if (!raw) return EMPTY_SYNC_META;
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    return { synced: isNum(s.synced) ? s.synced : null, pendingClear: isNum(s.pendingClear) ? s.pendingClear : null };
  } catch {
    return EMPTY_SYNC_META;
  }
}

export type SyncAction =
  | { type: "none" }
  /** Server dan perangkat ini sama; cukup catat bahwa sudah sinkron. */
  | { type: "mark-synced"; startedAt: number }
  /** Timer dari perangkat lain: pasang di sini (tanpa mengirim balik). */
  | { type: "adopt"; state: RunningTimer }
  /** Dihentikan atau selesai di perangkat lain: kosongkan di sini (tanpa mengirim balik). */
  | { type: "clear-local" }
  /** Timer di sini belum ada di server (atau lebih baru): kirim. */
  | { type: "push"; state: RunningTimer }
  /** Hapus baris di server yang waktu mulainya tidak lebih baru dari `upTo` (sisa lama, atau penghapusan yang tertunda). */
  | { type: "clear-server"; upTo: number }
  /** Penghapusan tertunda sudah tidak perlu (barisnya sudah hilang atau diganti): lupakan. */
  | { type: "reset-pending" };

/**
 * Putuskan apa yang harus dilakukan saat membandingkan timer di perangkat ini (`local`) dengan baris di server (`server`, null = tidak ada).
 * Aturan: yang MULAI lebih baru menang; timer yang sudah pernah ada di server lalu hilang berarti dihentikan atau selesai di perangkat
 * lain; penghapusan yang belum berhasil diulang dulu supaya timer yang sudah dihentikan di sini tidak "hidup lagi" dari server, tetapi
 * tidak pernah menghapus timer yang lebih baru dari yang dihentikan.
 */
export function reconcileTimer(local: TimerState | null, server: RunningTimer | null, meta: SyncMeta, now: number): SyncAction {
  const localRunning = isRunningTimer(local) ? local : null;

  if (meta.pendingClear !== null) {
    if (!server) return { type: "reset-pending" };
    if (server.startedAt <= meta.pendingClear) {
      // Baris itu sisa timer yang sudah dihentikan. Timer baru yang berjalan di sini menggantikannya; selain itu hapus.
      return localRunning && localRunning.startedAt > server.startedAt ? { type: "push", state: localRunning } : { type: "clear-server", upTo: meta.pendingClear };
    }
    // Baris di server lebih baru dari yang kita hentikan: itu timer perangkat lain, perlakukan seperti biasa di bawah.
  }
  // Sisa lama (perangkat lain mati sebelum sempat mencatat dan lewat masa tenggang): bersihkan, jangan dihidupkan lagi.
  if (server && server.endsAt + GRACE_MS < now) return { type: "clear-server", upTo: server.startedAt };

  if (!server) {
    if (!localRunning) return { type: "none" };
    return meta.synced === localRunning.startedAt ? { type: "clear-local" } : { type: "push", state: localRunning };
  }
  if (!localRunning) return { type: "adopt", state: server };
  if (localRunning.startedAt === server.startedAt) return meta.synced === server.startedAt ? { type: "none" } : { type: "mark-synced", startedAt: server.startedAt };
  return server.startedAt > localRunning.startedAt ? { type: "adopt", state: server } : { type: "push", state: localRunning };
}
