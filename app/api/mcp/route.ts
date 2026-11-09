import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/auth";
import { mcpPublicOrigin } from "@/lib/mcp/config";
import { registerTools } from "@/lib/mcp/tools";

// MCP server (Streamable HTTP) untuk Claude.ai. Wajib bearer token OAuth Supabase:
// tanpa token / token tidak sah -> 401 + WWW-Authenticate (resource_metadata), data tidak tersentuh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "rickie-erp", version: "0.1.0" },
});

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  // withMcpAuth memakai ini sebagai ORIGIN + resourceMetadataPath untuk header WWW-Authenticate.
  resourceUrl: mcpPublicOrigin(),
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authed as GET, authed as POST, authed as DELETE };
