// Sensor teks sebelum dikirim ke Gemini. Yang diganti dengan penanda ([CLIENT_1], [NUM_2], ...): nama klien/partner dan proyek
// yang ada di database, email, tautan, nomor telepon, angka besar/nominal uang, dan kode campuran huruf-angka (nomor invoice,
// NPWP, dsb.). Penandanya konsisten (nama yang sama = penanda yang sama) dan hasil dari Gemini dikembalikan ke aslinya di
// server (`restore`), jadi hasil akhir tetap terbaca. TIDAK terdeteksi: nama orang dan hal rahasia lain yang tidak berpola;
// itu sebabnya ada pratinjau dan penanda "jangan kirim ke AI" per catatan.

export type NameKind = "CLIENT" | "PROJECT";
export type KnownName = { value: string; kind: NameKind };

export type Redaction = {
  /** Teks yang aman dikirim. */
  text: string;
  /** Kembalikan penanda di `output` ke nilai aslinya; penanda yang tidak dikenal dibiarkan. */
  restore: (output: string) => string;
  /** Jumlah penggantian per jenis penanda, untuk ditampilkan ke pengguna. */
  counts: Record<string, number>;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LEGAL_PREFIX = /^(?:PT|CV|UD|PD|Tbk)\.?\s+/i;
const MIN_NAME = 3;

export type NameVariant = KnownName & {
  /** Nama lengkap dari database; semua varian satu nama memakai penanda yang sama dan dipulihkan ke nama ini. */
  canonical: string;
};

/** Nama yang dicari di teks: nama lengkap dan versi tanpa awalan badan hukum ("PT ", "CV "), terpanjang dulu. */
export function nameVariants(names: KnownName[]): NameVariant[] {
  const out = new Map<string, NameVariant>();
  for (const n of names) {
    const full = n.value.trim().replace(/\s+/g, " ");
    if (full.length >= MIN_NAME && !out.has(full.toLowerCase())) out.set(full.toLowerCase(), { value: full, kind: n.kind, canonical: full });
    const short = full.replace(LEGAL_PREFIX, "");
    if (short !== full && short.length >= MIN_NAME + 1 && !out.has(short.toLowerCase())) out.set(short.toLowerCase(), { value: short, kind: n.kind, canonical: full });
  }
  return [...out.values()].sort((a, b) => b.value.length - a.value.length);
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const digitsOf = (s: string) => s.replace(/\D/g, "");

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?<![\w.])(?:\+62|62|0)[\s-]?\(?\d{2,4}\)?(?:[\s-]?\d){6,10}(?!\d)/g;
const NPWP_RE = /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g;
// Nominal: awalan mata uang atau satuan di belakang, atau minimal 5 digit.
const MONEY_RE = /(?:(?:Rp\.?|IDR|USD|US\$|\$)\s?)?\d[\d.,]*\d(?:\s?(?:juta|jt|miliar|milyar|triliun|ribu|rb|k|m)\b)?|(?:Rp\.?|IDR|USD|US\$|\$)\s?\d/gi;
const CODE_RE = /\b(?=[\w/-]*\d)(?=[\w/-]*[A-Za-z])[\w/-]{8,}\b/g;

const TOKEN_RE = /\[(?:CLIENT|PROJECT|URL|EMAIL|ID|PHONE|CODE|NUM)_\d+\]/g;

/** Ganti `re` hanya di luar penanda yang sudah dibuat, supaya "[CLIENT_1]" tidak dianggap kode atau angka. */
function replaceOutsideTokens(text: string, re: RegExp, fn: (match: string) => string): string {
  let out = "";
  let last = 0;
  for (const t of text.matchAll(TOKEN_RE)) {
    out += text.slice(last, t.index).replace(re, fn) + t[0];
    last = (t.index ?? 0) + t[0].length;
  }
  return out + text.slice(last).replace(re, fn);
}

export function redact(input: string, names: KnownName[]): Redaction {
  const originals = new Map<string, string>(); // penanda -> asli
  const tokenOf = new Map<string, string>(); // `${JENIS}\u0000${asli huruf kecil}` -> penanda
  const counters: Record<string, number> = {};
  const counts: Record<string, number> = {};

  const tokenFor = (kind: string, original: string, canonical = original): string => {
    const key = `${kind}\u0000${canonical.toLowerCase()}`;
    let token = tokenOf.get(key);
    if (!token) {
      counters[kind] = (counters[kind] ?? 0) + 1;
      token = `[${kind}_${counters[kind]}]`;
      tokenOf.set(key, token);
      originals.set(token, canonical);
    }
    counts[kind] = (counts[kind] ?? 0) + 1;
    return token;
  };

  let text = input;

  // 1) Nama dikenal (klien/partner/proyek), terpanjang dulu supaya "PT Maju Jaya" tidak terpotong oleh "Maju".
  for (const n of nameVariants(names)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n.value)}(?![\\p{L}\\p{N}])`, "giu");
    text = text.replace(re, (m) => tokenFor(n.kind, m, n.canonical));
  }
  // 2) Pola berformat. Urutan penting: yang lebih spesifik dulu, supaya angka di dalam email/tautan tidak diganti dua kali.
  text = replaceOutsideTokens(text, URL_RE, (m) => tokenFor("URL", m));
  text = replaceOutsideTokens(text, EMAIL_RE, (m) => tokenFor("EMAIL", m));
  text = replaceOutsideTokens(text, NPWP_RE, (m) => tokenFor("ID", m));
  text = replaceOutsideTokens(text, PHONE_RE, (m) => tokenFor("PHONE", m));
  text = replaceOutsideTokens(text, CODE_RE, (m) => (DATE_LIKE.test(m) ? m : tokenFor("CODE", m)));
  text = replaceOutsideTokens(text, MONEY_RE, (m) => {
    if (DATE_LIKE.test(m.trim())) return m;
    const hasCurrency = /^(?:Rp|IDR|USD|US\$|\$)/i.test(m) || /(?:juta|jt|miliar|milyar|triliun|ribu|rb)$/i.test(m);
    return hasCurrency || digitsOf(m).length >= 5 ? tokenFor("NUM", m) : m;
  });

  return {
    text,
    restore: (output) => output.replace(TOKEN_RE, (t) => originals.get(t) ?? t),
    counts,
  };
}

/** "3 client or project names, 2 numbers" untuk ditampilkan; kosong bila tidak ada yang diganti. */
export function describeCounts(counts: Record<string, number>): string {
  const labels: Record<string, string> = {
    CLIENT: "client names",
    PROJECT: "project names",
    URL: "links",
    EMAIL: "email addresses",
    ID: "tax/ID numbers",
    PHONE: "phone numbers",
    CODE: "codes",
    NUM: "numbers or amounts",
  };
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${labels[k] ?? k}`)
    .join(", ");
}
