// Pengelompokan to-do di daftar Hari ini: to-do tanpa proyek tetap daftar biasa; to-do proyek dikelompokkan per proyek lalu per
// fase supaya puluhan to-do satu proyek tidak memenuhi daftar. Murni (tanpa database) supaya mudah diuji.

export type GroupableTodo = { id: string; project_id: string | null; phase_id: string | null };

export type PhaseGroup<T> = { phaseId: string | null; name: string | null; todos: T[] };
export type ProjectGroup<T> = { projectId: string; label: string; phases: PhaseGroup<T>[]; count: number };

export type GroupMeta = {
  /** label proyek (mis. "PT X — Nagiya"); kunci = id proyek */
  projects: Map<string, string>;
  /** nama fase dan urutannya di proyek; kunci = id fase */
  phases: Map<string, { name: string; order: number }>;
};

/**
 * `loose` = to-do tanpa proyek (atau proyeknya tidak dikenal), urutan masukan dipertahankan.
 * `projects` = per proyek (abjad menurut label), di dalamnya per fase menurut urutan fase; to-do tanpa fase paling akhir.
 * Urutan to-do di dalam kelompok mengikuti urutan masukan.
 */
export function groupByProject<T extends GroupableTodo>(todos: T[], meta: GroupMeta): { loose: T[]; projects: ProjectGroup<T>[] } {
  const loose: T[] = [];
  const byProject = new Map<string, T[]>();
  for (const t of todos) {
    if (t.project_id && meta.projects.has(t.project_id)) byProject.set(t.project_id, [...(byProject.get(t.project_id) ?? []), t]);
    else loose.push(t);
  }

  const projects: ProjectGroup<T>[] = Array.from(byProject.entries()).map(([projectId, list]) => {
    const byPhase = new Map<string | null, T[]>();
    for (const t of list) {
      const key = t.phase_id && meta.phases.has(t.phase_id) ? t.phase_id : null;
      byPhase.set(key, [...(byPhase.get(key) ?? []), t]);
    }
    const phases: PhaseGroup<T>[] = Array.from(byPhase.entries())
      .map(([phaseId, items]) => ({ phaseId, name: phaseId ? (meta.phases.get(phaseId)?.name ?? null) : null, todos: items }))
      .sort((a, b) => {
        if (a.phaseId === null) return 1;
        if (b.phaseId === null) return -1;
        return (meta.phases.get(a.phaseId)?.order ?? 0) - (meta.phases.get(b.phaseId)?.order ?? 0);
      });
    return { projectId, label: meta.projects.get(projectId) ?? "Project", phases, count: list.length };
  });
  projects.sort((a, b) => a.label.localeCompare(b.label));
  return { loose, projects };
}

/** Kelompok dengan banyak to-do dibuka terlipat supaya daftar tetap ringkas; sedikit = langsung terbuka. */
export const OPEN_THRESHOLD = 3;
export const startsOpen = (count: number) => count <= OPEN_THRESHOLD;
