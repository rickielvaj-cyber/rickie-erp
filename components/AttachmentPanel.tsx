"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerAttachment, removeAttachment } from "@/app/(dashboard)/attachments/actions";
import { ACCEPT, ATTACHMENT_BUCKET, MAX_ATTACHMENTS_PER_PARENT, extensionOf, formatSize, isImageMime, storagePath, type AttachmentParent } from "@/lib/attachments";
import type { AttachmentView } from "@/lib/attachments-server";
import { prepareUpload } from "@/lib/image-prepare";

/**
 * Lampiran satu induk (issue, entri KB, atau catatan): tombol pilih file, seret-lepas, dan tempel screenshot dari clipboard.
 * File diunggah langsung dari browser ke Storage (jalur folder milik pengguna; dijaga policy Storage), lalu didaftarkan lewat
 * server action yang memeriksa ulang semuanya. `capturePaste` = tempelan gambar di mana pun di halaman ikut masuk ke sini;
 * hanya untuk halaman yang punya SATU panel (editor catatan, form edit issue).
 */
export function AttachmentPanel({
  parent,
  parentId,
  userId,
  initial,
  capturePaste = false,
  label = "Attachments",
}: {
  parent: AttachmentParent;
  parentId: string;
  userId: string;
  initial: AttachmentView[];
  capturePaste?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AttachmentView[]>(initial);
  const [busy, setBusy] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  // Daftar dari server menang bila berubah (mis. setelah router.refresh); tanpa effect, supaya tidak ada render ganda.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setItems(initial);
  }

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setErrors([]);
    const problems: string[] = [];
    let count = items.length;
    for (const file of files) {
      if (count >= MAX_ATTACHMENTS_PER_PARENT) {
        problems.push(`At most ${MAX_ATTACHMENTS_PER_PARENT} attachments per item.`);
        break;
      }
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setBusy((b) => [...b, key]);
      try {
        const prepared = await prepareUpload(file);
        const path = storagePath(userId, crypto.randomUUID(), extensionOf(prepared.fileName));
        const { error } = await createClient().storage.from(ATTACHMENT_BUCKET).upload(path, prepared.blob, { contentType: prepared.mime, upsert: false });
        if (error) throw new Error(error.message);
        const result = await registerAttachment({ parent, parentId, path, fileName: prepared.fileName, size: prepared.blob.size });
        if (!result.ok) throw new Error(result.error);
        count++;
        setItems((prev) => [...prev, result.attachment]);
      } catch (e) {
        problems.push(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy((b) => b.filter((k) => k !== key));
      }
    }
    setErrors(problems);
    router.refresh();
  };

  // Tempel screenshot dari clipboard (Ctrl/Cmd+V). Hanya bila clipboard berisi FILE; teks biasa tidak disentuh.
  const onPasteFiles = (e: ClipboardEvent | React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void upload(files);
  };
  useEffect(() => {
    if (!capturePaste) return;
    const handler = (e: ClipboardEvent) => onPasteFiles(e);
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturePaste, parentId]);

  const remove = async (item: AttachmentView) => {
    if (!window.confirm(`Remove “${item.fileName}”?`)) return;
    const result = await removeAttachment(item.id);
    if (result.ok) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      router.refresh();
    } else setErrors([result.error]);
  };

  return (
    <section aria-label={label} className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">
          {label}
          {items.length > 0 ? ` · ${items.length}` : ""}
        </h3>
      </div>

      {items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {items.map((item) => (
            <li key={item.id} className="group relative">
              {isImageMime(item.mime) && item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" title={`${item.fileName} · ${formatSize(item.size)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.fileName} loading="lazy" className="h-24 w-24 rounded-xl border border-border object-cover" />
                </a>
              ) : (
                <a
                  href={item.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-24 w-40 flex-col justify-between rounded-xl border border-border p-3 text-sm hover:border-foreground"
                >
                  <span className="line-clamp-2 break-all">{item.fileName}</span>
                  <span className="text-xs text-muted">
                    {extensionOf(item.fileName).toUpperCase()} · {formatSize(item.size)}
                    {item.url ? "" : " · unavailable"}
                  </span>
                </a>
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item.fileName}`}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-xs text-muted shadow-sm transition-colors hover:border-danger hover:text-danger"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        tabIndex={0}
        role="button"
        aria-label={`Add files to ${label}: click, drop files, or paste a screenshot`}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onPaste={capturePaste ? undefined : onPasteFiles}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`mt-2 cursor-pointer rounded-xl border border-dashed px-4 py-3 text-sm text-muted transition-colors hover:border-foreground focus:border-foreground focus:outline-none ${
          over ? "border-foreground bg-surface" : "border-border"
        }`}
      >
        {busy.length > 0
          ? `Uploading ${busy.length} ${busy.length === 1 ? "file" : "files"}…`
          : capturePaste
            ? "Click to add files, drop them here, or paste a screenshot (Ctrl+V)"
            : "Click to add files, drop them here, or click here and paste a screenshot"}
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-sm text-danger">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
