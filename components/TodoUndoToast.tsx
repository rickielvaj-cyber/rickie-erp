"use client";

import { useEffect, useState, useTransition } from "react";
import type { Todo } from "@/lib/types";
import { restoreTodo } from "@/app/(dashboard)/todos/actions";
import { TODO_DELETED_EVENT } from "@/components/TodoDeleteButton";

const UNDO_MS = 6000;

// Satu toast untuk seluruh halaman To-Do. Hanya penghapusan terakhir yang bisa
// diurungkan; menghapus tugas lain menggantikan toast sebelumnya.
export function TodoUndoToast() {
  const [deleted, setDeleted] = useState<Todo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onDeleted = (e: Event) => {
      setError(null);
      setDeleted((e as CustomEvent<Todo>).detail);
    };
    window.addEventListener(TODO_DELETED_EVENT, onDeleted);
    return () => window.removeEventListener(TODO_DELETED_EVENT, onDeleted);
  }, []);

  useEffect(() => {
    if (!deleted || pending) return;
    const t = setTimeout(() => setDeleted(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [deleted, pending]);

  if (!deleted) return null;

  const undo = () => {
    startTransition(async () => {
      const result = await restoreTodo(deleted);
      if (result.error) setError(result.error);
      else setDeleted(null);
    });
  };

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-full bg-foreground py-2.5 pl-5 pr-2.5 text-sm text-background shadow-lg"
    >
      <span className="truncate">
        {error ? `Gagal mengurungkan: ${error}` : `Tugas dihapus: ${deleted.title}`}
      </span>
      <button
        type="button"
        onClick={undo}
        disabled={pending}
        className="shrink-0 rounded-full border border-background px-3.5 py-1 transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
      >
        {pending ? "…" : "Urungkan"}
      </button>
    </div>
  );
}
