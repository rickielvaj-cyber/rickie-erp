import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { kindOf } from "@/lib/clients";
import type { Client } from "@/lib/types";
import { returnLabel, safeReturnPath } from "@/lib/return-to";
import { addClient, setClientActive, setClientVerified, updateClient } from "./actions";

type SearchParams = { edit?: string; error?: string; show?: string; from?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field =
  "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const showInactive = params.show === "all";
  const editId = UUID_RE.test(params.edit ?? "") ? params.edit! : null;
  // Dibuka dari halaman lain (mis. form Proyek baru): tombol kembali dan hasil simpan menuju ke sana.
  const from = safeReturnPath(params.from);

  const supabase = await createClient();
  const [clientsResult, issuesResult] = await Promise.all([
    supabase.from("clients").select("*").order("canonical_name", { ascending: true }),
    supabase.from("issue_log").select("client_id, client_name"),
  ]);

  const all: Client[] = clientsResult.data ?? [];
  const clients = showInactive ? all : all.filter((c) => c.active);
  const fetchError = clientsResult.error ?? issuesResult.error;

  const issueCount = new Map<string, number>();
  const unlinked = new Map<string, number>();
  for (const row of issuesResult.data ?? []) {
    if (row.client_id) issueCount.set(row.client_id, (issueCount.get(row.client_id) ?? 0) + 1);
    else if (row.client_name?.trim()) unlinked.set(row.client_name.trim(), (unlinked.get(row.client_name.trim()) ?? 0) + 1);
  }
  const unverifiedCount = all.filter((c) => c.active && !c.verified_in_sheet).length;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-base text-muted">
            Clients must match <span className="font-medium text-foreground">Customer Name</span> in the Issue Tracker
            sheet exactly, and partners must match how you type them in its Client column, so per-client KPIs are not split.
          </p>
        </div>
        {from && (
          <Link
            href={from}
            className="shrink-0 rounded-full border border-foreground px-4 py-2 text-base font-medium transition-colors hover:bg-surface"
          >
            ‹ {returnLabel(from)}
          </Link>
        )}
      </div>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Failed to load data: {fetchError.message}
        </p>
      )}

      <section aria-labelledby="add-heading" className="mt-8">
        <ClientForm
          key={editId ?? "new"}
          client={editId ? (all.find((c) => c.id === editId) ?? null) : null}
          error={params.error}
          from={from}
        />
      </section>

      {unverifiedCount > 0 && (
        <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          {unverifiedCount} {unverifiedCount === 1 ? "name is" : "names are"} not verified against the sheet yet. Check the exact
          spelling (for clients: Sheet1, or confirm with Willy), fix it with Edit if needed, then tick{" "}
          <span className="font-medium text-foreground">Verified</span>.
        </p>
      )}

      <div className="mt-6 flex items-center justify-end text-sm">
        <Link
          href={showInactive ? "/clients" : "/clients?show=all"}
          className="text-muted underline underline-offset-4 hover:text-foreground"
        >
          {showInactive ? "Hide inactive" : "Show inactive"}
        </Link>
      </div>

      {(["client", "partner"] as const).map((kind) => {
        const rows = clients.filter((c) => kindOf(c) === kind);
        return (
          <section key={kind} aria-labelledby={`${kind}-heading`} className="mt-3 first-of-type:mt-0">
            <h2 id={`${kind}-heading`} className="mb-2 mt-6 flex items-baseline gap-2 text-lg font-semibold tracking-tight">
              {kind === "client" ? "Clients" : "Partners"}
              <span className="text-sm font-normal text-muted">{rows.length}</span>
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-foreground">
              {rows.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  count={issueCount.get(client.id) ?? 0}
                  showInactive={showInactive}
                />
              ))}
              {rows.length === 0 && (
                <li className="px-5 py-6 text-center text-base text-muted">
                  {kind === "client" ? "No clients yet." : "No partners yet."}
                </li>
              )}
            </ul>
          </section>
        );
      })}

      {unlinked.size > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Issue names not in the client list</h2>
          <p className="mt-1 text-sm text-muted">
            These old issues keep their text, but are not linked to a client. Add the matching client (or add the old
            spelling as an alias of an existing one), then edit the issue to pick it.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {Array.from(unlinked.entries()).map(([name, count]) => (
              <li key={name} className="flex justify-between gap-3 rounded-lg border border-border px-4 py-2">
                <span>{name}</span>
                <span className="text-muted">
                  {count} {count === 1 ? "issue" : "issues"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ClientRow({ client, count, showInactive }: { client: Client; count: number; showInactive: boolean }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1 basis-60">
        <p className={`text-base font-medium ${client.active ? "" : "text-muted line-through"}`}>{client.canonical_name}</p>
        {client.aliases.length > 0 && (
          <p className="mt-0.5 text-sm text-muted">Also known as: {client.aliases.join(", ")}</p>
        )}
        <p className="mt-0.5 text-xs text-muted">
          {count} {count === 1 ? "issue" : "issues"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <form action={setClientVerified.bind(null, client.id, !client.verified_in_sheet)}>
          <button
            type="submit"
            title={client.verified_in_sheet ? "Mark as not verified" : "Mark as verified against the sheet"}
            className={`rounded-full border px-3 py-1 transition-colors ${
              client.verified_in_sheet
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted hover:border-foreground hover:text-foreground"
            }`}
          >
            {client.verified_in_sheet ? "✓ Verified" : "Not verified"}
          </button>
        </form>
        <Link
          href={`/clients?edit=${client.id}${showInactive ? "&show=all" : ""}`}
          className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          Edit
        </Link>
        <form action={setClientActive.bind(null, client.id, !client.active)}>
          <button
            type="submit"
            className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            {client.active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </div>
    </li>
  );
}

function ClientForm({ client, error, from }: { client: Client | null; error?: string; from: string | null }) {
  const action = client ? updateClient.bind(null, client.id) : addClient;

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 id="add-heading" className="text-xl font-semibold tracking-tight">
        {client ? "Edit" : "Add a client or partner"}
      </h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}
      {from && <input type="hidden" name="from" value={from} />}

      <div>
        <label htmlFor="kind" className="block text-sm font-medium">
          Type
        </label>
        <select id="kind" name="kind" defaultValue={client ? kindOf(client) : "client"} className={field}>
          <option value="client">Client</option>
          <option value="partner">Partner</option>
        </select>
      </div>

      <div>
        <label htmlFor="canonical_name" className="block text-sm font-medium">
          Name (exactly as written in the sheet)
        </label>
        <input
          id="canonical_name"
          name="canonical_name"
          type="text"
          required
          autoComplete="off"
          defaultValue={client?.canonical_name ?? ""}
          placeholder="PT EXAMPLE INDONESIA"
          className={field}
        />
        {client && (
          <p className="mt-1 text-xs text-muted">Renaming also updates the client name on this client&apos;s issues.</p>
        )}
      </div>

      <div>
        <label htmlFor="aliases" className="block text-sm font-medium">
          Other spellings (optional)
        </label>
        <input
          id="aliases"
          name="aliases"
          type="text"
          autoComplete="off"
          defaultValue={client?.aliases.join(", ") ?? ""}
          placeholder="Separate with commas"
          className={field}
        />
        <p className="mt-1 text-xs text-muted">Used to match old data. Never copied to the sheet.</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {client ? "Save" : "Add"}
        </button>
        {client && (
          <Link
            href={from ?? "/clients"}
            className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
          >
            Cancel
          </Link>
        )}
      </div>
      {!client && (
        <p className="text-xs text-muted">New entries start as “not verified” until you confirm the name against the sheet.</p>
      )}
    </form>
  );
}
