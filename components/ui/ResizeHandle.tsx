"use client";

import { useRef } from "react";

/**
 * Pegangan untuk menarik tinggi sebuah kotak (mouse, sentuh, atau keyboard). `targetRef` = elemen yang diukur saat mulai menarik;
 * `onResize` menerima tinggi baru (px). Klik dua kali atau tombol Home mengembalikan ke ukuran bawaan (`onReset`).
 */
export function ResizeHandle({
  targetRef,
  onResize,
  onReset,
  min,
  max,
  label,
  measureFirstChild = false,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  onResize: (px: number) => void;
  onReset: () => void;
  min: number;
  max: number;
  label: string;
  /** Ukur anak pertama target (mis. satu kartu), bukan seluruh target (mis. satu baris kartu yang bisa bertumpuk di layar sempit). */
  measureFirstChild?: boolean;
}) {
  const start = useRef<{ y: number; h: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const currentHeight = () => {
    const el = targetRef.current;
    const target = measureFirstChild ? (el?.firstElementChild ?? el) : el;
    return target?.getBoundingClientRect().height ?? min;
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className="group mt-1 flex h-4 cursor-ns-resize touch-none select-none items-center justify-center rounded-lg outline-none transition-colors hover:bg-surface focus-visible:bg-surface"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, h: currentHeight() };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s) onResize(clamp(s.h + (e.clientY - s.y)));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 120 : 40;
        if (e.key === "ArrowDown") onResize(clamp(currentHeight() + step));
        else if (e.key === "ArrowUp") onResize(clamp(currentHeight() - step));
        else if (e.key === "Home") onReset();
        else return;
        e.preventDefault();
      }}
    >
      <span aria-hidden="true" className="h-1 w-12 rounded-full bg-border-strong transition-colors group-hover:bg-muted group-focus-visible:bg-accent" />
    </div>
  );
}
