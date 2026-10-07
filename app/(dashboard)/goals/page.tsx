import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Goal, GoalType } from "@/lib/types";
import { createGoal, toggleGoalDone } from "./actions";

const TYPE_LABEL: Record<GoalType, string> = { learning: "Belajar", work: "Kerja" };

type SearchParams = { show?: string; new?: string; error?: string };
type Show = "active" | "done" | "all";

const FILTERS: [Show, string][] = [
  ["active", "Aktif"],
  ["done", "Selesai"],
  ["all", "Semua"],
];

export default async function GoalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const show: Show = params.show === "done" || params.show === "all" ? params.show : "active";
  const isNew = params.new === "1";

  const supabase = await createClient();
  const [goalsResult, itemsResult] = await Promise.all([
    supabase.from("goals").select("*").order("created_at", { ascending: false }),
    supabase.from("goal_items").select("goal_id, is_done"),
  ]);

  const progress = new Map<string, { done: number; total: number }>();
  for (const item of itemsResult.data ?? []) {
    const p = progress.get(item.goal_id) ?? { done: 0, total: 0 };
    p.total += 1;
    if (item.is_done) p.done += 1;
    progress.set(item.goal_id, p);
  }

  const allGoals = goalsResult.data ?? [];
  const goals = allGoals.filter((g) => show === "all" || g.status === show);
  const fetchError = goalsResult.error ?? itemsResult.error;

  const tabClass = (active: boolean) =>
    `rounded-full border px-4 py-1 text-sm transition-colors ${
      active ? "border-accent bg-accent text-white" : "border-foreground hover:bg-surface"
    }`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Goals</h1>
          <p className="mt-1 text-base text-muted">Target jangka panjang dengan checklist. Terpisah dari to-do harian.</p>
        </div>
        {!isNew && (
          <Link
            href="/goals?new=1"
            className="shrink-0 rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
          >
            + Tambah goal
          </Link>
        )}
      </div>

      {isNew && (
        <div className="mt-8">
          <GoalForm error={params.error} />
        </div>
      )}

      <div className="mt-8 flex gap-2" role="group" aria-label="Filter status goal">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={value === "active" ? "/goals" : `/goals?show=${value}`}
            aria-current={show === value ? "true" : undefined}
            className={tabClass(show === value)}
          >
            {label}
          </Link>
        ))}
      </div>

      {fetchError && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          Gagal memuat data: {fetchError.message}
        </p>
      )}

      {goals.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-base text-muted">
          {allGoals.length === 0
            ? "Belum ada goal. Klik “+ Tambah goal” untuk membuat yang pertama."
            : show === "done"
              ? "Belum ada goal yang selesai."
              : "Tidak ada goal aktif."}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} progress={progress.get(goal.id) ?? { done: 0, total: 0 }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalCard({ goal, progress }: { goal: Goal; progress: { done: number; total: number } }) {
  const done = goal.status === "done";
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <li className="flex items-start gap-4 rounded-2xl border border-foreground p-5">
      <form action={toggleGoalDone.bind(null, goal.id, goal.status)} className="mt-1 flex">
        <button
          type="submit"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Tandai goal belum selesai: ${goal.title}` : `Tandai goal selesai: ${goal.title}`}
          title={done ? "Buka kembali goal" : "Tandai goal selesai"}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-foreground text-xs transition-colors ${
            done ? "bg-foreground text-background" : "hover:bg-surface"
          }`}
        >
          {done ? "✓" : ""}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/goals/${goal.id}`}
            className={`text-xl font-semibold tracking-tight hover:underline ${done ? "text-muted line-through" : ""}`}
          >
            {goal.title}
          </Link>
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
            {TYPE_LABEL[goal.type]}
          </span>
        </div>
        {goal.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{goal.description}</p>}

        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="whitespace-nowrap">
            {progress.done} / {progress.total} item
          </span>
          {progress.total > 0 && (
            <>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progres ${goal.title}`}
                className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-border"
              >
                <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-muted">{percent}%</span>
            </>
          )}
        </div>
      </div>

      <Link
        href={`/goals/${goal.id}`}
        className="shrink-0 rounded-full px-3 py-1 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        Buka ›
      </Link>
    </li>
  );
}

function GoalForm({ error }: { error?: string }) {
  const field =
    "mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-base focus:border-foreground focus:outline-none";

  return (
    <form action={createGoal} className="space-y-4 rounded-3xl border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold tracking-tight">Goal baru</h2>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Judul
        </label>
        <input id="title" name="title" type="text" required className={field} />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          Deskripsi
        </label>
        <textarea id="description" name="description" rows={2} className={field} />
      </div>

      <div>
        <label htmlFor="type" className="block text-sm font-medium">
          Jenis
        </label>
        <select id="type" name="type" defaultValue="learning" className={field}>
          <option value="learning">Belajar</option>
          <option value="work">Kerja</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Simpan
        </button>
        <Link
          href="/goals"
          className="rounded-full border border-foreground px-6 py-2 text-base font-medium transition-colors hover:bg-background"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
