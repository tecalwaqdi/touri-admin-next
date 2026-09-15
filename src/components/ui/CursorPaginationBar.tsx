"use client";

/**
 * Cursor pagination controls for bounded Production lists (≤50).
 */

type Props = {
  cursorStack: Array<string | null>;
  nextCursor: string | null | undefined;
  truncated?: boolean;
  boundedHint: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  testIdPrefix?: string;
};

export function CursorPaginationBar({
  cursorStack,
  nextCursor,
  truncated,
  boundedHint,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  testIdPrefix = "list",
}: Props) {
  const pageIndex = cursorStack.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
      <button
        type="button"
        data-testid={`${testIdPrefix}-prev`}
        disabled={pageIndex <= 1}
        className="rounded border px-3 py-1 disabled:opacity-40"
        onClick={onPrevious}
      >
        {previousLabel}
      </button>
      <div className="text-center text-slate-600">
        <div data-testid={`${testIdPrefix}-page`}>
          {pageIndex}
          {nextCursor || truncated ? "+" : ""}
        </div>
        <div className="text-xs text-slate-500" data-testid={`${testIdPrefix}-bounded-hint`}>
          {boundedHint}
        </div>
      </div>
      <button
        type="button"
        data-testid={`${testIdPrefix}-next`}
        disabled={!nextCursor}
        className="rounded border px-3 py-1 disabled:opacity-40"
        onClick={onNext}
      >
        {nextLabel}
      </button>
    </div>
  );
}
