import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { KB_MODULES } from "@/lib/kb/modules";

// Home PUBLIK: hero + kartu fitur nggak memuat data apa pun. Angka ringkas di
// bawah hero cuma di-query kalau sudah login (RLS tetap jadi pagar terakhir).

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const FEATURES = [
  {
    href: "/knowledge-base",
    title: "Knowledge Base",
    desc: "Referensi YonSuite per modul. Cari cepat saat sedang bingung.",
    icon: (
      <svg {...iconProps}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
        <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
      </svg>
    ),
  },
  {
    href: "/todos",
    title: "To-Do List",
    desc: "Tugas hari ini dan rencana satu minggu, lengkap dengan prioritas.",
    icon: (
      <svg {...iconProps}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
        <path d="m8 12.5 3 3 5-6" />
      </svg>
    ),
  },
  {
    href: "/issues",
    title: "Issue Log",
    desc: "Catat masalah klien dan penyelesaiannya di satu tempat yang bisa dicari.",
    icon: (
      <svg {...iconProps}>
        <path d="M5 21V4" />
        <path d="M5 4h12l-2 4 2 4H5" />
      </svg>
    ),
  },
];

async function getStats() {
  const supabase = await createClient();
  const [{ count: entries }, { count: openTodos }] = await Promise.all([
    supabase.from("kb_entries").select("id", { count: "exact", head: true }),
    supabase.from("todos").select("id", { count: "exact", head: true }).neq("status", "done"),
  ]);
  return { entries: entries ?? 0, openTodos: openTodos ?? 0 };
}

// Di dalam <Suspense>: hero dan kartu fitur langsung tampil, angka menyusul
// begitu query selesai (nggak menahan seluruh halaman).
async function HomeStats() {
  const stats = await getStats();
  return (
    <dl className="mt-10 grid w-full max-w-xl grid-cols-3 gap-3 text-center">
      {[
        { label: "Modul", value: KB_MODULES.length },
        { label: "Entri Knowledge Base", value: stats.entries },
        { label: "To-Do belum selesai", value: stats.openTodos },
      ].map((s) => (
        <div key={s.label} className="rounded-2xl border border-border bg-background px-3 py-4">
          <dd className="text-2xl font-semibold tracking-tight">{s.value}</dd>
          <dt className="mt-1 text-xs text-muted">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function HomeStatsFallback() {
  return (
    <div aria-hidden="true" className="mt-10 grid w-full max-w-xl animate-pulse grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[74px] rounded-2xl border border-border bg-background" />
      ))}
    </div>
  );
}

const primaryButton =
  "rounded-full bg-accent px-7 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover";
const outlineButton =
  "rounded-full border border-foreground px-7 py-3 text-base font-medium transition-colors hover:bg-surface";

export default async function HomePage() {
  const user = await getAuthUser();

  return (
    <main>
      <section className="bg-surface px-6 pb-20 pt-24 text-center">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Catatan, tugas, dan hari kerjamu. Satu tempat.
          </h1>
          <p className="max-w-xl text-lg text-muted sm:text-xl">
            Workspace pribadi yang tenang untuk mencari referensi, mencatat issue, dan merencanakan
            minggu, tanpa kesan dashboard.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-4">
            {user ? (
              <>
                <Link href="/knowledge-base" className={primaryButton}>
                  Buka Knowledge Base
                </Link>
                <Link href="/todos" className={outlineButton}>
                  Lihat To-Do
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className={primaryButton}>
                  Masuk
                </Link>
                <Link href="/knowledge-base" className={outlineButton}>
                  Buka Knowledge Base
                </Link>
              </>
            )}
          </div>

          {user && (
            <Suspense fallback={<HomeStatsFallback />}>
              <HomeStats />
            </Suspense>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group flex flex-col gap-3 rounded-2xl border border-foreground p-7 transition-colors hover:bg-surface"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-foreground">
                {f.icon}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight">{f.title}</h2>
              <p className="text-base text-muted">{f.desc}</p>
              <span className="mt-1 text-base underline underline-offset-4 group-hover:no-underline">
                Buka ›
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
