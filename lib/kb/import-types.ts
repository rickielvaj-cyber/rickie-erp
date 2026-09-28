import type { ParsedSection } from "./parse";

export type ParseKbDocxResult =
  | { ok: true; sections: ParsedSection[] }
  | { ok: false; error: string };

export type SaveKbImportInput = {
  sections: { heading: string; markdown: string; slug: string }[];
};

export type SaveKbImportResult =
  | { ok: true; savedModules: string[] }
  | { ok: false; error: string };
