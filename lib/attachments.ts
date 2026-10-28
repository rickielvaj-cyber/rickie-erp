// Lampiran: jenis file yang diizinkan, nama dan jalur penyimpanan, ukuran gambar. Murni (tanpa jaringan) supaya mudah diuji.
// Daftar jenis dan batas ukuran HARUS sama dengan bucket di supabase/migrations/0024_attachments.sql.

export const ATTACHMENT_BUCKET = "attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_PARENT = 10;
export const SIGNED_URL_SECONDS = 60 * 60;

export type AttachmentParent = "issue" | "kb_entry" | "note";
export const PARENT_COLUMN: Record<AttachmentParent, "issue_id" | "kb_entry_id" | "note_id"> = {
  issue: "issue_id",
  kb_entry: "kb_entry_id",
  note: "note_id",
};

/** Ekstensi -> jenis MIME. SVG sengaja tidak ada (bisa memuat skrip). */
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);

export function extensionOf(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(fileName.trim());
  return m ? m[1].toLowerCase() : "";
}

/** MIME yang dipakai saat menyimpan: ditentukan dari EKSTENSI (daftar tetap), bukan dari klaim browser. null = tidak diizinkan. */
export function mimeForName(fileName: string): string | null {
  return TYPES[extensionOf(fileName)] ?? null;
}

export const isImageMime = (mime: string) => mime.startsWith("image/");

/** Nama file yang aman ditampilkan dan disimpan di metadata: tanpa jalur, karakter kontrol, dan terlalu panjang. */
export function cleanFileName(raw: string): string {
  const base = raw.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  if (base.length <= 120) return base;
  const ext = extensionOf(base);
  return ext ? `${base.slice(0, 115 - ext.length)}….${ext}` : `${base.slice(0, 119)}…`;
}

export type FileCheck = { ok: true; fileName: string; mime: string } | { ok: false; error: string };

export function checkFile(rawName: string, sizeBytes: number): FileCheck {
  const fileName = cleanFileName(rawName);
  if (!fileName) return { ok: false, error: "The file has no name." };
  const mime = mimeForName(fileName);
  if (!mime) return { ok: false, error: `“${fileName}”: this file type is not allowed. Use an image, PDF, Excel, Word, CSV or text file.` };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: `“${fileName}” is empty.` };
  if (sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, error: `“${fileName}” is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.` };
  return { ok: true, fileName, mime };
}

/** Jalur di Storage: folder = id pengguna (dicocokkan policy Storage), nama = id acak + ekstensi. */
export function storagePath(userId: string, id: string, ext: string): string {
  return `${userId}/${id}.${ext}`;
}

/** Jalur yang boleh didaftarkan pengguna ini: tepat `<userId>/<uuid>.<ext>` dengan ekstensi yang diizinkan. */
export function isOwnPath(path: string, userId: string): boolean {
  const m = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]{1,5})$/.exec(path);
  return Boolean(m) && m![1] === userId && ALLOWED_EXTENSIONS.includes(m![3]);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Gambar yang terlalu besar dikecilkan sebelum diunggah: sisi terpanjang dibatasi, rasio dipertahankan. */
export const IMAGE_MAX_SIDE = 2000;
export const IMAGE_RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;

export function scaledSize(width: number, height: number, maxSide = IMAGE_MAX_SIDE): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height, scaled: false };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), scaled: true };
}

/** Perlu dikecilkan bila file besar atau pikselnya melebihi batas. GIF dibiarkan (animasi). */
export function shouldCompress(mime: string, sizeBytes: number, width: number, height: number): boolean {
  if (!isImageMime(mime) || mime === "image/gif") return false;
  return sizeBytes > IMAGE_RESIZE_ABOVE_BYTES || Math.max(width, height) > IMAGE_MAX_SIDE;
}
