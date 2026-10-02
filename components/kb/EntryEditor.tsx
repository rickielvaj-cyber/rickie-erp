"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KbContent } from "@/components/KbContent";

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function EntryEditor({
  entryId,
  initialTitle,
  initialContent,
}: {
  entryId: string;
  initialTitle: string;
  initialContent: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/knowledge-base/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Gagal menyimpan perubahan.");
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError("Gagal menyimpan perubahan — cek koneksi dan coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTitle(initialTitle);
    setContent(initialContent);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div>
        <div className="mb-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-brand-red">{title}</h1>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
          >
            Edit
          </button>
        </div>
        <KbContent content={content} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-brand-red">{error}</p>}

      <div>
        <label htmlFor="entry-title" className="block text-sm font-medium">
          Judul
        </label>
        <input
          id="entry-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="entry-content" className="block text-sm font-medium">
          Konten
        </label>
        <textarea
          id="entry-content"
          ref={(el) => {
            textareaRef.current = el;
            if (el) autoResize(el);
          }}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            autoResize(e.target);
          }}
          rows={10}
          className="mt-1 w-full resize-none overflow-hidden rounded-md border border-border px-3 py-2 font-mono text-sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red disabled:opacity-50"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
