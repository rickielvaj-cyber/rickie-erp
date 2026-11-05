import { createClient } from "@/lib/supabase/server";
import { todayISO, formatWeekdayShort, formatDayMonth } from "@/lib/date";
import { POINTS_PER_SESSION, summarizeSessions, wibDate, type Totals } from "@/lib/focus";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { removeFocusSession } from "./actions";

export const metadata = { title: "Focus" };

const hours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)} h`);

function Stat({ title, totals }: { title: string; totals: Totals }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-5 py-4 shadow-card">
      <p className="text-sm text-muted">{title}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-accent">{totals.points}</p>
      <p className="text-sm text-muted">
        points · {totals.sessions} {totals.sessions === 1 ? "session" : "sessions"} · {hours(totals.minutes)}
      </p>
    </div>
  );
}

export default async function FocusPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("id, started_at, minutes, label, points")
    .order("started_at", { ascending: false })
    .limit(5000);

  const rows = data ?? [];
  const today = todayISO();
  const summary = summarizeSessions(rows, today);
  const recent = rows.slice(0, 10);
  const maxDay = Math.max(1, ...summary.days.map((d) => d.sessions));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight">Focus</h1>
      <p className="mt-1 text-base text-muted">
        Pomodoro timer. Finish a focus session to earn {POINTS_PER_SESSION} points; stopping early earns nothing. A finished session also counts if you
        reopen this site within 15 minutes after the timer ended.
      </p>

      <div className="mt-8">
        <FocusTimer sessionsToday={summary.today.sessions} />
      </div>

      {error && <p className="mt-5 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">Failed to load your sessions: {error.message}</p>}

      <section aria-labelledby="focus-stats" className="mt-10">
        <h2 id="focus-stats" className="text-xl font-semibold tracking-tight">
          Points
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Stat title="Today" totals={summary.today} />
          <Stat title="This week" totals={summary.week} />
          <Stat title="All time" totals={summary.total} />
        </div>

        <h3 className="mt-6 text-sm font-medium text-muted">Sessions per day, last 7 days</h3>
        <ol className="mt-2 grid grid-cols-7 gap-2">
          {summary.days.map((d) => (
            <li key={d.date} className="flex flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end rounded-lg bg-surface">
                <div
                  className="w-full rounded-lg bg-accent"
                  style={{ height: `${(d.sessions / maxDay) * 100}%` }}
                  role="img"
                  aria-label={`${formatWeekdayShort(d.date)} ${formatDayMonth(d.date)}: ${d.sessions} ${d.sessions === 1 ? "session" : "sessions"}`}
                />
              </div>
              <span className={`text-xs ${d.date === today ? "font-semibold" : "text-muted"}`}>{formatWeekdayShort(d.date)}</span>
              <span className="text-xs tabular-nums text-muted">{d.sessions}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="focus-recent" className="mt-10">
        <h2 id="focus-recent" className="text-xl font-semibold tracking-tight">
          Recent sessions
        </h2>
        {recent.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 text-center text-base text-subtle">No sessions yet. Start your first focus above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base">{s.label || "Focus session"}</p>
                  <p className="text-sm text-muted">
                    {formatWeekdayShort(wibDate(s.started_at))} {formatDayMonth(wibDate(s.started_at))} · {s.minutes} min
                  </p>
                </div>
                <span className="shrink-0 text-base font-medium tabular-nums">+{s.points}</span>
                <form action={removeFocusSession.bind(null, s.id)}>
                  <ConfirmButton
                    label="Remove"
                    confirmText="Remove this session? Its points are removed too."
                    className="rounded-full border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-danger hover:text-danger"
                  />
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
