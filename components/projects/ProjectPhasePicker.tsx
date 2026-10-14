"use client";

import Link from "next/link";
import { useState } from "react";

export type PickerProject = {
  id: string;
  label: string;
  done: boolean;
  phases: { id: string; name: string }[];
};

/**
 * Pilihan Project + Phase untuk form to-do. Daftar fase mengikuti proyek yang dipilih;
 * ganti proyek -> pilihan fase dikosongkan supaya tidak tertinggal fase proyek lain.
 */
export function ProjectPhasePicker({
  projects,
  projectId,
  phaseId,
  field,
}: {
  projects: PickerProject[];
  projectId: string | null;
  phaseId: string | null;
  field: string;
}) {
  const [project, setProject] = useState(projectId ?? "");
  const [phase, setPhase] = useState(phaseId ?? "");
  const phases = projects.find((p) => p.id === project)?.phases ?? [];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="project_id" className="block text-sm font-medium">
          Project
        </label>
        <select
          id="project_id"
          name="project_id"
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setPhase("");
          }}
          className={field}
        >
          <option value="">No project</option>
          {projects
            // Proyek yang belum selesai saja untuk dipilih, kecuali proyek yang sudah terpasang di tugas ini.
            .filter((p) => !p.done || p.id === projectId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.done ? " (done)" : ""}
              </option>
            ))}
        </select>
        {projects.length === 0 && (
          <p className="mt-1 text-xs text-muted">
            No projects yet.{" "}
            <Link href="/projects?new=1" className="underline underline-offset-2 hover:text-foreground">
              Create project
            </Link>
          </p>
        )}
      </div>
      <div>
        <label htmlFor="phase_id" className="block text-sm font-medium">
          Phase
        </label>
        <select
          id="phase_id"
          name="phase_id"
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          disabled={!project}
          className={`${field} disabled:text-muted`}
        >
          <option value="">{project ? "No phase" : "Pick a project first"}</option>
          {phases.map((ph) => (
            <option key={ph.id} value={ph.id}>
              {ph.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
