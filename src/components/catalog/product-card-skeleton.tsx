"use client";

export function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border bg-card">
      <div className="aspect-[4/3] bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-4 w-4/5 rounded bg-muted" />
        <div className="h-4 w-3/5 rounded bg-muted" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="h-6 w-24 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted" />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="h-10 rounded-xl bg-muted" />
          <div className="h-10 w-20 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
