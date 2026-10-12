import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { endOfMonthISO, formatDate, formatMonthYear, isYearMonth, todayISO } from "@/lib/date";
import { ISSUE_CATEGORIES, ISSUE_MODULE_SUGGESTIONS, countBy } from "@/lib/issues";
import { kindOf } from "@/lib/clients";
import { sheetSegmentDG, sheetSegmentKL } from "@/lib/sheet";
import type { Client, IssueLog } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyForSheet } from "@/components/CopyForSheet";
import { createIssue, deleteIssue, setIssueCopied, updateIssue } from "./actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SearchParams = {
  client?: string;
  module?: string;
  category?: string;
  month_from?: string;
  month_to?: string;
  new?: string;
  edit?: string;
  error?: string;
};

const field =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";
const filterField =
  "mt-1 rounded-xl border border-border bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none";

function distinct(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim())))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const clientFilter = params.client ?? "all";
  const moduleFilter = params.module ?? "all";
  const categoryFilter = params.category ?? "all";
  const monthFrom = isYearMonth(params.month_from) ? params.month_from : "";
  const monthTo = isYearMonth(params.month_to) ? params.month_to : "";
  const isNew = params.new === "1";
  const editId = UUID_RE.test(params.edit ?? "") ? params.edit! : null;

  const supabase = await createClient();

  let query = supabase.from("issue_log").select("*");
  if (clientFilter === "unlinked") query = query.is("client_id", null);
  else if (clientFilter !== "all") query = query.eq("client_id", clientFilter);
  if (moduleFilter !== "all") query = query.eq("module", moduleFilter);
  if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
  if (monthFrom) query = query.gte("date_resolved", `${monthFrom}-01`);
  if (monthTo) query = query.lte("date_resolved", endOfMonthISO(monthTo));

  const [{ data: allForOptions }, { data: found, error: fetchError }, editResult, clientsResult] = await Promise.all([
    supabase.from("issue_log").select("client_id, client_name, module"),
    query
      .order("date_resolved", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    editId ? supabase.from("issue_log").select("*").eq("id", editId).maybeSingle() : Promise.resolve(null),
    supabase.from("clients").select("*").order("canonical_name", { ascending: true }),
  ]);

  const issues = found ?? [];
  const editingIssue = editResult?.data ?? null;
  const clients: Client[] = clientsResult.data ?? [];
  const clientById = new Map(clients.map((c) => [c.id, c]));
  // Filter: hanya klien yang punya issue; plus pilihan untuk issue lama yang belum tertaut ke daftar.
  const usedClientIds = new Set((allForOptions ?? []).map((r) => r.client_id).filter((v): v is string => Boolean(v)));
  const filterClients = clients.filter((c) => usedClientIds.has(c.id));
  const hasUnlinked = (allForOptions ?? []).some((r) => !r.client_id && r.client_name?.trim());
  const usedModules = distinct((allForOptions ?? []).map((r) => r.module));
  const moduleSuggestions = distinct([...ISSUE_MODULE_SUGGESTIONS, ...usedModules]);

  // Dasar KPI bulanan: hitungan dari hasil yang sedang difilter.
  // Bulan terbaru di atas; baris "No date" (data lama tanpa tanggal) di paling bawah.
  const perMonth = countBy(issues, (i) => i.date_resolved?.slice(0, 7) ?? null, "No date").sort((a, b) => {
    if (isYearMonth(a.label) !== isYearMonth(b.label)) return isYearMonth(a.label) ? -1 : 1;
    return b.label.localeCompare(a.label);
  });
  const perCategory = countBy(issues, (i) => i.category, "No category");
  const perClient = countBy(issues, (i) => i.client_name, "No client");

  const filtered =
    clientFilter !== "all" || moduleFilter !== "all" || categoryFilter !== "all" || monthFrom || monthTo;

  // Tombol Export CSV mengekspor persis yang sedang terfilter (tanpa filter = semua issue).
  const exportQuery = new URLSearchParams();
  if (clientFilter !== "all") exportQuery.set("client", clientFilter);
  if (moduleFilter !== "all") exportQuery.set("module", moduleFilter);
  if (categoryFilter !== "all") exportQuery.set("category", categoryFilter);
  if (monthFrom) exportQuery.set("month_from", monthFrom);
  if (monthTo) exportQuery.set("month_to", monthTo);
  const exportHref = `/api/export/issues${exportQuery.size ? `?${exportQuery}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Issue Log</h1>
          <p className="mt-1 text-base text-muted">Client issue records, replacing the daily sheet.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <a
            href={exportHref}
            download
            className="rounded-full border border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-surface"
          >
            Export CSV{filtered ? " (filtered)" : ""}
          </a>
          {!isNew && !editingIssue && (
            <Link
              href="/issues?new=1"
              className="rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
            >
              + Add issue
            </Link>
          )}
          <Link
            href="/clients"
            className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-foreground hover:text-foreground"
          >
            Add new client
          </Link>
        </div>
      </div>

      {(isNew || editingIssue) && (
        <div className="mt-8">
          <IssueForm
            key={editingIssue?.id ?? "new"}
            issue={editingIssue}
            clients={clients}
            modules={moduleSuggestions}
            error={params.error}
          />
        </div>
      )}

      <form
        method="GET"
        className="mt-8 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4"
      >
        <div>
          <label htmlFor="f-client" className="block text-xs font-medium text-muted">
            Client
          </label>
          <select id="f-client" name="client" defaultValue={clientFilter} className={filterField}>
            <option value="all">All</option>
            {filterClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.canonical_name}
              </option>
            ))}
            {hasUnlinked && <option value="unlinked">(not in client list)</option>}
          </select>
        </div>
        <div>
          <label htmlFor="f-module" className="block text-xs font-medium text-muted">
            Module
          </label>
          <select id="f-module" name="module" defaultValue={moduleFilter} className={filterField}>
            <option value="all">All</option>
            {usedModules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-category" className="block text-xs font-medium text-muted">
            Category
          </label>
          <select id="f-category" name="category" defaultValue={categoryFilter} className={filterField}>
            <option value="all">All</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="block text-xs font-medium text-muted">
            From month
          </label>
          <input id="f-from" type="month" name="month_from" defaultValue={monthFrom} className={filterField} />
        </div>
        <div>
          <label htmlFor="f-to" className="block text-xs font-medium text-muted">
            To month
          </label>
          <input id="f-to" type="month" name="month_to" defaultValue={monthTo} className={filterField} />
        </div>
        <button
          type="submit"
          className="rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-background"
        >
          Apply
        </button>
        {filtered && (
          <Link href="/issues" className="py-1.5 text-sm text-muted underline underline-offset-4 hover:text-foreground">
            Reset
          </Link>
        )}
      </form>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Failed to load data: {fetchError.message}
        </p>
      )}

      <section aria-labelledby="stats-heading" className="mt-6 rounded-2xl border border-foreground p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="stats-heading" className="text-lg font-semibold tracking-tight">
            Summary{filtered ? " (filtered)" : ""}
          </h2>
          <span className="text-sm text-muted">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-muted">No data to count yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-3">
            <CountList
              title="By month"
              rows={perMonth.map((r) => ({
                label: isYearMonth(r.label) ? formatMonthYear(r.label) : r.label,
                count: r.count,
              }))}
            />
            <CountList title="By category" rows={perCategory} />
            <CountList title="By client" rows={perClient} />
          </div>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-foreground">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Module</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Sheet</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatDate(issue.date_resolved)}</td>
                <td className="px-4 py-3">
                  {issue.client_name ?? "-"}
                  {issue.client_name && !issue.client_id && (
                    <span
                      title="Not linked to the client list. Add the client (or an alias), then edit this issue."
                      className="mt-1 block w-fit rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted"
                    >
                      not in list
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{issue.module ?? "-"}</td>
                <td className="px-4 py-3">{issue.category ?? "-"}</td>
                <td className="min-w-[20rem] px-4 py-3">
                  <details className="group">
                    <summary className="cursor-pointer list-none font-medium hover:underline">{issue.title}</summary>
                    <dl className="mt-2 space-y-2 text-muted">
                      <Detail label="Description" value={issue.description} />
                      <Detail label="Root cause" value={issue.root_cause} />
                      <Detail label="Resolution" value={issue.resolution} />
                    </dl>
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <CopyForSheet
                        dg={sheetSegmentDG(issue, (issue.client_id ? clientById.get(issue.client_id)?.canonical_name : null) ?? issue.client_name)}
                        kl={sheetSegmentKL(issue)}
                      />
                      {issue.client_id && clientById.get(issue.client_id)?.verified_in_sheet === false && (
                        <p className="text-xs text-danger">
                          This client is not verified against Sheet1 yet. Check the name before pasting.
                        </p>
                      )}
                      {issue.client_name && !issue.client_id && (
                        <p className="text-xs text-danger">
                          “{issue.client_name}” is not in the client list, so the spelling may not match Sheet1.
                        </p>
                      )}
                    </div>
                  </details>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <form action={setIssueCopied.bind(null, issue.id, !issue.copied_to_sheet_at)}>
                    <button
                      type="submit"
                      title={issue.copied_to_sheet_at ? "Mark as not in the sheet" : "Mark as entered in the sheet"}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        issue.copied_to_sheet_at
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted hover:border-foreground hover:text-foreground"
                      }`}
                    >
                      {issue.copied_to_sheet_at ? "✓ In sheet" : "Not yet"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/issues?edit=${issue.id}`}
                      className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      Edit
                    </Link>
                    <form action={deleteIssue.bind(null, issue.id)}>
                      <ConfirmButton
                        label="Delete"
                        confirmText={`Delete issue "${issue.title}"?`}
                        className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger"
                      />
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {issues.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-base text-muted">
                  {filtered ? "No issues match these filters." : "No issues yet. Click “+ Add issue”."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium uppercase text-muted">{title}</h3>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span className="truncate">{r.label}</span>
            <span className="text-muted">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase">{label}</dt>
      <dd className="whitespace-pre-line text-foreground">{value}</dd>
    </div>
  );
}

function IssueForm({
  issue,
  clients,
  modules,
  error,
}: {
  issue: IssueLog | null;
  clients: Client[];
  modules: string[];
  error?: string;
}) {
  const action = issue ? updateIssue.bind(null, issue.id) : createIssue;
  // Issue lama yang namanya belum cocok dengan daftar klien: teksnya dipertahankan kecuali
  // klien dipilih dari daftar (lihat resolveClient di actions.ts).
  const legacyName = issue && !issue.client_id ? (issue.client_name ?? "") : "";
  // Hanya klien aktif untuk dipilih, kecuali klien yang sudah terpasang di issue ini.
  const selectable = clients.filter((c) => c.active || c.id === issue?.client_id);

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">{issue ? "Edit issue" : "New issue"}</h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <p className="text-sm text-muted">
        Fields below are in the same order as the Issue Tracker sheet. Use <span className="font-medium text-foreground">Copy D–G</span>{" "}
        and <span className="font-medium text-foreground">Copy K–L</span> on the issue after saving.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="client_id" className="block text-sm font-medium">
            Client / partner
          </label>
          <select id="client_id" name="client_id" defaultValue={issue?.client_id ?? ""} className={field}>
            <option value="">{legacyName ? `Keep “${legacyName}” (not in list)` : "Select client or partner"}</option>
            {(["client", "partner"] as const).map((kind) => {
              const group = selectable.filter((c) => kindOf(c) === kind);
              if (group.length === 0) return null;
              return (
                <optgroup key={kind} label={kind === "client" ? "Clients" : "Partners"}>
                  {group.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.canonical_name}
                      {c.verified_in_sheet ? "" : " (not verified)"}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {legacyName && <input type="hidden" name="legacy_client_name" value={legacyName} />}
          <p className="mt-1 text-xs text-muted">
            Not listed?{" "}
            <Link href="/clients" className="underline underline-offset-2 hover:text-foreground">
              Add a client or partner
            </Link>
          </p>
        </div>
        <div>
          <label htmlFor="module" className="block text-sm font-medium">
            Module
          </label>
          <input
            id="module"
            name="module"
            type="text"
            list="module-options"
            autoComplete="off"
            defaultValue={issue?.module ?? ""}
            className={field}
          />
          <datalist id="module-options">
            {modules.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium">
            Issue category
          </label>
          <select id="category" name="category" defaultValue={issue?.category ?? ""} className={field}>
            <option value="">Select category</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Issue description
        </label>
        <textarea id="description" name="description" rows={3} required defaultValue={issue?.description ?? ""} className={field} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="root_cause" className="block text-sm font-medium">
            Root cause
          </label>
          <textarea id="root_cause" name="root_cause" rows={3} defaultValue={issue?.root_cause ?? ""} className={field} />
        </div>
        <div>
          <label htmlFor="resolution" className="block text-sm font-medium">
            Action / Resolution
          </label>
          <textarea id="resolution" name="resolution" rows={3} defaultValue={issue?.resolution ?? ""} className={field} />
        </div>
      </div>

      <fieldset className="rounded-2xl border border-dashed border-border p-4">
        <legend className="px-2 text-xs font-medium uppercase text-muted">Website only (not copied to the sheet)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Short title (optional)
            </label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="Defaults to the start of the description"
              defaultValue={issue?.title}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="date_resolved" className="block text-sm font-medium">
              Date
            </label>
            <input
              id="date_resolved"
              name="date_resolved"
              type="date"
              defaultValue={issue?.date_resolved ?? todayISO()}
              className={field}
            />
          </div>
        </div>
      </fieldset>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Save
        </button>
        <Link
          href="/issues"
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
