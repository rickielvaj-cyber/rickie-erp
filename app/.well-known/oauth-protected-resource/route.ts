import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { mcpResourceUrl, supabaseIssuer } from "@/lib/mcp/config";

// RFC 9728: memberi tahu klien MCP (Claude.ai) bahwa token untuk /api/mcp diterbitkan oleh Supabase Auth.
export const dynamic = "force-dynamic";

// Dibuat per permintaan (bukan di level modul) supaya env var baru dibaca saat runtime, bukan saat build.
export function GET(req: Request) {
  return protectedResourceHandler({
    authServerUrls: [supabaseIssuer()],
    resourceUrl: mcpResourceUrl(),
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
