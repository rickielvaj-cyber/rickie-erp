"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.2 13.2 4 4" strokeLinecap="round" />
  </svg>
);

/**
 * Pencarian global di menu atas. Layar lebar: kolom isian (tekan "/" untuk fokus).
 * Layar sempit: ikon yang membuka halaman /search (menu atas sudah penuh di sana).
 */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Link
        href="/search"
        aria-label="Search"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground lg:hidden"
      >
        <SearchIcon />
      </Link>
      <form
        role="search"
        className="relative hidden lg:block"
        onSubmit={(e) => {
          e.preventDefault();
          const q = value.trim();
          router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
        }}
      >
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search everything"
          aria-label="Search everything"
          maxLength={200}
          className="h-9 w-48 rounded-full border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted transition-[width] focus:w-64 focus:border-foreground focus:outline-none"
        />
      </form>
    </>
  );
}
