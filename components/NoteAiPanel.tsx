"use client";

import { useState, useTransition } from "react";
import { createTodosFromActionItems, previewAiNote, runAiNote, type AiMode } from "@/app/(dashboard)/notes/ai-actions";
import type { ActionItem } from "@/lib/ai/notes";

type Result = { markdown: string; actionItems: ActionItem[]; sent: string; mode: AiMode };

const button = "rounded-full border border-foreground px-4 py-1.5 text-sm font-medium transition-colors hover:bg-surface disabled:opacity-40";
const quiet = "text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-40";

/**
 * AI untuk satu catatan. Tidak ada yang dikirim sampai tombol ditekan; teks disensor di server (nama klien/proyek, email, tautan,
 * telepon, angka besar, kode) dan "Preview" menampilkan persis apa yang akan keluar. Hasil tidak otomatis masuk catatan.
 */
export function NoteAiPanel({
  noteId,
  blocked,
  saving,
  onToggleBlocked,
  onAppend,
}: {
  noteId: string | null;
  blocked: boolean;
  /** Ada perubahan yang belum tersimpan: AI membaca versi tersimpan, jadi tunggu dulu. */
  saving: boolean;
  onToggleBlocked: () => void;
  onAppend: (text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<{ text: string; sent: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [copied, setCopied] = useState(false);

  const disabled = !noteId || blocked || saving || pending;

  function run(mode: AiMode) {
    if (!noteId) return;
    setError(null);
    setInfo(null);
    setPreview(null);
    startTransition(async () => {
      const r = await runAiNote(noteId, mode);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult({ markdown: r.markdown, actionItems: r.actionItems, sent: r.sent, mode });
      setChecked(r.actionItems.map(() => true));
    });
  }

  function showPreview() {
    if (!noteId) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await previewAiNote(noteId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview({ text: r.text, sent: r.sent });
    });
  }

  function addTodos() {
    if (!noteId || !result) return;
    const items = result.actionItems.filter((_, i) => checked[i]).map((a) => ({ title: a.task, dueDate: a.due }));
    setError(null);
    startTransition(async () => {
      const r = await createTodosFromActionItems(noteId, items);
      if (!r.ok) setError(r.error);
      else {
        setInfo(`Added ${r.created} to-do${r.created === 1 ? "" : "s"}.`);
        setChecked((c) => c.map(() => false));
      }
    });
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy manually (Ctrl+C, then Enter):", result.markdown);
    }
  }

  const selected = checked.filter(Boolean).length;

  return (
    <section aria-label="AI" className="mt-6 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">AI</h2>
        <button type="button" onClick={onToggleBlocked} aria-pressed={blocked} className={quiet}>
          {blocked ? "Private: never sent to AI (click to allow)" : "Never send this note to AI"}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Runs only when you press a button. The text goes to Google Gemini with client and project names, emails, links, phone numbers,
        big numbers and codes replaced by placeholders (people&apos;s names are not detected; check Preview). On Gemini&apos;s free tier,
        Google may use what it receives to improve its products.
      </p>

      {blocked ? (
        <p className="mt-3 text-sm">This note is private. It is never sent to AI.</p>
      ) : !noteId ? (
        <p className="mt-3 text-sm text-muted">Start typing; once the note is saved you can use AI on it.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => run("tidy")} disabled={disabled} className={button}>
            {pending ? "Working…" : "Tidy meeting notes"}
          </button>
          <button type="button" onClick={() => run("summary")} disabled={disabled} className={button}>
            Summarize
          </button>
          <button type="button" onClick={showPreview} disabled={disabled} className={quiet}>
            Preview what is sent
          </button>
          {saving && <span className="text-sm text-muted">Saving… AI reads the saved version.</span>}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {preview && (
        <div className="mt-4">
          <p className="text-sm text-muted">{preview.sent ? `Hidden before sending: ${preview.sent}.` : "Nothing was replaced."} This exact text would be sent:</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-surface px-4 py-3 text-sm">{preview.text}</pre>
          <button type="button" onClick={() => setPreview(null)} className={`${quiet} mt-2`}>
            Close preview
          </button>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl border border-border px-5 py-4">
          <p className="text-sm text-muted">
            {result.mode === "tidy" ? "Tidied" : "Summary"}
            {result.sent ? ` · hidden before sending: ${result.sent}` : ""}. Check it before using it.
          </p>
          <pre aria-label="AI result" className="mt-2 whitespace-pre-wrap font-sans text-base leading-relaxed">{result.markdown}</pre>

          {result.actionItems.length > 0 && (
            <fieldset className="mt-4 border-t border-border pt-3">
              <legend className="text-sm font-medium">Add action items to To-Do</legend>
              <ul className="mt-2 space-y-1.5">
                {result.actionItems.map((a, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked[i] ?? false}
                        onChange={(e) => setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                        className="mt-1"
                      />
                      <span>
                        {a.task}
                        {(a.owner || a.due) && <span className="text-muted"> ({[a.owner, a.due ? `due ${a.due}` : null].filter(Boolean).join(", ")})</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={addTodos} disabled={pending || selected === 0} className={`${button} mt-3`}>
                Add {selected} to To-Do
              </button>
              {info && <span role="status" className="ml-3 text-sm text-muted">{info}</span>}
            </fieldset>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => onAppend(result.markdown)} className={button}>
              Append to note
            </button>
            <button type="button" onClick={copy} className={button}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button type="button" onClick={() => setResult(null)} className={quiet}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
