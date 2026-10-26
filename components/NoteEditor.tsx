"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteNote, fetchNote, saveNote, setNotePinned, type SaveResult } from "@/app/(dashboard)/notes/actions";
import { NOTE_MAX_CHARS } from "@/lib/notes";

export type NoteDraft = { id: string | null; body: string; clientId: string | null; pinned: boolean; updatedAt: string | null };
export type ClientOption = { id: string; name: string };

type Status = "idle" | "saving" | "saved" | "error" | "conflict";

const AUTOSAVE_MS = 700;
/** Seberapa sering editor yang terbuka memeriksa perubahan dari perangkat lain (hanya saat tab terlihat dan tidak ada ketikan yang belum tersimpan). */
const REMOTE_POLL_MS = 4000;

/**
 * Editor satu catatan dengan simpan otomatis (jeda 0,7 detik setelah berhenti mengetik, saat fokus pindah, dan saat tab
 * disembunyikan). Penyimpanan berjalan satu per satu (antrean) supaya catatan baru selalu dibuat dulu sebelum diperbarui.
 */
export function NoteEditor({ initial, clients }: { initial: NoteDraft; clients: ClientOption[] }) {
  const router = useRouter();
  const [body, setBody] = useState(initial.body);
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [pinned, setPinned] = useState(initial.pinned);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const idRef = useRef(initial.id);
  const baseRef = useRef(initial.updatedAt);
  const latest = useRef({ body: initial.body, clientId: initial.clientId ?? "" });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const stopped = useRef(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const inflight = useRef(0);
  const polling = useRef(false);

  const fit = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  };
  useEffect(fit, [body]);

  const runSave = () => {
    chain.current = chain.current.then(async () => {
      if (!dirty.current || stopped.current) return;
      const snapshot = { ...latest.current };
      // Catatan baru yang masih kosong tidak disimpan.
      if (idRef.current === null && snapshot.body.trim() === "") {
        dirty.current = false;
        return;
      }
      setStatus("saving");
      inflight.current++;
      const result = await saveNote(idRef.current, baseRef.current, { body: snapshot.body, clientId: snapshot.clientId || null }).catch(
        (): SaveResult => ({ ok: false, error: "Could not reach the server. Your text is still on this screen." }),
      ).finally(() => {
        inflight.current--;
      });
      if (result.ok) {
        const wasNew = idRef.current === null;
        idRef.current = result.id;
        baseRef.current = result.updatedAt;
        if (latest.current.body === snapshot.body && latest.current.clientId === snapshot.clientId) dirty.current = false;
        setStatus(dirty.current ? "saving" : "saved");
        setMessage(null);
        if (wasNew) window.history.replaceState(null, "", `/notes/${result.id}`);
        if (dirty.current) runSave();
      } else if (result.conflict) {
        stopped.current = true;
        setStatus("conflict");
        setMessage(result.error);
      } else {
        setStatus("error");
        setMessage(result.error);
      }
    });
  };

  const schedule = () => {
    dirty.current = true;
    if (stopped.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(runSave, AUTOSAVE_MS);
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) runSave();
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current && !stopped.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perubahan dari perangkat lain (mis. diketik di HP) muncul sendiri di sini, selama di sini tidak ada ketikan yang belum
  // tersimpan. Kalau ada, simpan berikutnya akan ditolak sebagai bentrok (lihat saveNote), jadi tulisan tidak saling menimpa.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible" || polling.current || stopped.current) return;
      if (idRef.current === null || dirty.current || inflight.current > 0) return;
      polling.current = true;
      try {
        const remote = await fetchNote(idRef.current);
        if (!remote.ok || dirty.current || inflight.current > 0 || stopped.current) return;
        if (remote.note === null) {
          stopped.current = true;
          setStatus("conflict");
          setMessage("This note was deleted on another device.");
          return;
        }
        if (remote.note.updatedAt === baseRef.current) return;
        const el = area.current;
        const caret = el ? Math.min(el.selectionStart, remote.note.body.length) : 0;
        baseRef.current = remote.note.updatedAt;
        latest.current = { body: remote.note.body, clientId: remote.note.clientId ?? "" };
        setBody(remote.note.body);
        setClientId(remote.note.clientId ?? "");
        setPinned(remote.note.pinned);
        setNotice("Updated from another device");
        setTimeout(() => setNotice(null), 4000);
        if (el && document.activeElement === el) requestAnimationFrame(() => el.setSelectionRange(caret, caret));
      } finally {
        polling.current = false;
      }
    };
    const timer = setInterval(check, REMOTE_POLL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const onBody = (value: string) => {
    setBody(value);
    latest.current.body = value;
    schedule();
  };
  const onClient = (value: string) => {
    setClientId(value);
    latest.current.clientId = value;
    schedule();
  };

  const togglePin = async () => {
    flush();
    await chain.current;
    if (!idRef.current) return; // belum ada isi: tidak ada yang disematkan
    const next = !pinned;
    const result = await setNotePinned(idRef.current, next);
    if (result.ok) {
      baseRef.current = result.updatedAt;
      setPinned(next);
    } else {
      setStatus("error");
      setMessage("Could not pin the note.");
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this note?")) return;
    stopped.current = true;
    dirty.current = false;
    if (timer.current) clearTimeout(timer.current);
    await chain.current;
    if (idRef.current) {
      const result = await deleteNote(idRef.current);
      if (!result.ok) {
        stopped.current = false;
        setStatus("error");
        setMessage("Could not delete the note.");
        return;
      }
    }
    router.push("/notes");
    router.refresh();
  };

  const statusText =
    status === "saving" ? "Saving…" : status === "conflict" || status === "error" ? "Not saved" : (notice ?? (status === "saved" ? "Saved" : ""));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/notes" onClick={flush} className="text-base text-muted hover:text-foreground">
          ‹ Notes
        </Link>
        <div className="flex items-center gap-2">
          <span role="status" aria-live="polite" className={`text-sm ${status === "error" || status === "conflict" ? "text-danger" : "text-muted"}`}>
            {statusText}
          </span>
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              pinned ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:border-foreground hover:text-foreground"
            }`}
          >
            {pinned ? "Pinned" : "Pin"}
          </button>
          <button
            type="button"
            onClick={remove}
            className="rounded-full border border-border px-3.5 py-1.5 text-sm text-muted transition-colors hover:border-danger hover:text-danger"
          >
            Delete
          </button>
        </div>
      </div>

      {message && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">
          <span>{message}</span>
          {status === "conflict" && (
            <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-danger px-3 py-1">
              Reload
            </button>
          )}
        </div>
      )}

      <textarea
        ref={area}
        value={body}
        onChange={(e) => onBody(e.target.value)}
        onBlur={flush}
        autoFocus={initial.id === null}
        maxLength={NOTE_MAX_CHARS}
        aria-label="Note"
        placeholder="Start typing. The first line becomes the title."
        className="mt-5 block w-full resize-none rounded-none border-0 bg-transparent p-0 text-lg leading-relaxed placeholder:text-muted focus:outline-none"
        style={{ minHeight: "20rem" }}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <label htmlFor="note-client" className="text-sm text-muted">
          Client
        </label>
        <select
          id="note-client"
          value={clientId}
          onChange={(e) => onClient(e.target.value)}
          className="h-10 min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-base focus:border-foreground focus:outline-none"
        >
          <option value="">None</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
