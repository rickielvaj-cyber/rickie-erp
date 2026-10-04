// One-time Phase 2 seed script. Run locally (NOT on Vercel/CI — it needs the
// service_role key, which must never be committed or set as a public env var):
//
//   npx tsx scripts/seed-kb.ts
//
// Requires, in your local .env.local (not committed):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (Settings -> API -> service_role, bypasses RLS)
//   SEED_USER_ID                (Authentication -> Users -> your user's UUID)
//
// Reads data/kb_seed_phase2.json (also not committed — see data/README.md).

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isKbModuleSlug } from "../lib/kb/modules";

function loadEnvLocal() {
  const envPath = resolve(__dirname, "../.env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

type SeedEntry = { module: string; title: string; content: string };

async function seed() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const seedUserId = process.env.SEED_USER_ID;

  if (!supabaseUrl || !serviceRoleKey || !seedUserId) {
    console.error(
      "Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_USER_ID in .env.local.",
    );
    process.exit(1);
  }

  const seedPath = resolve(__dirname, "../data/kb_seed_phase2.json");
  if (!existsSync(seedPath)) {
    console.error(`Seed file not found at ${seedPath}. See data/README.md.`);
    process.exit(1);
  }

  const seedData = JSON.parse(readFileSync(seedPath, "utf-8")) as { entries: SeedEntry[] };
  if (!Array.isArray(seedData.entries)) {
    console.error("Seed file malformed: expected { entries: [...] }.");
    process.exit(1);
  }

  const invalid = seedData.entries.filter(
    (e) => !isKbModuleSlug(e.module) || !e.title?.trim() || !e.content?.trim(),
  );
  if (invalid.length > 0) {
    console.error(`${invalid.length} entries failed validation (bad module slug or empty title/content):`);
    for (const e of invalid.slice(0, 10)) {
      console.error(`  - module=${JSON.stringify(e.module)} title=${JSON.stringify(e.title)}`);
    }
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const rows = seedData.entries.map((e) => ({
    user_id: seedUserId,
    module: e.module,
    title: e.title.trim(),
    content: e.content.trim(),
  }));

  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("kb_entries").insert(batch);

    if (error) {
      console.error(`Batch ${i / batchSize + 1} failed:`, error.message);
      console.error(`Stopped after ${inserted}/${rows.length} entries inserted.`);
      process.exit(1);
    }

    inserted += batch.length;
    console.log(`Inserted batch ${i / batchSize + 1} (${inserted}/${rows.length} total)`);
  }

  console.log(`Seed complete: ${inserted} entries inserted.`);
}

seed();
