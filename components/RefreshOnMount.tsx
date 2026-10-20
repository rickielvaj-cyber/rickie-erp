"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Dirender hanya saat server baru saja menyamakan data (mis. to-do mengikuti blok yang digeser di Google): muat ulang sekali. */
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
