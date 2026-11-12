import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/auth";
import { mcpPublicOrigin } from "@/lib/mcp/config";
import { registerTools } from "@/lib/mcp/tools";

// MCP server (Streamable HTTP) untuk Claude.ai. Wajib bearer token OAuth Supabase:
// tanpa token / token tidak sah -> 401 + WWW-Authenticate (resource_metadata), data tidak tersentuh.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Permintaan MCP yang sehat selesai dalam hitungan detik. Sebelumnya yang menggantung dipotong baru di 300 detik (batas Hobby);
// 30 detik cukup longgar untuk satu panggilan tool dan membuat yang menggantung gagal cepat serta terlihat di log.
export const maxDuration = 30;

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "rickie-erp", version: "0.1.0" },
});

const authed = withMcpAuth(handler, verifyToken, {
  required: true,
  // withMcpAuth memakai ini sebagai ORIGIN + resourceMetadataPath untuk header WWW-Authenticate.
  resourceUrl: mcpPublicOrigin(),
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

// Diagnosis timeout: satu baris "start" saat permintaan masuk dan satu baris "done" saat respons siap. Permintaan yang menggantung
// meninggalkan "start" tanpa "done". Hanya metode HTTP, metode JSON-RPC, nama tool, status, jenis isi, dan durasi dicatat; tidak ada
// token, argumen tool, atau isi data.
async function rpcLabel(req: Request): Promise<string> {
  if (req.method !== "POST") return "-";
  try {
    const body = (await req.clone().json()) as { method?: unknown; params?: { name?: unknown } } | unknown[];
    if (Array.isArray(body)) return `batch(${body.length})`;
    const method = typeof body?.method === "string" ? body.method : "-";
    const tool = method === "tools/call" && typeof body?.params?.name === "string" ? `:${body.params.name}` : "";
    return `${method}${tool}`.slice(0, 80);
  } catch {
    return "unparsed";
  }
}

async function logged(req: Request): Promise<Response> {
  const started = Date.now();
  const label = `${req.method} ${await rpcLabel(req)}`;
  console.log(`[mcp] start ${label}`);
  try {
    const res = await authed(req);
    const type = res.headers.get("content-type") ?? "-";
    console.log(`[mcp] done ${label} status=${res.status} type=${type} ${Date.now() - started}ms`);
    // Respons berbentuk aliran (text/event-stream) "selesai" saat header siap; catat juga kapan alirannya ditutup atau diputus klien.
    // Aliran yang tidak pernah ditutup (sampai dipotong batas durasi) meninggalkan "done" tanpa "closed".
    if (res.body && type.includes("text/event-stream")) {
      const reader = res.body.getReader();
      const watched = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[mcp] closed ${label} ${Date.now() - started}ms`);
            controller.close();
          } else {
            controller.enqueue(value);
          }
        },
        cancel(reason) {
          console.log(`[mcp] cancelled ${label} ${Date.now() - started}ms`);
          return reader.cancel(reason);
        },
      });
      return new Response(watched, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    return res;
  } catch (error) {
    console.error(`[mcp] error ${label} ${Date.now() - started}ms ${error instanceof Error ? error.message : "unknown"}`);
    throw error;
  }
}

export { logged as GET, logged as POST, logged as DELETE };
