"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { loadKbSearchIndex, searchKb, type KbSearchHit } from "@/lib/kb/search-index";

export const KB_HIGHLIGHT_EVENT = "kb:highlight";
export type KbHighlightDetail = { anchor: string; phrase: string };

// Tombol "Cari" + command palette. Cuma dipasang di halaman Knowledge Base, dan
// indeksnya cuma berisi section bab KB — nggak ada data To-Do/Issue Log/Ringkasan.
export function KbSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KbSearchHit[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  const openPalette = useCallback(() => {
    setStatus((s) => (s === "error" ? "loading" : s)); // buka ulang = coba muat lagi
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPalette]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadKbSearchIndex()
      .then((index) => {
        if (cancelled) return;
        setStatus("ready");
        setHits(searchKb(index, query));
        setActive(0);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  const close = useCallback(() => setOpen(false), []);

  function choose(hit: KbSearchHit) {
    setOpen(false);
    const target = `/knowledge-base/${hit.module}`;
    if (pathname === target) {
      window.dispatchEvent(
        new CustomEvent<KbHighlightDetail>(KB_HIGHLIGHT_EVENT, {
          detail: { anchor: hit.anchor, phrase: hit.phrase },
        }),
      );
      return;
    }
    const params = hit.phrase ? `?hl=${encodeURIComponent(hit.phrase)}` : "";
    router.push(`${target}${params}#${encodeURIComponent(hit.anchor)}`);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === "Escape") {
      close();
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-brand-red hover:text-brand-red"
      >
        Cari
        <kbd className="rounded border border-border px-1 font-sans text-[10px] text-muted">Ctrl K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cari Knowledge Base"
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-xl"
          >
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Cari di Knowledge Base..."
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
              className="w-full border-b border-border px-4 py-3 text-sm focus:outline-none"
            />

            <div className="max-h-[60vh] overflow-y-auto">
              {status === "loading" && (
                <p className="px-4 py-6 text-center text-sm text-muted">Menyiapkan indeks pencarian...</p>
              )}
              {status === "error" && (
                <p className="px-4 py-6 text-center text-sm text-brand-red">
                  Gagal memuat indeks pencarian — tutup lalu coba lagi.
                </p>
              )}
              {status === "ready" && !query.trim() && (
                <p className="px-4 py-6 text-center text-sm text-muted">Ketik kata kunci untuk mulai mencari.</p>
              )}
              {status === "ready" && query.trim() && hits.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">Tidak ada hasil yang cocok.</p>
              )}

              {status === "ready" && hits.length > 0 && (
                <ul id={listId} role="listbox" className="py-1">
                  {hits.map((hit, i) => (
                    <li
                      key={hit.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(hit)}
                      className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-surface" : ""}`}
                    >
                      <p className="text-xs text-muted">{hit.chapter}</p>
                      <p className={`text-sm font-medium ${i === active ? "text-brand-red" : ""}`}>
                        {hit.heading}
                      </p>
                      {hit.snippet && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                          {hit.snippet.before}
                          {hit.snippet.match && (
                            <mark className="rounded-sm bg-yellow-200 px-0.5 text-foreground">
                              {hit.snippet.match}
                            </mark>
                          )}
                          {hit.snippet.after}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
              ↑↓ pilih · Enter buka · Esc tutup — hanya mencari di Knowledge Base
            </p>
          </div>
        </div>
      )}
    </>
  );
}
