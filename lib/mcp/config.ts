// Konfigurasi MCP server (Fase: Claude.ai -> ERP lewat OAuth Supabase).

/** Origin publik situs. Bawaan = produksi; MCP_PUBLIC_ORIGIN (opsional) hanya untuk menguji di domain lain (mis. preview). */
export function mcpPublicOrigin(): string {
  return (process.env.MCP_PUBLIC_ORIGIN || "https://beginner-erp-guide.vercel.app").replace(/\/+$/, "");
}

/** Identitas resource MCP (RFC 9728 / RFC 8707): URL endpoint MCP-nya. */
export function mcpResourceUrl(): string {
  return `${mcpPublicOrigin()}/api/mcp`;
}

/** Issuer Supabase Auth, mis. https://<ref>.supabase.co/auth/v1. Sama dengan klaim `iss` di access token. */
export function supabaseIssuer(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  return `${url.replace(/\/+$/, "")}/auth/v1`;
}
