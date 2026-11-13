"use client";

import { useRef, useState, useTransition } from "react";
import { addTodoForDay } from "@/app/(dashboard)/todos/actions";

/**
 * Kotak "tulis tugas baru" di Beranda. Tugas langsung tampil (redup) dan kotaknya langsung kosong dengan fokus tetap di sana;
 * penyimpanan berjalan di latar belakang (beberapa bisa bersamaan). Bila gagal, muncul pesan dan tugas redupnya dihapus.
 * Setelah server selesai, data Beranda dimuat ulang dan baris asli menggantikan baris redup.
 */
export function TodayQuickAdd({ today }: { today: string }) {
  const [pending, setPending] = useState<{ key: number; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const nextKey = useRef(0);

  const add = (title: string) => {
    const key = nextKey.current++;
    setPending((p) => [...p, { key, title }]);
    setError(null);
    startTransition(async () => {
      const result = await addTodoForDay(today, title);
      setPending((p) => p.filter((x) => x.key !== key));
      if (!result.ok) setError(`Could not add "${title}": ${result.error}`);
    });
  };

  return (
    <>
      {pending.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {pending.map((x) => (
            <li key={x.key} aria-busy="true" className="anim-enter py-2.5 text-base text-muted opacity-70">
              <span className="block truncate">{x.title}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("title") as HTMLInputElement;
          const title = input.value.trim();
          if (!title) return;
          input.value = "";
          add(title);
        }}
      >
        <input
          name="title"
          required
          placeholder="+ Write a new task, then press Enter"
          aria-label="New task for today"
          className="h-11 w-full rounded-2xl border border-dashed border-border-strong bg-background px-4 text-base placeholder:text-subtle focus:border-solid focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
      </form>
    </>
  );
}
