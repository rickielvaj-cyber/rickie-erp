"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/todos", label: "To-Do List" },
  { href: "/issues", label: "Issue Log" },
  { href: "/summary", label: "Ringkasan Mingguan" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLinks({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <nav aria-label="Menu utama" className={className}>
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 py-1 text-sm transition-colors ${
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu akun"
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 transition-colors hover:bg-surface"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground text-xs font-medium uppercase">
          {email.slice(0, 2)}
        </span>
        <span aria-hidden="true" className="text-[10px] text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-background p-2 shadow-lg"
        >
          <div className="border-b border-border px-3 pb-2 pt-1">
            <p className="text-xs text-muted">Masuk sebagai</p>
            <p className="truncate text-sm font-medium" title={email}>
              {email}
            </p>
          </div>
          <form action={logout} className="pt-1">
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
            >
              Keluar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Menu atas sticky, tipis, ala Apple: wordmark kiri, link di tengah, akun di kanan.
export function TopNav({ email }: { email: string | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-6 md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Personal Workspace
        </Link>

        <NavLinks pathname={pathname} className="hidden items-center gap-7 md:flex" />

        <div className="flex justify-end">
          {email ? (
            <UserMenu email={email} />
          ) : (
            <Link
              href="/login"
              className={`rounded-full border px-4 py-1 text-sm font-medium transition-colors ${
                pathname.startsWith("/login")
                  ? "border-accent bg-accent text-white"
                  : "border-foreground hover:bg-surface"
              }`}
            >
              Login
            </Link>
          )}
        </div>
      </div>

      {/* Layar sempit: link pindah ke baris kedua yang bisa digeser. */}
      <NavLinks
        pathname={pathname}
        className="flex items-center gap-6 overflow-x-auto border-t border-border px-6 py-2 md:hidden"
      />
    </header>
  );
}
