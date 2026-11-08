// Warna blok kalender. Memakai 11 warna acara bawaan Google Calendar (`colorId` 1-11), jadi pilihan di sini ikut tampil di Google Calendar
// (HP maupun web) dan sebaliknya, tanpa penyimpanan tambahan di situs ini. Kosong = warna bawaan kalender (di sini biru navy situs).

export type EventColor = { id: string; name: string; hex: string };

export const EVENT_COLORS: EventColor[] = [
  { id: "11", name: "Tomato", hex: "#d50000" },
  { id: "4", name: "Flamingo", hex: "#e67c73" },
  { id: "6", name: "Tangerine", hex: "#f4511e" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "10", name: "Basil", hex: "#0b8043" },
  { id: "2", name: "Sage", hex: "#33b679" },
  { id: "7", name: "Peacock", hex: "#039be5" },
  { id: "9", name: "Blueberry", hex: "#3f51b5" },
  { id: "1", name: "Lavender", hex: "#7986cb" },
  { id: "3", name: "Grape", hex: "#8e24aa" },
  { id: "8", name: "Graphite", hex: "#616161" },
];

const BY_ID = new Map(EVENT_COLORS.map((c) => [c.id, c]));

export const colorOf = (id: string | undefined | null): EventColor | undefined => (id ? BY_ID.get(id) : undefined);

/**
 * Masukan warna dari form: undefined = tidak diubah, "" = warna bawaan kalender, "1".."11" = warna itu. null = tidak valid.
 */
export function parseColor(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (value === "" || value === null) return "";
  if (typeof value === "string" && BY_ID.has(value)) return value;
  return null;
}

/** Gaya blok untuk sebuah warna: latar tipis, garis kiri tegas. `soft` = latar yang lebih tenang (blok panjang di belakang). */
export function colorStyle(id: string | undefined | null, soft = false): { backgroundColor: string; borderColor: string; borderLeftColor: string } | undefined {
  const c = colorOf(id);
  if (!c) return undefined;
  return { backgroundColor: `${c.hex}${soft ? "12" : "26"}`, borderColor: `${c.hex}${soft ? "30" : "55"}`, borderLeftColor: soft ? `${c.hex}b0` : c.hex };
}

/** Teks yang terbaca di atas warna penuh `hex`: putih untuk warna gelap, hampir hitam untuk warna terang (mis. Banana). */
export function textOn(hex: string): "#ffffff" | "#14161a" {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return luminance > 0.4 ? "#14161a" : "#ffffff";
}

/** Gaya blok seharian pada tampilan bulan: warna penuh dengan teks yang terbaca. */
export function colorSolidStyle(id: string | undefined | null): { backgroundColor: string; color: string } | undefined {
  const c = colorOf(id);
  return c ? { backgroundColor: c.hex, color: textOn(c.hex) } : undefined;
}
