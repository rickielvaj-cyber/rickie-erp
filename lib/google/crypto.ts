import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// Refresh token Google = akses ke kalender pemilik. Disimpan terenkripsi (AES-256-GCM) dengan kunci yang hanya ada di
// env server (GOOGLE_TOKEN_SECRET), jadi isi database/backup saja tidak cukup untuk memakainya. `aad` (id pengguna)
// mengikat ciphertext ke barisnya: ciphertext yang disalin ke baris pengguna lain tidak bisa dibuka.

const VERSION = "v1";

function keyFrom(secret: string | undefined): Buffer {
  const key = Buffer.from(secret ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_SECRET must be 32 random bytes, base64-encoded (openssl rand -base64 32).");
  }
  return key;
}

export function encryptToken(plain: string, aad: string, secret = process.env.GOOGLE_TOKEN_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptToken(payload: string, aad: string, secret = process.env.GOOGLE_TOKEN_SECRET): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised token format.");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Bandingkan dua string rahasia (state OAuth) tanpa bocor lewat waktu. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
