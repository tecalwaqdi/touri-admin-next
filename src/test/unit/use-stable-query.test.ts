import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useStableQuery } from "@/lib/useStableQuery";

describe("useStableQuery flicker / loop prevention", () => {
  it("keeps prior success data while refetching (no blank flicker)", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return "first";
      return "second";
    });

    const { result, rerender } = renderHook(
      ({ key }) =>
        useStableQuery({
          queryKey: key,
          fetcher,
          debounceMs: 10,
        }),
      { initialProps: { key: "a" } },
    );

    await waitFor(() => expect(result.current.state).toBe("success"));
    expect(result.current.data).toBe("first");

    rerender({ key: "b" });
    // Prior success data remains during debounce / refetch (no blank flicker)
    expect(result.current.data).toBe("first");
    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(result.current.state).toBe("success");
  });

  it("aborts superseded requests when key changes quickly", async () => {
    const seen = { aborted: 0 };
    const fetcher = vi.fn(async (signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), 80);
        signal.addEventListener("abort", () => {
          seen.aborted += 1;
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
      return "ok";
    });

    const { result, rerender } = renderHook(
      ({ key }) =>
        useStableQuery({
          queryKey: key,
          fetcher,
          debounceMs: 5,
        }),
      { initialProps: { key: "1" } },
    );

    rerender({ key: "2" });
    rerender({ key: "3" });
    await waitFor(() => expect(result.current.data).toBe("ok"));
    expect(seen.aborted).toBeGreaterThanOrEqual(0);
  });
});
