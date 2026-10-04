import { KbIndexPrefetch } from "@/components/kb/KbIndexPrefetch";

// Layout khusus section Knowledge Base — semua fitur KB (prefetch indeks,
// search, highlight) hidup di bawah sini, nggak nyentuh sidebar global.
export default function KnowledgeBaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <KbIndexPrefetch />
      {children}
    </>
  );
}
