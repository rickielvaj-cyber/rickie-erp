"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { KB_MODULES } from "@/lib/kb/modules";
import { parseKbDocx, saveKbImport } from "./actions";
import type { ParseKbDocxResult } from "@/lib/kb/import-types";
import type { ParsedSection } from "@/lib/kb/parse";

type Stage = "idle" | "uploading" | "parsing" | "preview" | "saving" | "done";

type EditableSection = ParsedSection & { include: boolean; slug: string };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Not a hard technical ceiling — Supabase Storage's actual per-file limit
// depends on the project's own configuration, which isn't something this
// code can check in advance. This just rejects obviously-too-large picks
// before spending time on an upload that has no realistic chance of working.
const HARD_REJECT_BYTES = 150 * 1024 * 1024;

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<EditableSection[] | null>(null);
  const [savedModules, setSavedModules] = useState<string[] | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setError(null);
    if (picked && !picked.name.toLowerCase().endsWith(".docx")) {
      setError("File harus berformat .docx.");
      setFile(null);
      return;
    }
    if (picked && picked.size > HARD_REJECT_BYTES) {
      setError(
        `File terlalu besar (${(picked.size / 1024 / 1024).toFixed(0)}MB). Coba pecah dokumen jadi beberapa file.`,
      );
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function handleUploadAndParse() {
    if (!file) return;
    setError(null);
    setStage("uploading");

    const supabase = createClient();
    const path = `imports/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("kb-documents")
      .upload(path, file, { contentType: file.type || DOCX_MIME, upsert: false });

    if (uploadError) {
      setError(`Upload gagal: ${uploadError.message}`);
      setStage("idle");
      return;
    }

    setStage("parsing");
    let result: ParseKbDocxResult;
    try {
      result = await parseKbDocx(path);
    } catch (err) {
      setError(`Parsing gagal: ${err instanceof Error ? err.message : "unknown error"}`);
      setStage("idle");
      return;
    }

    if (!result.ok) {
      setError(result.error);
      setStage("idle");
      return;
    }

    setSections(
      result.sections.map((s) => ({
        ...s,
        include: s.matchedSlug !== null,
        slug: s.matchedSlug ?? "",
      })),
    );
    setStage("preview");
  }

  function updateSection(index: number, patch: Partial<EditableSection>) {
    setSections((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function handleConfirmSave() {
    if (!sections) return;
    setError(null);
    setStage("saving");

    const payload = sections
      .filter((s) => s.include && s.slug)
      .map((s) => ({ heading: s.heading, markdown: s.markdown, slug: s.slug }));

    const result = await saveKbImport({ sections: payload });

    if (!result.ok) {
      setError(result.error);
      setStage("preview");
      return;
    }

    setSavedModules(result.savedModules);
    setStage("done");
  }

  function handleReset() {
    setFile(null);
    setSections(null);
    setSavedModules(null);
    setError(null);
    setStage("idle");
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">{error}</p>
      )}

      {(stage === "idle" || stage === "uploading" || stage === "parsing") && (
        <div className="space-y-4 rounded-md border border-border bg-surface p-5">
          <div>
            <label htmlFor="docx" className="block text-sm font-medium">
              File Word (.docx)
            </label>
            <input
              id="docx"
              type="file"
              accept=".docx"
              onChange={handleFileChange}
              disabled={stage !== "idle"}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={handleUploadAndParse}
            disabled={!file || stage !== "idle"}
            className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark disabled:opacity-50"
          >
            {stage === "uploading" && "Mengunggah..."}
            {stage === "parsing" && "Memparsing..."}
            {stage === "idle" && "Upload & Parse"}
          </button>

          {(stage === "uploading" || stage === "parsing") && (
            <p className="text-xs text-muted">
              File besar bisa makan waktu beberapa menit — jangan tutup halaman ini.
            </p>
          )}
        </div>
      )}

      {stage === "preview" && sections && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Ditemukan {sections.length} section. Cek pemetaan modul tiap section sebelum
            disimpan — section tanpa modul (atau di-uncheck) tidak akan disimpan.
          </p>

          <ul className="space-y-3">
            {sections.map((section, index) => (
              <li key={index} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={section.include}
                      onChange={(e) => updateSection(index, { include: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium">{section.heading || "(tanpa judul)"}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">
                        {section.markdown.slice(0, 200)}
                        {section.markdown.length > 200 ? "..." : ""}
                      </p>
                    </div>
                  </div>
                  <select
                    value={section.slug}
                    onChange={(e) => updateSection(index, { slug: e.target.value })}
                    disabled={!section.include}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-sm"
                  >
                    <option value="">— Lewati —</option>
                    {KB_MODULES.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmSave}
              className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
            >
              Konfirmasi & Simpan
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {stage === "saving" && <p className="text-sm text-muted">Menyimpan...</p>}

      {stage === "done" && savedModules && (
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="font-medium text-brand-red">Berhasil disimpan ke {savedModules.length} modul.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {savedModules.map((slug) => (
              <li key={slug}>
                <Link href={`/kb/${slug}`} className="text-brand-red hover:underline">
                  {KB_MODULES.find((m) => m.slug === slug)?.label ?? slug}
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleReset}
            className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
          >
            Import File Lain
          </button>
        </div>
      )}
    </div>
  );
}
