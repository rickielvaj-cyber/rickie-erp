// Template dipasang ulang saat segmen di bawahnya berganti, jadi harus berada di dalam grup (dashboard) supaya berpindah antar halaman (To-Do -> Notes, dst.)
// memicunya; di app/ langsung, ia tidak pernah dipasang ulang antar halaman satu grup. Bukan saat parameter URL berubah (mis. ?week=): isi halaman memudar masuk (hanya opacity, supaya elemen
// `fixed` di dalamnya tidak terpengaruh). Menu atas ada di layout, jadi tidak ikut memudar. Tanpa gerak (lihat `--m-page`) ini tidak berefek.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="anim-page">{children}</div>;
}
