import { addDaysISO, formatDayMonth } from "@/lib/date";
import { listWeekEvents } from "@/lib/google/calendar";
import { layoutWeek, visibleHours, type DayLayout } from "@/lib/google/layout";
import { CalendarGrid } from "@/components/CalendarGrid";
import { GoogleAuthError, googleConfigured } from "@/lib/google/oauth";
import { getAccessToken, isConnected } from "@/lib/google/store";
import { disconnectGoogleCalendar } from "@/app/(dashboard)/todos/calendar-actions";

const NOTICE: Record<string, string> = {
  connected: "Google Calendar connected.",
  disconnected: "Google Calendar disconnected.",
  denied: "Google access was not granted, so nothing was connected.",
  failed: "Could not connect Google Calendar. Please try again.",
  unconfigured: "Google Calendar is not set up on the server yet.",
};

function Shell({ notice, children }: { notice?: string; children: React.ReactNode }) {
  return (
    <section id="calendar" aria-labelledby="calendar-heading" className="mt-16 scroll-mt-24 border-t border-foreground pt-12">
      <h2 id="calendar-heading" className="text-3xl font-semibold tracking-tight">
        Calendar
      </h2>
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
  | { kind: "ready"; days: DayLayout[] };

/** Semua pemanggilan jaringan/database ada di sini (dengan try/catch); JSX dirender di luar. */
async function loadState(userId: string, weekStart: string): Promise<CalendarState> {
  if (!googleConfigured()) return { kind: "unconfigured" };
  try {
    if (!(await isConnected(userId))) return { kind: "disconnected" };
    const token = await getAccessToken(userId);
    if (!token) return { kind: "reconnect" };
    return { kind: "ready", days: layoutWeek(await listWeekEvents(token, weekStart), weekStart) };
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
  suggestions = [],
}: {
  userId: string;
  weekStart: string;
  today: string;
  notice?: string;
  suggestions?: string[];
}) {
  const state = await loadState(userId, weekStart);

  if (state.kind === "unconfigured") {
    return (
      <Shell notice={notice}>
        <Hint>
          Google Calendar is not set up on the server yet. Add <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and{" "}
          <code>GOOGLE_TOKEN_SECRET</code> in Vercel (see the README), then come back here to connect.
        </Hint>
      </Shell>
    );
  }
  if (state.kind === "disconnected") {
    return (
      <Shell notice={notice}>
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
      <Shell notice={notice}>
        <p className="mb-4 text-base text-muted">Google access has expired or was removed. Connect again to continue.</p>
        <ConnectButton label="Reconnect Google Calendar" />
      </Shell>
    );
  }
  if (state.kind === "error") {
    return (
      <Shell notice={notice}>
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Could not load the calendar right now ({state.message}). The rest of the page is unaffected.
        </p>
      </Shell>
    );
  }

  const hourRange = visibleHours(state.days);
  const count = state.days.reduce((n, d) => n + d.allDay.length + d.blocks.length, 0);
  return (
    <Shell notice={notice}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted">
          {formatDayMonth(weekStart)} – {formatDayMonth(addDaysISO(weekStart, 6))} · {count} {count === 1 ? "event" : "events"} · primary calendar
        </p>
        <form action={disconnectGoogleCalendar}>
          <button type="submit" className="rounded-full border border-foreground px-4 py-1.5 text-sm hover:bg-surface">
            Disconnect
          </button>
        </form>
      </div>
      <CalendarGrid days={state.days} today={today} startHour={hourRange.start} endHour={hourRange.end} suggestions={suggestions} />
    </Shell>
  );
}

export function CalendarSkeleton() {
  return (
    <section id="calendar" className="mt-16 border-t border-foreground pt-12" aria-busy="true">
      <h2 className="text-3xl font-semibold tracking-tight">Calendar</h2>
      <div className="mt-4 h-72 animate-pulse rounded-2xl bg-surface" />
    </section>
  );
}
