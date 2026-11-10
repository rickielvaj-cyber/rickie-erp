-- Merapikan: hapus fungsi lama public.search_semantic(vector, integer). Sejak 0016/0017 aplikasi memakai search_semantic_v2 (skor tersesuaikan hub)
-- dan search_keyword; fungsi lama tidak dipanggil kode mana pun dan tidak punya dependen di database (dicek lewat pg_depend dan pencarian kode).
-- Hanya menghapus SATU fungsi; tidak menyentuh tabel atau data. Perintah DROP ini sengaja dan disetujui pemilik untuk fungsi ini saja.
-- Aman diulang (if exists). Tanda tangan tepatnya dicantumkan supaya search_semantic_v2 tidak ikut terhapus.

drop function if exists public.search_semantic(extensions.vector, integer);
