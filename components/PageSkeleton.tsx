export function PageSkeleton() {
  return (
    <div className="max-w-4xl animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-surface" />
      <div className="h-10 w-full rounded-md bg-surface" />
      <div className="h-24 w-full rounded-md bg-surface" />
      <div className="h-24 w-full rounded-md bg-surface" />
    </div>
  );
}
