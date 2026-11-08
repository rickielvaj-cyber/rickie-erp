import Link from "next/link";
import { addDaysISO, formatDayMonth } from "@/lib/date";
import { listWeekEvents } from "@/lib/google/calendar";
import { loadExtraEvents } from "@/lib/google/extra-calendars";
import { mergeExtraEvents } from "@/lib/google/calendar-sources";
import { initialScrollHour, layoutWeek, type DayLayout } from "@/lib/google/layout";
import { CalendarGrid, type LinkOption, type Prefill } from "@/components/CalendarGrid";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { createClient } from "@/lib/supabase/server";
import { syncLinkedTodos } from "@/lib/google/sync-todos";
import { GoogleAuthError, googleConfigured } from "@/lib/google/oauth";
import { getAccessToken, isConnected } from "@/lib/google/store";
import { after } from "next/server";
import { cachedSWR } from "@/lib/google/cache";
import { disconnectGoogleCalendar } from "@/app/(dashboard)/todos/calendar-actions";

const NOTICE: Record<string, string> = {
  connected: "Google Calendar connected.",
  disconnected: "Google Calendar disconnected.",
  denied: "Google access was not granted, so nothing was connected.",
  failed: "Could not connect Google Calendar. Please try again.",
  unconfigured: "Google Calendar is not set up on the server yet.",
};

function Shell({ notice, weekStart, children }: { notice?: string; weekStart: string; children: React.ReactNode }) {
  return (
    <section id="calendar" aria-labelledby="calendar-heading" className="mt-16 scroll-mt-24 border-t border-border pt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="calendar-heading" className="text-3xl font-semibold tracking-tight">
          Calendar
        </h2>
        <Link href={`/todos/month?month=${weekStart.slice(0, 7)}`} className="rounded-full border border-border-strong px-4 py-1.5 text-sm hover:bg-surface">
          Month view
        </Link>
      </div>
      {notice && NOTICE[notice] && (
        <p className="mt-4 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">{NOTICE[notice]}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border p-6 text-base text-muted">{children}</p>;
}

function ConnectButton({ label }: { label: string }) {
  return (
    <a href="/api/google/connect" className="inline-block rounded-full bg-accent px-6 py-2.5 text-base font-medium text-white transition-colors hover:bg-accent-hover">
      {label}
    </a>
  );
}

type CalendarState =
  | { kind: "unconfigured" }
  | { kind: "disconnected" }
  | { kind: "reconnect" }
  | { kind: "error"; message: string }
  | { kind: "ready"; days: DayLayout[]; changed: number; extraCount: number; notes: string[] };

/** Semua pemanggilan jaringan/database ada di sini (dengan try/catch); JSX dirender di luar. */
const STATE_TTL_MS = 20_000;
const STATE_MAX_STALE_MS = 60_000;
const stateKey = (userId: string, weekStart: string) => `${userId}|state|${weekStart}`;

/**
 * Tampilan kalender satu minggu. Setiap klik di To-Do merender ulang halaman, dan tanpa cache tiap klik memanggil Google lagi
 * (acara, kalender lain, sinkron) sehingga terasa lambat. Maka: hasil yang masih segar (20 detik) dipakai langsung; yang lebih tua
 * (sampai 60 detik; polling halaman tiap 20 detik menjaganya tetap muda selama dipakai) tetap dipakai SAAT ITU JUGA dan disegarkan di belakang layar setelah respons terkirim (`after`), jadi klik tidak
 * menunggu Google. Menulis acara dari situs mengosongkan cache ini (bustCalendar), Setelah diam lebih dari semenit, halaman yang dibuka menunggu data segar dari Google (tidak menampilkan kalender lama).
 */
async function loadState(userId: string, weekStart: string): Promise<CalendarState> {
  const db = await createClient(); // dibuat sekarang: cookie tidak bisa dibaca di dalam after()
  let changed = 0;
  let loadedHere = false;
  const load = async (): Promise<CalendarState> => {
    loadedHere = true;
    const state = await loadStateUncached(userId, weekStart, db);
    // `changed` hanya berarti bagi yang memuatnya; salinan di cache dinolkan agar tidak memicu muat ulang berulang.
    if (state.kind === "ready") {
      changed = state.changed;
      return { ...state, changed: 0 };
    }
    return state;
  };
  const value = await cachedSWR(stateKey(userId, weekStart), STATE_TTL_MS, STATE_MAX_STALE_MS, load, (task) => after(task));
  return loadedHere && value.kind === "ready" ? { ...value, changed } : value;
}

async function loadStateUncached(userId: string, weekStart: string, db: Awaited<ReturnType<typeof createClient>>): Promise<CalendarState> {
  if (!googleConfigured()) return { kind: "unconfigured" };
  try {
    if (!(await isConnected(userId))) return { kind: "disconnected" };
    const token = await getAccessToken(userId);
    if (!token) return { kind: "reconnect" };
    const events = await listWeekEvents(token, weekStart);
    // To-do yang tertaut mengikuti acaranya (digeser/dihapus di Google). Gagal di sini tidak menggagalkan tampilan kalender.
    const changed = await syncLinkedTodos(db, token, events).catch(() => 0);
    // Kalender tambahan (hanya baca): ikut tampil di grid, tetapi TIDAK ikut sinkron ke to-do (di atas hanya acara kalender utama).
    const { extras, notes } = await loadExtraEvents(db, token, weekStart, addDaysISO(weekStart, 7)).catch(() => ({ extras: [], notes: [] as string[] }));
    return { kind: "ready", days: layoutWeek(mergeExtraEvents(events, extras), weekStart), changed, extraCount: extras.length, notes };
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reconnect) return { kind: "reconnect" };
    return { kind: "error", message: error instanceof Error ? error.message : "unknown error" };
  }
}

/**
 * Kalender Google minggu yang dipilih (sama dengan minggu To-Do) dengan time blocking (klik/seret untuk membuat, klik
 * blok untuk mengubah atau menghapus; lihat CalendarGrid). Acara diambil langsung dari Google tiap halaman dibuka dan tidak disimpan. Kegagalan (belum diatur, token dicabut, Google error) tampil
 * sebagai pesan di bagian ini; sisa halaman To-Do tidak terpengaruh.
 */
export async function CalendarSection({
  userId,
  weekStart,
  today,
  notice,
  linkable = [],
  linkedTitles = {},
  prefill = null,
  closeHref,
}: {
  userId: string;
  weekStart: string;
  today: string;
  notice?: string;
  linkable?: LinkOption[];
  linkedTitles?: Record<string, string>;
  prefill?: Prefill | null;
  closeHref: string;
}) {
  const state = await loadState(userId, weekStart);

  if (state.kind === "unconfigured") {
    return (
      <Shell notice={notice} weekStart={weekStart}>
        <Hint>
          Google Calendar is not set up on the server yet. Add <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and{" "}
          <code>GOOGLE_TOKEN_SECRET</code> in Vercel (see the README), then come back here to connect.
        </Hint>
      </Shell>
    );
  }
  if (state.kind === "disconnected") {
    return (
      <Shell notice={notice} weekStart={weekStart}>
        <p className="mb-4 text-base text-muted">
          Connect your Google account to see your calendar for the week next to your to-dos. The site only reads and writes calendar events
          (never email or files), and events are not stored here.
        </p>
        <ConnectButton label="Connect Google Calendar" />
      </Shell>
    );
  }
  if (state.kind === "reconnect") {
    return (
      <Shell notice={notice} weekStart={weekStart}>
        <p className="mb-4 text-base text-muted">Google access has expired or was removed. Connect again to continue.</p>
        <ConnectButton label="Reconnect Google Calendar" />
      </Shell>
    );
  }
  if (state.kind === "error") {
    return (
      <Shell notice={notice} weekStart={weekStart}>
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          Could not load the calendar right now ({state.message}). The rest of the page is unaffected.
        </p>
      </Shell>
    );
  }

  const count = state.days.reduce((n, d) => n + d.allDay.length + d.blocks.length, 0);
  return (
    <Shell notice={notice} weekStart={weekStart}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted">
          {formatDayMonth(weekStart)} – {formatDayMonth(addDaysISO(weekStart, 6))} · {count} {count === 1 ? "event" : "events"} · primary calendar
          {state.extraCount > 0 ? ` + ${state.extraCount} other (read-only)` : ""}
        </p>
        <form action={disconnectGoogleCalendar}>
          <button type="submit" className="rounded-full border border-border-strong px-4 py-1.5 text-sm hover:bg-surface">
            Disconnect
          </button>
        </form>
      </div>
      {state.notes.map((n) => (
        <p key={n} role="status" className="mb-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm">
          {n}
        </p>
      ))}
      <CalendarGrid
        key={prefill?.todoId ?? "none"}
        days={state.days}
        today={today}
        startHour={0}
        endHour={24}
        scrollHour={initialScrollHour(state.days)}
        linkable={linkable}
        linkedTitles={linkedTitles}
        prefill={prefill}
        closeHref={closeHref}
      />
      {state.changed > 0 && <RefreshOnMount />}
    </Shell>
  );
}

export function CalendarSkeleton() {
  return (
    <section id="calendar" className="mt-16 border-t border-border pt-12" aria-busy="true">
      <h2 className="text-3xl font-semibold tracking-tight">Calendar</h2>
      <div className="mt-4 h-72 animate-pulse rounded-2xl bg-surface" />
    </section>
  );
}
