"use client";

import { useState, useTransition } from "react";
import { askAiNotes, type AskResult } from "@/app/(dashboard)/notes/ai-actions";
import { AI_ASK_MAX_NOTES, AI_QUESTION_MAX } from "@/lib/ai/notes";

type Option = { id: string; title: string; blocked: boolean };

/** Tanya catatan yang dipilih. Tidak ada yang dikirim sebelum tombol Ask ditekan; catatan privat tidak bisa dipilih. */
export function AskNotes({ notes }: { notes: Option[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = notes.filter((n) => n.title.toLowerCase().includes(filter.trim().toLowerCase()));
  const atLimit = chosen.length >= AI_ASK_MAX_NOTES;

  function toggle(id: string) {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= AI_ASK_MAX_NOTES ? c : [...c, id]));
  }

  function ask() {
    setResult(null);
    startTransition(async () => {
      setResult(await askAiNotes(chosen, question));
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-muted">
        Only the notes you tick are sent to Google Gemini, when you press Ask, with client and project names, emails, links, phone numbers,
        big numbers and codes replaced by placeholders (people&apos;s names are not detected). Notes marked private cannot be chosen. On
        Gemini&apos;s free tier, Google may use what it receives to improve its products.
      </p>

      <section aria-label="Choose notes">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">
            Notes <span className="text-base font-normal text-muted">({chosen.length}/{AI_ASK_MAX_NOTES})</span>
          </h2>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title"
            aria-label="Filter notes by title"
            className="h-10 w-48 rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
          />
        </div>
        <ul className="mt-3 max-h-80 divide-y divide-border overflow-auto rounded-2xl border border-border">
          {shown.length === 0 && <li className="px-5 py-4 text-sm text-muted">No notes.</li>}
          {shown.map((n) => {
            const on = chosen.includes(n.id);
            return (
              <li key={n.id}>
                <label className={`flex items-center gap-3 px-5 py-3 text-base ${n.blocked ? "text-muted" : "cursor-pointer hover:bg-surface"}`}>
                  <input type="checkbox" checked={on} disabled={n.blocked || (!on && atLimit)} onChange={() => toggle(n.id)} />
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  {n.blocked && <span className="shrink-0 text-sm">Private</span>}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Question">
        <label htmlFor="ask-question" className="text-xl font-semibold tracking-tight">
          Question
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={AI_QUESTION_MAX}
          rows={3}
          placeholder="e.g. What did we agree about the go-live date?"
          className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={ask}
            disabled={pending || chosen.length === 0 || question.trim() === ""}
            className="rounded-full bg-accent px-5 py-2 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Asking…" : "Ask"}
          </button>
        </div>
      </section>

      {result && !result.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <section aria-label="Answer" className="rounded-2xl border border-border px-5 py-4">
          <p className="text-sm text-muted">
            From: {result.used.join(", ")}
            {result.sent ? ` · hidden before sending: ${result.sent}` : ""}. Check it before relying on it.
          </p>
          <pre aria-label="AI answer" className="mt-2 whitespace-pre-wrap font-sans text-base leading-relaxed">{result.answer}</pre>
        </section>
      )}
    </div>
  );
}
