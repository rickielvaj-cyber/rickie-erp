import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { decideAuthorization } from "./actions";

export const metadata = { title: "Authorize access — Personal Workspace" };

const SCOPE_LABELS: Record<string, string> = {
  openid: "Sign you in (OpenID)",
  email: "See your email address",
  profile: "See your basic profile",
  phone: "See your phone number",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-background p-10 shadow-pop">{children}</div>
    </main>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: authorizationId, error: actionError } = await searchParams;

  if (!authorizationId || authorizationId.length > 200) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Invalid request</h1>
        <p className="mt-2 text-base text-muted">This page must be opened from an app asking for access. The authorization_id is missing.</p>
      </Shell>
    );
  }

  // Wajib login; setelah login kembali ke halaman ini dengan authorization_id yang sama.
  const user = await getAuthUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  }

  const supabase = await createClient();
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !details) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Request not available</h1>
        <p className="mt-2 text-base text-muted">{error?.message ?? "This authorization request is invalid or has expired."} Start again from the app.</p>
      </Shell>
    );
  }

  // Sudah pernah disetujui: tidak perlu layar consent, langsung kembali ke aplikasi peminta.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const scopes = (details.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight">Authorize {details.client.name}?</h1>
      <p className="mt-2 text-base text-muted">
        <strong className="font-medium text-foreground">{details.client.name}</strong> wants to access your workspace as{" "}
        <strong className="font-medium text-foreground">{user.email ?? "your account"}</strong>.
      </p>

      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="font-medium">App</dt>
          <dd className="mt-0.5 text-muted">{details.client.name}</dd>
        </div>
        <div>
          <dt className="font-medium">Returns to</dt>
          <dd className="mt-0.5 break-all text-muted">{details.redirect_uri}</dd>
        </div>
        <div>
          <dt className="font-medium">Requested permissions</dt>
          <dd className="mt-0.5 text-muted">
            {scopes.length === 0 ? (
              "None listed (basic access)"
            ) : (
              <ul className="list-disc pl-5">
                {scopes.map((scope) => (
                  <li key={scope}>
                    {SCOPE_LABELS[scope] ?? scope} <span className="text-subtle">({scope})</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
        Approving lets this app read and change your data in this workspace (to-dos, goals, issues) with your permissions.
        Only approve apps you trust.
      </p>

      {actionError ? <p className="mt-4 rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">{actionError}</p> : null}

      <form action={decideAuthorization} className="mt-6 flex gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button
          type="submit"
          name="decision"
          value="deny"
          className="flex-1 rounded-full border border-border-strong px-4 py-3 text-base font-medium hover:bg-surface"
        >
          Deny
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          className="flex-1 rounded-full bg-accent px-4 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Approve
        </button>
      </form>
    </Shell>
  );
}
