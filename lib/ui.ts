/**
 * Kelas Tailwind untuk <select> yang pilihan kosongnya (value="") sedang terpilih: teksnya abu-abu ("No goal", "No project"),
 * supaya terlihat kosong dan berbeda dari nilai yang benar-benar dipilih. Memakai :has() (peramban modern); di peramban lama
 * teksnya tetap hitam, tidak ada yang rusak.
 */
export const EMPTY_MUTED = "[&:has(option[value='']:checked)]:text-muted";
