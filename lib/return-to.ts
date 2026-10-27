// "Kembali ke asal": halaman yang dibuka dari halaman lain (mis. edit to-do dari halaman Proyek, tambah klien dari form Proyek)
// membawa `from=<path>` supaya tombol Batal/Kembali dan hasil simpan kembali ke tempat asal, bukan ke halaman bawaan.
// `from` datang dari URL (tidak dipercaya): hanya path relatif di situs ini yang diterima, untuk mencegah open redirect.

/** Path relatif yang aman ("/projects/abc", "/projects?new=1"), atau null. Menolak URL penuh, "//host", backslash, dan karakter kontrol. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return null;
  } catch {
    return null;
  }
  return raw;
}

/** Tambahkan `from` ke sebuah path (query yang sudah ada dipertahankan). `from` yang tidak aman diabaikan. */
export function withFrom(path: string, from: string | null | undefined): string {
  const safe = safeReturnPath(from);
  if (!safe) return path;
  return `${path}${path.includes("?") ? "&" : "?"}from=${encodeURIComponent(safe)}`;
}

/** Tambahkan parameter query ke path yang mungkin sudah punya query. */
export function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

const LABELS: [RegExp, string][] = [
  [/^\/projects\/[^/?#]+/, "Project"],
  [/^\/projects(\/|\?|$)/, "Projects"],
  [/^\/todos/, "To-Do List"],
  [/^\/issues/, "Issue Log"],
  [/^\/goals\/[^/?#]+/, "Goal"],
  [/^\/goals/, "Goals"],
  [/^\/notes/, "Notes"],
  [/^\/summary/, "Weekly Summary"],
  [/^\/$/, "Home"],
];

/** Nama tujuan untuk tombol "‹ Project": dari path, atau "Back" bila tidak dikenal. */
export function returnLabel(path: string | null): string {
  if (!path) return "Back";
  return LABELS.find(([re]) => re.test(path))?.[1] ?? "Back";
}
