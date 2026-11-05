import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/date";
import { hasEmbeddingKey } from "@/lib/search/gemini";
import { SOURCE_LABEL, SOURCE_TYPES } from "@/lib/search/types";
import { ReindexForm } from "@/components/ReindexForm";
import { CalendarSourcesForm } from "@/components/CalendarSourcesForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { removeCalendarSource } from "./calendar-sources-actions";
import { MAX_EXTRA_CALENDARS } from "@/lib/google/calendar-sources";

export const metadata = { title: "Settings" };
// Reindex memanggil layanan embedding untuk ratusan teks; beri waktu lebih dari default.
export const maxDuration = 60;

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_index")
    .select("source_type, source_id, updated_at")
    .order("updated_at", { ascending: false })
    .range(0, 4999);

  const rows = data ?? [];
  // Konten panjang punya beberapa baris (potongan); hitung per konten.
  const seen = new Map<string, Set<string>>();
  for (const r of rows) seen.set(r.source_type, (seen.get(r.source_type) ?? new Set()).add(r.source_id));
  const counts = new Map(Array.from(seen, ([type, ids]) => [type, ids.size]));
  const last = rows[0]?.updated_at;
  const keySet = hasEmbeddingKey();
  const { data: calendars } = await supabase.from("calendar_sources").select("id, calendar_id, label").order("created_at", { ascending: true });
  const extraCalendars = calendars ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold tracking-tight">Settings</h1>

      <section aria-labelledby="calendars-heading" className="mt-10 rounded-3xl border border-border bg-background p-6 shadow-card">
        <h2 id="calendars-heading" className="text-xl font-semibold tracking-tight">
          Other calendars
        </h2>
        <p className="mt-1 text-sm text-muted">
          Show events from up to {MAX_EXTRA_CALENDARS} more Google calendars (for example an office or project calendar) next to your main one on the
          week and month views. They are read-only and dashed; the site never edits them, never links to-dos to them, and never stores their
          events. Your Google account must already have access to the calendar. Find its ID in Google Calendar: Settings → pick the
          calendar → <em>Integrate calendar</em> → <em>Calendar ID</em>. Connect Google Calendar first under To-Do → Calendar.
        </p>

        {extraCalendars.length > 0 && (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
            {extraCalendars.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium">{c.label || c.calendar_id}</p>
                  <p className="truncate text-sm text-muted">{c.calendar_id}</p>
                </div>
                <form action={removeCalendarSource.bind(null, c.id)}>
                  <ConfirmButton
                    label="Remove"
                    confirmText={`Stop showing “${c.label || c.calendar_id}”? Nothing is deleted in Google.`}
                    className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-danger hover:text-danger"
                  />
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5">
          <CalendarSourcesForm full={extraCalendars.length >= MAX_EXTRA_CALENDARS} />
        </div>
      </section>

      <section aria-labelledby="search-heading" className="mt-10 rounded-3xl border border-border bg-background p-6 shadow-card">
        <h2 id="search-heading" className="text-xl font-semibold tracking-tight">
          Search index
        </h2>
        <p className="mt-1 text-sm text-muted">
          Search finds Knowledge Base entries, projects, and goals by meaning, using Google Gemini embeddings. Issues, notes,
          clients, and partners are indexed for exact-word search only and are never sent to Google, because they contain client names. New or
          edited content is indexed right after you save it; a daily job and the button below catch up anything that was missed. The free embedding quota is
          small, so the first run may stop early — if it says items are still waiting, press the button again after a
          minute.
        </p>

        {error && <p className="mt-4 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">{error.message}</p>}
        {!keySet && (
          <p className="mt-4 rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
            <code>GEMINI_API_KEY</code> is not set on the server, so meaning-based search is off. See the README.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SOURCE_TYPES.map((type) => (
            <div key={type} className="rounded-2xl border border-border bg-background px-4 py-3">
              <dt className="text-xs text-muted">{SOURCE_LABEL[type]}</dt>
              <dd className="text-2xl font-semibold">{counts.get(type) ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">
          {last ? `Last indexed ${formatDate(last.slice(0, 10))}.` : "Nothing indexed yet."}
        </p>

        <div className="mt-5">
          <ReindexForm />
        </div>
      </section>
    </div>
  );
}
