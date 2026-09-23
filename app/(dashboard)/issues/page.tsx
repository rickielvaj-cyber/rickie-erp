import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateID } from "@/lib/date";
import type { IssueLog } from "@/lib/types";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createIssue, deleteIssue, updateIssue } from "./actions";

type SearchParams = {
  client?: string;
  category?: string;
  month_from?: string;
  month_to?: string;
  new?: string;
  edit?: string;
  error?: string;
};

function endOfMonthISO(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yyyyMm}-${String(lastDay).padStart(2, "0")}`;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const clientFilter = params.client ?? "all";
  const categoryFilter = params.category ?? "all";
  const monthFrom = params.month_from ?? "";
  const monthTo = params.month_to ?? "";
  const isNew = params.new === "1";
  const editId = params.edit ?? null;

  const supabase = await createClient();

  let query = supabase.from("issue_log").select("*");
  if (clientFilter !== "all") query = query.eq("client_name", clientFilter);
  if (categoryFilter !== "all") query = query.eq("category", categoryFilter);
  if (monthFrom) query = query.gte("date_resolved", `${monthFrom}-01`);
  if (monthTo) query = query.lte("date_resolved", endOfMonthISO(monthTo));

  const [{ data: allForFilters }, { data: issues, error: fetchError }] = await Promise.all([
    supabase.from("issue_log").select("client_name, category"),
    query.order("date_resolved", { ascending: false, nullsFirst: false }),
  ]);

  const clientOptions = Array.from(
    new Set((allForFilters ?? []).map((r) => r.client_name).filter((v): v is string => Boolean(v))),
  ).sort();
  const categoryOptions = Array.from(
    new Set((allForFilters ?? []).map((r) => r.category).filter((v): v is string => Boolean(v))),
  ).sort();

  const editingIssue = editId ? (issues ?? []).find((i) => i.id === editId) ?? null : null;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-red">Issue Log</h1>
        {!isNew && !editingIssue && (
          <Link
            href="/issues?new=1"
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-red-dark"
          >
            + Tambah Issue
          </Link>
        )}
      </div>

      {(isNew || editingIssue) && (
        <IssueForm key={editingIssue?.id ?? "new"} issue={editingIssue} error={params.error} />
      )}

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-4">
        <div>
          <label className="block text-xs font-medium text-muted">Klien</label>
          <select name="client" defaultValue={clientFilter} className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm">
            <option value="all">Semua</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">Kategori</label>
          <select name="category" defaultValue={categoryFilter} className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm">
            <option value="all">Semua</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">Dari Bulan</label>
          <input type="month" name="month_from" defaultValue={monthFrom} className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted">Sampai Bulan</label>
          <input type="month" name="month_to" defaultValue={monthTo} className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md border border-border px-4 py-1.5 text-sm font-medium hover:border-brand-red hover:text-brand-red">
          Terapkan Filter
        </button>
        {(clientFilter !== "all" || categoryFilter !== "all" || monthFrom || monthTo) && (
          <Link href="/issues" className="text-sm text-muted underline">
            Reset
          </Link>
        )}
      </form>

      {fetchError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">
          Gagal memuat data: {fetchError.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2">Tanggal Selesai</th>
              <th className="px-4 py-2">Klien</th>
              <th className="px-4 py-2">Kategori</th>
              <th className="px-4 py-2">Judul</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {(issues ?? []).map((issue) => (
              <tr key={issue.id} className="border-t border-border">
                <td className="px-4 py-2 whitespace-nowrap">{formatDateID(issue.date_resolved)}</td>
                <td className="px-4 py-2">{issue.client_name ?? "-"}</td>
                <td className="px-4 py-2">{issue.category ?? "-"}</td>
                <td className="px-4 py-2">{issue.title}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/issues?edit=${issue.id}`}
                      className="rounded-md border border-border px-3 py-1 text-xs hover:border-brand-red hover:text-brand-red"
                    >
                      Edit
                    </Link>
                    <form action={deleteIssue.bind(null, issue.id)}>
                      <ConfirmButton
                        label="Hapus"
                        confirmText={`Hapus issue "${issue.title}"?`}
                        className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:border-brand-red hover:text-brand-red"
                      />
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {issues && issues.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                  Belum ada issue yang cocok dengan filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueForm({ issue, error }: { issue: IssueLog | null; error?: string }) {
  const action = issue ? updateIssue.bind(null, issue.id) : createIssue;

  return (
    <form action={action} className="mb-6 space-y-4 rounded-md border border-border bg-surface p-5">
      <h2 className="font-medium">{issue ? "Edit Issue" : "Tambah Issue Baru"}</h2>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">{error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Judul
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={issue?.title}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="client_name" className="block text-sm font-medium">
            Klien
          </label>
          <input
            id="client_name"
            name="client_name"
            type="text"
            defaultValue={issue?.client_name ?? ""}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium">
            Kategori
          </label>
          <input
            id="category"
            name="category"
            type="text"
            defaultValue={issue?.category ?? ""}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="date_resolved" className="block text-sm font-medium">
            Tanggal Selesai
          </label>
          <input
            id="date_resolved"
            name="date_resolved"
            type="date"
            defaultValue={issue?.date_resolved ?? ""}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Deskripsi
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          required
          defaultValue={issue?.description ?? ""}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="resolution" className="block text-sm font-medium">
          Resolusi
        </label>
        <textarea
          id="resolution"
          name="resolution"
          rows={3}
          defaultValue={issue?.resolution ?? ""}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
        >
          Simpan
        </button>
        <Link
          href="/issues"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
