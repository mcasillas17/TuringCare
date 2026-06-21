// apps/web/src/components/turing/turing-context.tsx
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type EventPose = "wag" | "celebrate";

type TuringApi = {
  eventPose: EventPose | null;
  asleep: boolean;
  celebrate: (big?: boolean) => void;
};

const WAG_MS = 1600;
const CELEBRATE_MS = 2600;
const IDLE_MS = 60000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const Ctx = createContext<TuringApi | null>(null);

export function TuringProvider({ children }: { children: ReactNode }) {
  const [eventPose, setEventPose] = useState<EventPose | null>(null);
  const [asleep, setAsleep] = useState(false);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduce = prefersReducedMotion();

  const resetIdle = useCallback(() => {
    setAsleep(false);
    clearTimeout(idleTimer.current);
    if (reduce) return; // never auto-sleep under reduced motion
    idleTimer.current = setTimeout(() => setAsleep(true), IDLE_MS);
  }, [reduce]);

  const celebrate = useCallback(
    (big = false) => {
      resetIdle();
      clearTimeout(poseTimer.current);
      setEventPose(big ? "celebrate" : "wag");
      poseTimer.current = setTimeout(() => setEventPose(null), big ? CELEBRATE_MS : WAG_MS);
    },
    [resetIdle],
  );

  useEffect(() => {
    resetIdle();
    const onActivity = () => resetIdle();
    window.addEventListener("pointermove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("keydown", onActivity);
      clearTimeout(idleTimer.current);
      clearTimeout(poseTimer.current);
    };
  }, [resetIdle]);

  const value = useMemo<TuringApi>(
    () => ({ eventPose, asleep, celebrate }),
    [eventPose, asleep, celebrate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTuring(): TuringApi {
  return useContext(Ctx) ?? { eventPose: null, asleep: false, celebrate: () => {} };
}
