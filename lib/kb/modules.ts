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
  "pengantar": "Introduction",
  "fondasi-erp": "Chapter 1 — ERP & Accounting Foundations",
  "digital-modeling": "Chapter 2 — Digital Modeling",
  "master-data": "Chapter 3 — Master Data",
  "accounting-common": "Chapter 4 — Accounting Common",
  "purchasing": "Chapter 5 — Purchasing",
  "sales": "Chapter 6 — Sales",
  "inventory": "Chapter 7 — Inventory Management",
  "inventory-accounting": "Chapter 8 — Inventory Accounting",
  "ap": "Chapter 9 — Accounts Payable",
  "ar": "Chapter 10 — Accounts Receivable",
  "gl": "Chapter 11 — General Ledger",
  "fixed-assets": "Chapter 12 — Fixed Assets",
  "expense-service": "Chapter 13 — Expense Service",
  "enterprise-report": "Chapter 14 — Enterprise Report",
  "troubleshooting": "Chapter 15 — Troubleshooting",
  "studi-kasus": "Chapter 16 — Case Studies",
  "lampiran": "Appendix",
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
