// apps/web/src/components/turing/turing-context.test.tsx
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuringProvider, useTuring } from "./turing-context";

const wrap = ({ children }: { children: ReactNode }) => <TuringProvider>{children}</TuringProvider>;

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

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

  it("a hop carries its message; the message clears with the pose", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(true, "turing.celebrateDog"));
    expect(result.current.eventPose).toBe("celebrate");
    expect(result.current.eventMessage).toBe("turing.celebrateDog");
    act(() => vi.advanceTimersByTime(2600));
    expect(result.current.eventPose).toBeNull();
    expect(result.current.eventMessage).toBeNull();
  });

  it("a wag never shows a message even if a key is passed", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(false, "turing.celebrateDog"));
    expect(result.current.eventPose).toBe("wag");
    expect(result.current.eventMessage).toBeNull();
  });

  it("throttles a second wag within the cooldown", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(false)); // first wag plays
    act(() => vi.advanceTimersByTime(1600)); // pose clears
    expect(result.current.eventPose).toBeNull();
    act(() => result.current.celebrate(false)); // within 8s → suppressed
    expect(result.current.eventPose).toBeNull();
  });

  it("a hop always plays even during the wag cooldown, and re-throttles wags", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    act(() => result.current.celebrate(false)); // arms cooldown
    act(() => vi.advanceTimersByTime(1600));
    act(() => result.current.celebrate(true, "turing.celebrateBrief")); // hop bypasses
    expect(result.current.eventPose).toBe("celebrate");
    act(() => vi.advanceTimersByTime(2600));
    act(() => result.current.celebrate(false)); // still within 8s of the hop → suppressed
    expect(result.current.eventPose).toBeNull();
  });

  it("hidden defaults to false and setHidden persists", () => {
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    expect(result.current.hidden).toBe(false);
    act(() => result.current.setHidden(true));
    expect(result.current.hidden).toBe(true);
    expect(localStorage.getItem("tc-turing-hidden")).toBe("true");
  });

  it("reads an existing hidden preference on init", () => {
    localStorage.setItem("tc-turing-hidden", "true");
    const { result } = renderHook(() => useTuring(), { wrapper: wrap });
    expect(result.current.hidden).toBe(true);
  });
});
