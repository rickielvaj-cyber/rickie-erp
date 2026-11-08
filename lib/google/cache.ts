// Cache kecil di memori (per instance server) untuk hasil Google yang mahal: token akses dan tampilan kalender satu minggu.
// Tanpa ini, SETIAP klik di To-Do (centang, tambah) merender ulang halaman dan memanggil Google lagi (tukar token + ambil acara
// + acara kalender lain + sinkron), sehingga klik terasa lambat. Salah satu instance bisa basi paling lama `ttl`; penulisan
// acara dari situs ini mengosongkan cache pengguna itu lewat `bustUser`.

type Entry = { at: number; value?: unknown; pending?: Promise<unknown>; refreshing?: boolean };

const MAX_ENTRIES = 200;
const store = new Map<string, Entry>();

/** Hasil `load` untuk `key`, dipakai ulang sampai `ttlMs` berlalu. Panggilan serentak berbagi satu `load`; galat tidak disimpan. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = store.get(key);
  if (hit) {
    if (hit.pending) return hit.pending as Promise<T>;
    if (now() - hit.at < ttlMs) return hit.value as T;
  }
  const pending = load().then(
    (value) => {
      store.set(key, { at: now(), value });
      return value;
    },
    (error) => {
      store.delete(key);
      throw error;
    },
  );
  store.set(key, { at: now(), pending });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return pending;
}

/**
 * Seperti `cached`, tetapi hasil yang sudah lewat `ttlMs` (dan belum lewat `maxStaleMs`) langsung dikembalikan, sementara penyegarannya
 * dijadwalkan lewat `schedule` (mis. `after()` Next.js: berjalan setelah respons terkirim). Jadi pemanggil tidak menunggu sumber yang
 * lambat kecuali saat belum ada hasil sama sekali. Penyegaran yang gagal dibiarkan (hasil lama tetap dipakai sampai kedaluwarsa total).
 */
export async function cachedSWR<T>(
  key: string,
  ttlMs: number,
  maxStaleMs: number,
  load: () => Promise<T>,
  schedule: (task: () => Promise<void>) => void,
  now: () => number = Date.now,
): Promise<T> {
  const hit = store.get(key);
  if (hit && !hit.pending) {
    const age = now() - hit.at;
    if (age < ttlMs) return hit.value as T;
    if (age < maxStaleMs) {
      if (!hit.refreshing) {
        hit.refreshing = true;
        schedule(async () => {
          try {
            const value = await load();
            store.set(key, { at: now(), value });
          } catch (error) {
            // Hasil lama tetap dipakai sampai batas basi; catat supaya kegagalan tidak diam-diam.
            console.error(`[cache] background refresh failed for ${key.split("|").slice(1).join("|")}:`, error instanceof Error ? error.message : error);
          } finally {
            const current = store.get(key);
            if (current) current.refreshing = false;
          }
        });
      }
      return hit.value as T;
    }
  }
  return cached(key, ttlMs, load, now);
}

/** Simpan hasil yang sudah dihitung pemanggil (untuk hasil yang tidak boleh disimpan bila gagal). */
export function put(key: string, value: unknown, now: () => number = Date.now): void {
  store.set(key, { at: now(), value });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

/** Hasil segar (belum kedaluwarsa) untuk key ini, atau undefined. Tidak memicu pemuatan. */
export function peek<T>(key: string, ttlMs: number, now: () => number = Date.now): T | undefined {
  const hit = store.get(key);
  return hit && !hit.pending && now() - hit.at < ttlMs ? (hit.value as T) : undefined;
}

/** Kosongkan semua isi cache milik satu pengguna (token + kalender), mis. setelah menulis acara atau memutus Google. */
export function bustUser(userId: string): void {
  for (const key of Array.from(store.keys())) if (key.startsWith(`${userId}|`)) store.delete(key);
}

/** Kosongkan hanya tampilan kalender pengguna (token tetap dipakai), mis. setelah menulis acara dari situs ini. */
export function bustCalendar(userId: string): void {
  for (const key of Array.from(store.keys())) if (key.startsWith(`${userId}|state|`)) store.delete(key);
}

/** Hanya untuk tes. */
export function clearCache(): void {
  store.clear();
}
