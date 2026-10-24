import { Suspense } from "react";
import Link from "next/link";
import { getAuthUser } from "@/lib/supabase/auth";
import { Dashboard, DashboardFallback } from "@/components/Dashboard";

// Home PUBLIK: hero + kartu fitur nggak memuat data apa pun. Setelah login, home menjadi dashboard
// (components/Dashboard.tsx: hari ini, minggu ini, proyek berjalan); RLS tetap jadi pagar terakhir.

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
    desc: "YonSuite reference by module. Search fast when you are stuck.",
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
    desc: "Today's tasks and the week's plan, with priorities.",
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
    desc: "Record client issues and their fixes in one searchable place.",
    icon: (
      <svg {...iconProps}>
        <path d="M5 21V4" />
        <path d="M5 4h12l-2 4 2 4H5" />
      </svg>
    ),
  },
];

const primaryButton =
  "rounded-full bg-accent px-7 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover";
const outlineButton =
  "rounded-full border border-foreground px-7 py-3 text-base font-medium transition-colors hover:bg-surface";

export default async function HomePage() {
  const user = await getAuthUser();

  if (user) {
    return (
      <main>
        <Suspense fallback={<DashboardFallback />}>
          <Dashboard />
        </Suspense>
      </main>
    );
  }

  return (
    <main>
      <section className="bg-surface px-6 pb-20 pt-24 text-center">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Your notes, tasks, and workday. One place.
          </h1>
          <p className="max-w-xl text-lg text-muted sm:text-xl">
            A calm personal workspace to look up references, log issues, and plan your week, without
            the dashboard feel.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-4">
            <Link href="/login" className={primaryButton}>
              Sign in
            </Link>
            <Link href="/knowledge-base" className={outlineButton}>
              Open Knowledge Base
            </Link>
          </div>
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
                Open ›
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
