"use client";

import { useOptimistic, useTransition } from "react";
import { toggleTodoDone } from "@/app/(dashboard)/todos/actions";
import type { TodoStatus } from "@/lib/types";

/**
 * Kotak "tandai selesai". Tampilannya berubah SEKETIKA saat diklik (optimistis); server menyimpannya di belakang layar dan
 * halaman menyusul begitu data barunya datang. Bila penyimpanan gagal, tampilan kembali ke status sebenarnya otomatis.
 */
export function DoneCheckbox({ id, status, title, size = "md" }: { id: string; status: TodoStatus; title: string; size?: "md" | "sm" }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status, (_current, next: TodoStatus) => next);
  const [, startTransition] = useTransition();
  const done = optimisticStatus === "done";

  return (
    <button
      type="button"
      aria-label={done ? `Mark as not done: ${title}` : `Mark as done: ${title}`}
      onClick={() =>
        startTransition(async () => {
          setOptimisticStatus(done ? "todo" : "done");
          await toggleTodoDone(id, status);
        })
      }
      className={`flex shrink-0 items-center justify-center border transition-colors ${
        size === "md" ? "h-5 w-5 rounded-md text-xs" : "h-4 w-4 rounded text-[10px]"
      } ${done ? "border-success bg-success text-white" : "border-border-strong hover:border-success hover:bg-success-soft"}`}
    >
      {done ? "✓" : ""}
    </button>
  );
}
