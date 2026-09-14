"use client";

/**
 * Stable data-query hook — prevents flicker / appear-disappear loops.
 * - One in-flight request per key (abort previous)
 * - Debounced key changes
 * - Does not clear prior success data on refetch (keeps last good until replace)
 * - Explicit idle → loading → success|empty|error transitions
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryState } from "@/types/common";

export type StableQueryResult<T> = {
  state: QueryState;
  data: T | null;
  error: string | undefined;
  reload: () => void;
};

export function useStableQuery<T>(options: {
  /** Stable string key; changing it triggers a reload. */
  queryKey: string;
  /** Fetcher; receives AbortSignal. Return null for empty. */
  fetcher: (signal: AbortSignal) => Promise<T | null>;
  /** Debounce ms when queryKey changes (default 200). */
  debounceMs?: number;
  /** Map thrown errors / HTTP failures to message. */
  mapError?: (err: unknown) => string;
  /** Treat empty arrays as empty state when data is array-like. */
  isEmpty?: (data: T) => boolean;
  enabled?: boolean;
}): StableQueryResult<T> {
  const {
    queryKey,
    fetcher,
    debounceMs = 200,
    mapError = (err) => (err instanceof Error ? err.message : "error"),
    isEmpty,
    enabled = true,
  } = options;

  const [state, setState] = useState<QueryState>("idle");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  const isEmptyRef = useRef(isEmpty);
  const mapErrorRef = useRef(mapError);
  fetcherRef.current = fetcher;
  isEmptyRef.current = isEmpty;
  mapErrorRef.current = mapError;

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState("idle");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Keep prior success data visible (no blank flicker); only show loading if never loaded.
      setState((prev) => (prev === "success" || prev === "empty" ? prev : "loading"));
      setError(undefined);
      void (async () => {
        try {
          const result = await fetcherRef.current(controller.signal);
          if (cancelled || controller.signal.aborted) return;
          if (result == null || (isEmptyRef.current?.(result) ?? false)) {
            setData(result);
            setState("empty");
            return;
          }
          setData(result);
          setState("success");
        } catch (err) {
          if (cancelled || controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(mapErrorRef.current(err));
          setState("error");
        }
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [queryKey, tick, debounceMs, enabled]);

  return { state, data, error, reload };
}
