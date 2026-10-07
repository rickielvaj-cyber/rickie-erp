import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-foreground bg-background p-10">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Selamat datang kembali</h1>
        <p className="mt-2 text-center text-base text-muted">Masuk ke workspace kamu.</p>

        <form action={login} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="kamu@email.com"
              className="mt-1.5 h-11 w-full rounded-xl border border-foreground px-4 text-base placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 h-11 w-full rounded-xl border border-foreground px-4 text-base focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{error}</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-accent px-4 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Masuk
          </button>
        </form>
      </div>
    </main>
  );
}
