// Logika papan mingguan (seret to-do antar hari dan ubah urutan). Murni, tanpa React/dnd-kit, supaya mudah diuji.
// `items` = tanggal (YYYY-MM-DD, juga dipakai sebagai id kolom) -> daftar id to-do berurutan.

export type BoardItems = Record<string, string[]>;

/** Kolom tempat `id` berada; bila `id` sendiri adalah id kolom (mis. lepas di area kosong kartu hari), kolom itu. */
export function findContainer(items: BoardItems, id: string): string | undefined {
  if (id in items) return id;
  return Object.keys(items).find((key) => items[key].includes(id));
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Terapkan satu langkah seret: `activeId` dilepas/melewati `overId` (to-do lain atau kolom hari).
 * - kolom sama: ubah urutan (geser ke posisi to-do yang dilewati);
 * - kolom berbeda: pindahkan ke kolom itu, di posisi to-do yang dilewati (atau paling bawah bila yang dilewati kolomnya).
 * Mengembalikan objek baru; `items` tidak diubah.
 */
export function applyDrag(items: BoardItems, activeId: string, overId: string): BoardItems {
  const from = findContainer(items, activeId);
  const to = findContainer(items, overId);
  if (!from || !to || activeId === overId) return items;

  if (from === to) {
    if (overId === to) return items; // dilepas di kolomnya sendiri (bukan di atas to-do lain): urutan tetap
    const fromIndex = items[from].indexOf(activeId);
    const toIndex = items[to].indexOf(overId);
    return fromIndex === toIndex ? items : { ...items, [from]: arrayMove(items[from], fromIndex, toIndex) };
  }

  const target = items[to].slice();
  const overIndex = overId === to ? -1 : target.indexOf(overId);
  target.splice(overIndex === -1 ? target.length : overIndex, 0, activeId);
  return { ...items, [from]: items[from].filter((id) => id !== activeId), [to]: target };
}

/** Apakah `after` berbeda dari `before` untuk kolom tujuan (pindah hari atau urutan berubah)? */
export function placementChanged(before: BoardItems, after: BoardItems, activeId: string): boolean {
  const from = findContainer(before, activeId);
  const to = findContainer(after, activeId);
  if (!from || !to) return false;
  return from !== to || before[to].join() !== after[to].join();
}

/** Susun daftar to-do menjadi papan: id per tanggal, mengikuti urutan `todos` (yang sudah diurutkan server). */
export function buildBoard(todos: { id: string; due_date: string | null }[], days: string[]): BoardItems {
  const board: BoardItems = Object.fromEntries(days.map((d) => [d, [] as string[]]));
  for (const t of todos) if (t.due_date && t.due_date in board) board[t.due_date].push(t.id);
  return board;
}
