import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Jangan generate AGENTS.md / CLAUDE.md otomatis tiap `next dev`.
  agentRules: false,
};

export default nextConfig;
