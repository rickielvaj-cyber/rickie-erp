"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { SearchBox } from "@/components/SearchBox";
import { FocusBadge } from "@/components/focus/FocusBadge";

// Urutan menu: yang paling sering dipakai di kiri (Home, To-Do List yang disorot, Notes), lalu garis tipis, lalu halaman lain.
// Clients dan halaman jarang dipakai (Focus, Settings, ekspor) ada di menu avatar di kanan.
type NavLink = { href: string; label: string; emphasis?: boolean };
const PRIMARY: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/todos", label: "To-Do List", emphasis: true },
  { href: "/notes", label: "Notes" },
];
const SECONDARY: NavLink[] = [
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/projects", label: "Projects" },
  { href: "/goals", label: "Goals" },
  { href: "/issues", label: "Issue Log" },
  { href: "/summary", label: "Weekly Summary" },
];
/** Halaman yang dibuka dari menu avatar: avatar diberi cincin saat salah satunya aktif. */
const MENU_ROUTES = ["/clients", "/focus", "/settings"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavItem({ link, pathname, secondary }: { link: NavLink; pathname: string; secondary?: boolean }) {
  const active = isActive(pathname, link.href);
  const base = "relative whitespace-nowrap py-1.5 text-sm transition-colors";
  // To-Do List disorot sebagai pil: lembut saat tidak aktif, penuh (navy) saat aktif. Lainnya teks biasa dengan garis bawah aktif.
  const style = link.emphasis
    ? active
      ? "rounded-full bg-accent px-3.5 font-medium text-white"
      : "rounded-full bg-accent-soft px-3.5 font-medium text-accent-ink hover:bg-accent hover:text-white"
    : active
      ? "rounded-lg px-2.5 font-medium text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
      : `rounded-lg px-2.5 ${secondary ? "text-subtle" : "text-muted"} hover:bg-surface hover:text-foreground`;
  return (
    <Link href={link.href} aria-current={active ? "page" : undefined} className={`${base} ${style}`}>
      {link.label}
    </Link>
  );
}

function NavLinks({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <nav aria-label="Main menu" className={className}>
      {PRIMARY.map((link) => (
        <NavItem key={link.href} link={link} pathname={pathname} />
      ))}
      <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border-strong/60" />
      {SECONDARY.map((link) => (
        <NavItem key={link.href} link={link} pathname={pathname} secondary />
      ))}
    </nav>
  );
}

const itemClass = (active: boolean) =>
  `block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface ${active ? "bg-accent-soft font-medium text-accent-ink" : ""}`;

function UserMenu({ email, pathname }: { email: string; pathname: string }) {
  const [open, setOpen] = useState(false);
  const inMenuRoute = MENU_ROUTES.some((r) => pathname.startsWith(r));
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
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 transition-colors hover:bg-surface"
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-accent-soft text-xs font-semibold uppercase text-accent-ink ${inMenuRoute ? "ring-2 ring-accent" : ""}`}
        >
          {email.slice(0, 2)}
        </span>
        <span aria-hidden="true" className="text-[10px] text-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-background p-2 shadow-pop"
        >
          <div className="border-b border-border px-3 pb-2 pt-1">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="truncate text-sm font-medium" title={email}>
              {email}
            </p>
          </div>
          <div className="border-b border-border py-1">
            <Link href="/clients" onClick={() => setOpen(false)} role="menuitem" aria-current={pathname.startsWith("/clients") ? "page" : undefined} className={itemClass(pathname.startsWith("/clients"))}>
              Clients &amp; partners
            </Link>
            <Link href="/focus" onClick={() => setOpen(false)} role="menuitem" aria-current={pathname.startsWith("/focus") ? "page" : undefined} className={itemClass(pathname.startsWith("/focus"))}>
              Focus timer
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)} role="menuitem" aria-current={pathname.startsWith("/settings") ? "page" : undefined} className={itemClass(pathname.startsWith("/settings"))}>
              Settings
            </Link>
          </div>
          <div className="border-b border-border py-1">
            {/* <a> biasa (bukan Link): ini unduhan berkas, jangan di-prefetch. */}
            <a href="/api/export" download onClick={() => setOpen(false)} role="menuitem" className={itemClass(false)}>
              Export all data (JSON)
            </a>
            <a href="/api/export/issues" download onClick={() => setOpen(false)} role="menuitem" className={itemClass(false)}>
              Export issue log (CSV)
            </a>
          </div>
          <form action={logout} className="pt-1">
            <button
              type="submit"
              role="menuitem"
              className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
            >
              Sign out
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 shadow-[0_1px_8px_rgb(20_22_26/0.04)] backdrop-blur">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-6 lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
          <span className="whitespace-nowrap">
            <span className="hidden xl:inline">Personal </span>Workspace
          </span>
        </Link>

        <NavLinks pathname={pathname} className="hidden items-center gap-0.5 lg:flex xl:gap-1" />

        <div className="flex items-center justify-end gap-2">
          {email && <FocusBadge />}
          {email && (
            // Suspense: SearchBox membaca ?q= di URL (useSearchParams).
            <Suspense fallback={null}>
              <SearchBox />
            </Suspense>
          )}
          {email ? (
            <UserMenu email={email} pathname={pathname} />
          ) : (
            <Link
              href="/login"
              className={`rounded-full border px-4 py-1 text-sm font-medium transition-colors ${
                pathname.startsWith("/login")
                  ? "border-accent bg-accent text-white"
                  : "border-border-strong hover:bg-surface"
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
        className="flex items-center gap-1 overflow-x-auto border-t border-border px-4 py-1.5 lg:hidden"
      />
    </header>
  );
}
