// Dijalankan di browser: gambar besar dikecilkan sebelum diunggah (hemat kuota Storage dan data HP). Bukan modul server.
import { checkFile, extensionOf, scaledSize, shouldCompress } from "@/lib/attachments";

export type Prepared = { blob: Blob; fileName: string; mime: string };

/** Nama untuk gambar tempelan dari clipboard ("image.png" atau kosong) supaya mudah dikenali di daftar. */
export function pastedName(file: File, now = new Date()): string {
  const generic = !file.name || /^image\.(png|jpe?g|webp|gif)$/i.test(file.name);
  if (!generic) return file.name;
  const stamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{6})$/, "$1-$2");
  const ext = extensionOf(file.name) || (file.type.split("/")[1] === "jpeg" ? "jpg" : (file.type.split("/")[1] ?? "png"));
  return `screenshot-${stamp}.${ext}`;
}

/** Periksa file, lalu kecilkan bila gambar besar. Melempar Error berpesan jelas bila file tidak boleh diunggah. */
export async function prepareUpload(file: File): Promise<Prepared> {
  const name = pastedName(file);
  const initial = checkFile(name, file.size);
  if (!initial.ok) throw new Error(initial.error);

  let blob: Blob = file;
  let fileName = initial.fileName;
  let mime = initial.mime;

  if (mime.startsWith("image/") && mime !== "image/gif") {
    try {
      const bitmap = await createImageBitmap(file);
      if (shouldCompress(mime, file.size, bitmap.width, bitmap.height)) {
        const { width, height } = scaledSize(bitmap.width, bitmap.height);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fff"; // PNG transparan jadi putih, bukan hitam, saat dijadikan JPEG
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(bitmap, 0, 0, width, height);
          const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
          if (out && out.size < file.size) {
            blob = out;
            mime = "image/jpeg";
            fileName = fileName.replace(/\.[A-Za-z0-9]+$/, "") + ".jpg";
          }
        }
      }
      bitmap.close();
    } catch {
      // Tidak bisa didekode (format aneh): unggah apa adanya, selama ukurannya lolos pemeriksaan.
    }
  }

  const final = checkFile(fileName, blob.size);
  if (!final.ok) throw new Error(final.error);
  return { blob, fileName: final.fileName, mime: final.mime };
}
