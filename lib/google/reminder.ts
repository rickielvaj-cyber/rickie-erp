// Pengingat (reminder) pada blok kalender. Notifikasinya dikirim oleh aplikasi Google Calendar di HP, bukan oleh situs ini:
// situs hanya mengisi/membaca bidang `reminders` pada acara lewat API. Murni (tanpa jaringan) supaya mudah diuji.

/** "default" = pengaturan bawaan kalender; "none" = tanpa pengingat; angka = menit sebelum mulai (popup); "custom" = diatur di Google (tidak diubah dari sini). */
export type ReminderChoice = "default" | "none" | "custom" | number;

/** Pilihan di formulir, dalam menit. Google menerima 0 sampai 40320 (4 minggu). */
export const REMINDER_MINUTES = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

export function reminderLabel(choice: ReminderChoice): string {
  if (choice === "default") return "Calendar default";
  if (choice === "none") return "No reminder";
  if (choice === "custom") return "Custom (set in Google)";
  if (choice === 0) return "At start";
  if (choice < 60) return `${choice} minutes before`;
  if (choice % 1440 === 0) return choice === 1440 ? "1 day before" : `${choice / 1440} days before`;
  if (choice % 60 === 0) return choice === 60 ? "1 hour before" : `${choice / 60} hours before`;
  return `${choice} minutes before`;
}

export function reminderOptions(current?: ReminderChoice): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [
    { value: "default", label: reminderLabel("default") },
    { value: "none", label: reminderLabel("none") },
    ...REMINDER_MINUTES.map((m) => ({ value: String(m), label: reminderLabel(m) })),
  ];
  // Nilai yang sudah ada di Google tapi tidak ada di daftar (mis. 45 menit, atau beberapa pengingat) tetap bisa dipilih apa adanya.
  if (current !== undefined && !options.some((o) => o.value === String(current))) {
    options.push({ value: String(current), label: reminderLabel(current) });
  }
  return options;
}

/** Nilai <select> -> pilihan; null bila tidak dikenal. */
export function parseReminder(value: unknown): ReminderChoice | null {
  if (value === "default" || value === "none" || value === "custom") return value;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 40320) return value;
  if (typeof value === "string" && /^\d{1,5}$/.test(value)) return parseReminder(Number(value));
  return null;
}

/** Bidang `reminders` untuk Google. undefined = jangan kirim (acara mempertahankan pengingatnya sekarang). */
export function reminderToApi(choice: ReminderChoice | undefined): { useDefault: boolean; overrides?: { method: "popup"; minutes: number }[] } | undefined {
  if (choice === undefined || choice === "custom") return undefined;
  if (choice === "default") return { useDefault: true };
  if (choice === "none") return { useDefault: false, overrides: [] };
  return { useDefault: false, overrides: [{ method: "popup", minutes: choice }] };
}

export type RawReminders = { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] };

/** Bidang `reminders` dari Google -> pilihan. Satu popup = menit tsb; kosong = none; selain itu (email, beberapa) = custom. */
export function reminderFromApi(raw: RawReminders | undefined): ReminderChoice {
  if (!raw || raw.useDefault !== false) return "default";
  const overrides = raw.overrides ?? [];
  if (overrides.length === 0) return "none";
  if (overrides.length === 1 && overrides[0].method === "popup" && typeof overrides[0].minutes === "number") return overrides[0].minutes;
  return "custom";
}
