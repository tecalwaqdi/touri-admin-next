"use client";

export function SkeletonBlock({
  rows = 4,
  testId = "skeleton-state",
}: {
  rows?: number;
  testId?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid={testId}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={`sk-${i}`}
          className="h-4 animate-pulse rounded bg-slate-200"
          style={{ width: `${70 + ((i * 13) % 25)}%` }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
