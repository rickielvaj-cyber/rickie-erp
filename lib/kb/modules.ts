export type KbModuleSlug =
  | "digital-modeling"
  | "master-data"
  | "aact-coa"
  | "purchasing"
  | "inventory"
  | "inventory-accounting"
  | "sales"
  | "ap"
  | "ar"
  | "fa"
  | "gl"
  | "expense-service"
  | "enterprise-report"
  | "issue-log"
  | "studi-kasus"
  | "referensi";

export const KB_MODULES: { slug: KbModuleSlug; label: string }[] = [
  { slug: "digital-modeling", label: "Digital Modeling" },
  { slug: "master-data", label: "Master Data" },
  { slug: "aact-coa", label: "Account & COA" },
  { slug: "purchasing", label: "Purchasing" },
  { slug: "inventory", label: "Inventory" },
  { slug: "inventory-accounting", label: "Inventory Accounting" },
  { slug: "sales", label: "Sales" },
  { slug: "ap", label: "Account Payable" },
  { slug: "ar", label: "Account Receivable" },
  { slug: "fa", label: "Fixed Assets" },
  { slug: "gl", label: "General Ledger" },
  { slug: "expense-service", label: "Expense & Service" },
  { slug: "enterprise-report", label: "Enterprise Report" },
  { slug: "issue-log", label: "Issue Log KB" },
  { slug: "studi-kasus", label: "Studi Kasus" },
  { slug: "referensi", label: "Referensi" },
];

const MODULE_SLUGS = new Set<string>(KB_MODULES.map((m) => m.slug));

export function isKbModuleSlug(value: string): value is KbModuleSlug {
  return MODULE_SLUGS.has(value);
}

export function kbModuleLabel(slug: string): string {
  return KB_MODULES.find((m) => m.slug === slug)?.label ?? slug;
}

// Aliases for common headings in the source docx that don't literally match
// a module label (abbreviations, English/Indonesian variants, etc).
const HEADING_ALIASES: { pattern: RegExp; slug: KbModuleSlug }[] = [
  { pattern: /\bcoa\b|chart of account/i, slug: "aact-coa" },
  { pattern: /account\s*payable|\bap\b/i, slug: "ap" },
  { pattern: /account\s*receivable|\bar\b/i, slug: "ar" },
  { pattern: /fixed\s*asset/i, slug: "fa" },
  { pattern: /general\s*ledger|\bgl\b/i, slug: "gl" },
  { pattern: /issue\s*log/i, slug: "issue-log" },
  { pattern: /studi\s*kasus|case\s*stud/i, slug: "studi-kasus" },
  { pattern: /expense.*service|service.*expense/i, slug: "expense-service" },
  { pattern: /enterprise\s*report/i, slug: "enterprise-report" },
  { pattern: /master\s*data/i, slug: "master-data" },
  { pattern: /digital\s*modeling/i, slug: "digital-modeling" },
  { pattern: /inventory\s*accounting/i, slug: "inventory-accounting" },
];

/** Best-effort match from a docx heading's text to a known module slug. */
export function matchModuleSlug(headingText: string): KbModuleSlug | null {
  const normalized = headingText.toLowerCase().trim();
  if (!normalized) return null;

  const exact = KB_MODULES.find((m) => m.label.toLowerCase() === normalized);
  if (exact) return exact.slug;

  // Longest label first, so "Inventory Accounting" wins over the shorter
  // "Inventory" when a heading contains both.
  const byLabelLengthDesc = [...KB_MODULES].sort((a, b) => b.label.length - a.label.length);
  const contains = byLabelLengthDesc.find((m) => normalized.includes(m.label.toLowerCase()));
  if (contains) return contains.slug;

  for (const { pattern, slug } of HEADING_ALIASES) {
    if (pattern.test(normalized)) return slug;
  }

  return null;
}
