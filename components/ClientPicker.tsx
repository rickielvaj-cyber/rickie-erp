"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { exactClient, filterClients, type PickOption } from "@/lib/client-pick";

/**
 * Pemilih klien yang bisa diketik: ketik sebagian nama (atau alias), daftar menyempit, pilih dengan klik atau panah + Enter.
 * Nilai yang dikirim form adalah id klien (input tersembunyi `name`). Wajib memilih dari daftar.
 */
export function ClientPicker({
  id,
  name,
  options,
  defaultId,
  required = true,
  inputClass,
}: {
  /** id untuk input teks, supaya <label htmlFor> menamainya. */
  id?: string;
  name: string;
  options: PickOption[];
  defaultId?: string | null;
  required?: boolean;
  inputClass: string;
}) {
  const listId = useId();
  const initial = options.find((o) => o.id === defaultId) ?? null;
  const [text, setText] = useState(initial?.name ?? "");
  const [selected, setSelected] = useState<PickOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const matches = useMemo(() => filterClients(options, selected && text === selected.name ? "" : text), [options, text, selected]);

  // Pesan validasi bawaan peramban bila ada isi tapi belum dipilih dari daftar (atau kosong padahal wajib).
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    if (selected) el.setCustomValidity("");
    else if (text.trim() !== "" || required) el.setCustomValidity("Choose a client or partner from the list.");
    else el.setCustomValidity("");
  }, [selected, text, required]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = (o: PickOption) => {
    setSelected(o);
    setText(o.name);
    setOpen(false);
  };

  const onChange = (value: string) => {
    setText(value);
    // Mengetik nama yang persis sama dengan satu pilihan langsung memilihnya; selain itu pilihan dilepas.
    setSelected(exactClient(options, value));
    setActive(0);
    setOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault(); // jangan mengirim form: Enter di sini berarti memilih
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input
        id={id}
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
        required={required}
        autoComplete="off"
        placeholder="Type to search clients and partners"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClass}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-foreground bg-background py-1 shadow-lg"
        >
          {matches.length === 0 && <li className="px-3.5 py-2 text-sm text-muted">No match. Use “Add a client or partner” below.</li>}
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={selected?.id === o.id}
              onPointerDown={(e) => {
                e.preventDefault(); // jangan memindahkan fokus dari input sebelum memilih
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2 text-base ${i === active ? "bg-surface" : ""}`}
            >
              <span className="min-w-0 truncate">{o.name}</span>
              <span className="shrink-0 text-xs text-muted">{o.kind === "partner" ? "Partner" : "Client"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
