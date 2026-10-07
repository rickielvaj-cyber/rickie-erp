export type KbModuleSlug =
  | "pengantar"
  | "fondasi-erp"
  | "digital-modeling"
  | "master-data"
  | "accounting-common"
  | "purchasing"
  | "sales"
  | "inventory"
  | "inventory-accounting"
  | "ap"
  | "ar"
  | "gl"
  | "fixed-assets"
  | "expense-service"
  | "enterprise-report"
  | "troubleshooting"
  | "studi-kasus"
  | "lampiran";

export const MODULE_LABELS: Record<KbModuleSlug, string> = {
  "pengantar": "Pengantar",
  "fondasi-erp": "Bab 1 — Fondasi ERP & Akuntansi",
  "digital-modeling": "Bab 2 — Digital Modeling",
  "master-data": "Bab 3 — Master Data",
  "accounting-common": "Bab 4 — Accounting Common",
  "purchasing": "Bab 5 — Purchasing",
  "sales": "Bab 6 — Sales",
  "inventory": "Bab 7 — Inventory Management",
  "inventory-accounting": "Bab 8 — Inventory Accounting",
  "ap": "Bab 9 — Accounts Payable",
  "ar": "Bab 10 — Accounts Receivable",
  "gl": "Bab 11 — General Ledger",
  "fixed-assets": "Bab 12 — Fixed Assets",
  "expense-service": "Bab 13 — Expense Service",
  "enterprise-report": "Bab 14 — Enterprise Report",
  "troubleshooting": "Bab 15 — Troubleshooting",
  "studi-kasus": "Bab 16 — Studi Kasus",
  "lampiran": "Lampiran",
};

export const KB_MODULES: { slug: KbModuleSlug; label: string }[] = (
  Object.entries(MODULE_LABELS) as [KbModuleSlug, string][]
).map(([slug, label]) => ({ slug, label }));

const MODULE_SLUGS = new Set<string>(KB_MODULES.map((m) => m.slug));

export function isKbModuleSlug(value: string): value is KbModuleSlug {
  return MODULE_SLUGS.has(value);
}

export function kbModuleLabel(slug: string): string {
  return MODULE_LABELS[slug as KbModuleSlug] ?? slug;
}
