import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { endOfMonthISO, formatDateID, formatMonthYearID, isYearMonth, todayISO } from "@/lib/date";
import { ISSUE_CATEGORIES, countBy } from "@/lib/issues";
import type { IssueLog } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createIssue, deleteIssue, updateIssue } from "./actions";

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
  if (clientFilter !== "all") query = query.eq("client_name", clientFilter);
  if (moduleFilter !== "all") query = query.eq("module", moduleFilter);
  if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
  if (monthFrom) query = query.gte("date_resolved", `${monthFrom}-01`);
  if (monthTo) query = query.lte("date_resolved", endOfMonthISO(monthTo));

  const [{ data: allForOptions }, { data: found, error: fetchError }, editResult] = await Promise.all([
    supabase.from("issue_log").select("client_name, module"),
    query
      .order("date_resolved", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    editId ? supabase.from("issue_log").select("*").eq("id", editId).maybeSingle() : Promise.resolve(null),
  ]);

  const issues = found ?? [];
  const editingIssue = editResult?.data ?? null;
  const clientOptions = distinct((allForOptions ?? []).map((r) => r.client_name));
  const moduleOptions = distinct((allForOptions ?? []).map((r) => r.module));

  // Dasar KPI bulanan: hitungan dari hasil yang sedang difilter.
  // Bulan terbaru di atas; baris "Tanpa tanggal" (data lama tanpa tanggal) di paling bawah.
  const perMonth = countBy(issues, (i) => i.date_resolved?.slice(0, 7) ?? null, "Tanpa tanggal").sort((a, b) => {
    if (isYearMonth(a.label) !== isYearMonth(b.label)) return isYearMonth(a.label) ? -1 : 1;
    return b.label.localeCompare(a.label);
  });
  const perCategory = countBy(issues, (i) => i.category, "Tanpa kategori");
  const perClient = countBy(issues, (i) => i.client_name, "Tanpa klien");

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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Issue Log</h1>
          <p className="mt-1 text-base text-muted">Catatan issue klien, pengganti sheet harian.</p>
        </div>
        {!isNew && !editingIssue && (
          <Link
            href="/issues?new=1"
            className="shrink-0 rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
          >
            + Tambah issue
          </Link>
        )}
      </div>

      {(isNew || editingIssue) && (
        <div className="mt-8">
          <IssueForm
            key={editingIssue?.id ?? "new"}
            issue={editingIssue}
            clients={clientOptions}
            modules={moduleOptions}
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
            Klien
          </label>
          <select id="f-client" name="client" defaultValue={clientFilter} className={filterField}>
            <option value="all">Semua</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-module" className="block text-xs font-medium text-muted">
            Modul
          </label>
          <select id="f-module" name="module" defaultValue={moduleFilter} className={filterField}>
            <option value="all">Semua</option>
            {moduleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-category" className="block text-xs font-medium text-muted">
            Kategori
          </label>
          <select id="f-category" name="category" defaultValue={categoryFilter} className={filterField}>
            <option value="all">Semua</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-from" className="block text-xs font-medium text-muted">
            Dari bulan
          </label>
          <input id="f-from" type="month" name="month_from" defaultValue={monthFrom} className={filterField} />
        </div>
        <div>
          <label htmlFor="f-to" className="block text-xs font-medium text-muted">
            Sampai bulan
          </label>
          <input id="f-to" type="month" name="month_to" defaultValue={monthTo} className={filterField} />
        </div>
        <button
          type="submit"
          className="rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-background"
        >
          Terapkan
        </button>
        {filtered && (
          <Link href="/issues" className="py-1.5 text-sm text-muted underline underline-offset-4 hover:text-foreground">
            Reset
          </Link>
        )}
        <a
          href={exportHref}
          download
          className="ml-auto rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-background"
        >
          Export CSV{filtered ? " (sesuai filter)" : ""}
        </a>
      </form>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Gagal memuat data: {fetchError.message}
        </p>
      )}

      <section aria-labelledby="stats-heading" className="mt-6 rounded-2xl border border-foreground p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="stats-heading" className="text-lg font-semibold tracking-tight">
            Ringkasan{filtered ? " (sesuai filter)" : ""}
          </h2>
          <span className="text-sm text-muted">{issues.length} issue</span>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-muted">Belum ada data untuk dihitung.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-3">
            <CountList
              title="Per bulan"
              rows={perMonth.map((r) => ({
                label: isYearMonth(r.label) ? formatMonthYearID(r.label) : r.label,
                count: r.count,
              }))}
            />
            <CountList title="Per kategori" rows={perCategory} />
            <CountList title="Per klien" rows={perClient} />
          </div>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-foreground">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Tanggal</th>
              <th className="px-4 py-2.5 font-medium">Klien</th>
              <th className="px-4 py-2.5 font-medium">Modul</th>
              <th className="px-4 py-2.5 font-medium">Kategori</th>
              <th className="px-4 py-2.5 font-medium">Judul</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatDateID(issue.date_resolved)}</td>
                <td className="px-4 py-3">{issue.client_name ?? "-"}</td>
                <td className="px-4 py-3">{issue.module ?? "-"}</td>
                <td className="px-4 py-3">{issue.category ?? "-"}</td>
                <td className="px-4 py-3">
                  <details className="group">
                    <summary className="cursor-pointer list-none font-medium hover:underline">{issue.title}</summary>
                    <dl className="mt-2 space-y-2 text-muted">
                      <Detail label="Deskripsi" value={issue.description} />
                      <Detail label="Akar masalah" value={issue.root_cause} />
                      <Detail label="Resolusi" value={issue.resolution} />
                    </dl>
                  </details>
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
                        label="Hapus"
                        confirmText={`Hapus issue "${issue.title}"?`}
                        className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger"
                      />
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {issues.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-base text-muted">
                  {filtered ? "Tidak ada issue yang cocok dengan filter ini." : "Belum ada issue. Klik “+ Tambah issue”."}
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
  clients: string[];
  modules: string[];
  error?: string;
}) {
  const action = issue ? updateIssue.bind(null, issue.id) : createIssue;

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">{issue ? "Edit issue" : "Issue baru"}</h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Judul
        </label>
        <input id="title" name="title" type="text" required defaultValue={issue?.title} className={field} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="date_resolved" className="block text-sm font-medium">
            Tanggal
          </label>
          <input
            id="date_resolved"
            name="date_resolved"
            type="date"
            defaultValue={issue?.date_resolved ?? todayISO()}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="client_name" className="block text-sm font-medium">
            Klien
          </label>
          <input
            id="client_name"
            name="client_name"
            type="text"
            list="client-options"
            autoComplete="off"
            defaultValue={issue?.client_name ?? ""}
            className={field}
          />
          <datalist id="client-options">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="module" className="block text-sm font-medium">
            Modul
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
            Kategori
          </label>
          <select id="category" name="category" defaultValue={issue?.category ?? ""} className={field}>
            <option value="">Pilih kategori</option>
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
          Deskripsi
        </label>
        <textarea id="description" name="description" rows={3} required defaultValue={issue?.description ?? ""} className={field} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="root_cause" className="block text-sm font-medium">
            Akar masalah
          </label>
          <textarea id="root_cause" name="root_cause" rows={3} defaultValue={issue?.root_cause ?? ""} className={field} />
        </div>
        <div>
          <label htmlFor="resolution" className="block text-sm font-medium">
            Resolusi
          </label>
          <textarea id="resolution" name="resolution" rows={3} defaultValue={issue?.resolution ?? ""} className={field} />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Simpan
        </button>
        <Link
          href="/issues"
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
