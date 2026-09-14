"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div data-testid="global-error" className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center">
            <h2 className="text-lg font-semibold text-red-800">Application error</h2>
            <p className="mt-2 text-sm text-slate-600">An unexpected error occurred.</p>
            <p className="mt-1 text-xs text-slate-400">{error.digest}</p>
            <button
              type="button"
              className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm text-white"
              onClick={reset}
            >
              Retry
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
