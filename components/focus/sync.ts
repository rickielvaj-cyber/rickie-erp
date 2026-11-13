"use client";

import { pullTimer, pushTimer, clearTimer } from "@/app/(dashboard)/focus/timer-actions";
import { reconcileTimer } from "@/lib/focus-sync";
import { readSyncMeta, readTimerLocal, writeSyncMeta, writeTimerLocal } from "@/components/focus/store";

/**
 * Satu putaran pencocokan timer perangkat ini dengan server (lihat reconcileTimer untuk aturannya). Dipanggil berkala oleh FocusSync.
 * Perubahan dari perangkat lain ditulis HANYA ke localStorage (writeTimerLocal) supaya tidak dikirim balik. Tidak melempar galat.
 */
export async function runSyncOnce(): Promise<void> {
  try {
    const pulled = await pullTimer();
    if (!pulled.available) {
      // Tabel belum ada atau tidak terjangkau: jangan menumpuk penghapusan tertunda yang tidak akan berhasil.
      writeSyncMeta({ synced: null, pendingClear: null });
      return;
    }
    // Baca ulang setelah menunggu server: pengguna mungkin menekan Stop/Start selama permintaan berjalan.
    const local = readTimerLocal();
    const meta = readSyncMeta();
    const action = reconcileTimer(local, pulled.state, meta, Date.now());
    switch (action.type) {
      case "none":
        return;
      case "mark-synced":
        writeSyncMeta({ ...meta, synced: action.startedAt });
        return;
      case "adopt":
        writeTimerLocal(action.state);
        writeSyncMeta({ synced: action.state.startedAt, pendingClear: meta.pendingClear !== null && meta.pendingClear >= action.state.startedAt ? meta.pendingClear : null });
        return;
      case "clear-local":
        writeTimerLocal(null);
        writeSyncMeta({ synced: null, pendingClear: meta.pendingClear });
        return;
      case "push": {
        const r = await pushTimer(action.state);
        if (r.ok) writeSyncMeta({ synced: action.state.startedAt, pendingClear: null });
        return;
      }
      case "clear-server": {
        const r = await clearTimer(action.upTo);
        if (r.ok) writeSyncMeta({ synced: null, pendingClear: null });
        return;
      }
      case "reset-pending":
        writeSyncMeta({ ...meta, pendingClear: null });
        return;
    }
  } catch {
    /* jaringan putus atau server galat: coba lagi di putaran berikutnya */
  }
}
