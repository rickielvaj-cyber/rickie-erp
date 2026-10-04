// Reading progress, stored client-side only (localStorage) — no DB column
// for it. Per-browser/per-device, which is what was asked for. Every access
// is wrapped in try/catch: private browsing, blocked storage, or quota
// errors should degrade to "no progress tracked", never crash the page.

export type LastVisited = {
  module: string;
  id: string;
  title: string;
  visitedAt: string;
};

const READ_ENTRIES_KEY = "kb-read-entries";
const LAST_VISITED_KEY = "kb-last-visited";

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — nothing we can do if storage is unavailable
  }
}

export function getReadEntryIds(): Set<string> {
  const raw = safeGetItem(READ_ENTRIES_KEY);
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function markEntryRead(entryId: string): void {
  const current = getReadEntryIds();
  if (current.has(entryId)) return;
  current.add(entryId);
  safeSetItem(READ_ENTRIES_KEY, JSON.stringify(Array.from(current)));
}

export function getLastVisited(): LastVisited | null {
  const raw = safeGetItem(LAST_VISITED_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LastVisited> | null;
    if (
      parsed &&
      typeof parsed.module === "string" &&
      typeof parsed.id === "string" &&
      typeof parsed.title === "string" &&
      typeof parsed.visitedAt === "string"
    ) {
      return parsed as LastVisited;
    }
    return null;
  } catch {
    return null;
  }
}

export function setLastVisited(entry: Omit<LastVisited, "visitedAt">): void {
  const value: LastVisited = { ...entry, visitedAt: new Date().toISOString() };
  safeSetItem(LAST_VISITED_KEY, JSON.stringify(value));
}
