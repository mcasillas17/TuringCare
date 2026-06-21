// apps/web/src/components/turing/turing-context.test.tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuringProvider, useTuring } from "./turing-context";

const wrap = ({ children }: { children: ReactNode }) => <TuringProvider>{children}</TuringProvider>;

afterEach(() => vi.useRealTimers());

describe("useTuring", () => {
  it("no-op fallback without a provider", () => {
    const { result } = renderHook(() => useTuring());
    expect(result.current.eventPose).toBeNull();
    expect(result.current.asleep).toBe(false);
    expect(() => result.current.celebrate()).not.toThrow();
  });

  it("celebrate(false) sets wag then clears after 1.6s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(false));
    expect(result.current.eventPose).toBe("wag");
    act(() => vi.advanceTimersByTime(1600));
    expect(result.current.eventPose).toBeNull();
  });

  it("celebrate(true) sets celebrate then clears after 2.6s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(true));
    expect(result.current.eventPose).toBe("celebrate");
    act(() => vi.advanceTimersByTime(2600));
    expect(result.current.eventPose).toBeNull();
  });

  it("falls asleep after 60s idle and wakes on celebrate", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.asleep).toBe(true);
    act(() => result.current.celebrate(false));
    expect(result.current.asleep).toBe(false);
  });
});
