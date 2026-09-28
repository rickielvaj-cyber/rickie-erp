import Link from "next/link";
import { ImportForm } from "./ImportForm";

// Best-effort ceiling for the parseKbDocx/saveKbImport server actions
// invoked from this page — the actual limit still depends on the plan's
// function duration, which this code can't detect in advance.
export const maxDuration = 60;

export default function KbImportPage() {
  return (
    <div className="max-w-3xl">
      <Link href="/kb" className="text-sm text-muted hover:underline">
        &larr; Knowledge Base
      </Link>
      <h1 className="mb-2 mt-1 text-2xl font-semibold text-brand-red">Import dari Word</h1>
      <p className="mb-6 text-sm text-muted">
        Upload file .docx, konten akan dipecah per heading (H1/H2) dan dicocokkan otomatis ke
        modul KB. Cek hasilnya dulu di layar preview sebelum disimpan.
      </p>

      <ImportForm />
    </div>
  );
}
