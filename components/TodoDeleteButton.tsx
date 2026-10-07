"use client";

import { useTransition } from "react";
import type { Todo } from "@/lib/types";
import { deleteTodo } from "@/app/(dashboard)/todos/actions";

export const TODO_DELETED_EVENT = "todo-deleted";

// Hapus langsung (tanpa dialog konfirmasi); salah klik bisa dibatalkan lewat
// toast "Urungkan" di TodoUndoToast, yang mendengar event ini.
export function TodoDeleteButton({
  todo,
  variant = "row",
}: {
  todo: Todo;
  variant?: "row" | "week";
}) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await deleteTodo(todo.id);
      if (!result.error) {
        window.dispatchEvent(new CustomEvent<Todo>(TODO_DELETED_EVENT, { detail: todo }));
      }
    });
  };

  if (variant === "week") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Hapus tugas"
        aria-label={`Hapus tugas: ${todo.title}`}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border border-border text-[13px] leading-none text-muted transition-colors hover:border-foreground hover:bg-background hover:text-danger disabled:opacity-40"
      >
        ×
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={`Hapus tugas: ${todo.title}`}
      className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-surface hover:text-danger disabled:opacity-40"
    >
      Hapus
    </button>
  );
}
