import type { Client, ClientKind } from "@/lib/types";

/** Entri tanpa `kind` (mis. kode baru live sebelum migrasi 0010) dianggap klien, bukan hilang dari daftar. */
export const kindOf = (client: Pick<Client, "kind">): ClientKind => (client.kind === "partner" ? "partner" : "client");
