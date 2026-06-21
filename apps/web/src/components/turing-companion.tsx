import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { TuringArt } from "./turing-art";
import { TURING_TIPS } from "./turing-tips";

/**
 * Turing — the TuringCare companion mascot.
 *
 * Ported from the Claude Design handoff (`Turing Corner.dc.html`). The SVG
 * artwork lives in `TuringArt`; this component owns the interaction logic
 * (reimplemented from the handoff's ~60 lines of vanilla JS as React state).
 * Phase 1 ships the "corner" variant: ambient breathing/blinking/tail-sway,
 * cursor eye-follow, hover head-tilt, and a tap-for-a-training-tip speech
 * bubble. Mounted once inside the authenticated AppShell so it persists across
 * `/my/*` route changes. Layout/static styling lives in `index.css`
 * (`.turing-companion`, `.turing-bubble`).
 */

/** How long the tip bubble stays up after a tap, in ms. */
const BUBBLE_MS = 3600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type Mode = "idle" | "tilt" | "bark";

export function TuringCompanion() {
  const rootRef = useRef<HTMLButtonElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reduceMotion = prefersReducedMotion();

  const [mode, setMode] = useState<Mode>("idle");
  const [bubble, setBubble] = useState("");
  const [blink, setBlink] = useState(false);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });

  // Cursor eye-follow: translate the pupils toward the pointer, clamped.
  // Pointer-only and skipped under reduced-motion.
  useEffect(() => {
    if (reduceMotion) return;
    const onMove = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.36;
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      setPupil({ x: +(dx * 3.4).toFixed(2), y: +(dy * 3).toFixed(2) });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduceMotion]);

  // Self-rescheduling blink loop (lids close 130ms, every 2.4–5.6s).
  useEffect(() => {
    if (reduceMotion) return;
    let alive = true;
    let gap: ReturnType<typeof setTimeout>;
    let close: ReturnType<typeof setTimeout>;
    const loop = () => {
      gap = setTimeout(
        () => {
          if (!alive) return;
          setBlink(true);
          close = setTimeout(() => {
            if (alive) setBlink(false);
          }, 130);
          loop();
        },
        2400 + Math.random() * 3200,
      );
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(gap);
      clearTimeout(close);
    };
  }, [reduceMotion]);

  // Tidy the bubble timer on unmount.
  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

  const onClick = useCallback(() => {
    clearTimeout(bubbleTimer.current);
    const tip = TURING_TIPS[Math.floor(Math.random() * TURING_TIPS.length)] ?? TURING_TIPS[0];
    setBubble(tip);
    setMode("bark");
    bubbleTimer.current = setTimeout(() => {
      setBubble("");
      setMode("idle");
    }, BUBBLE_MS);
  }, []);

  const onEnter = useCallback(() => {
    setMode((m) => (m === "bark" ? m : "tilt"));
  }, []);
  const onLeave = useCallback(() => {
    setMode((m) => (m === "bark" ? m : "idle"));
  }, []);

  const eyesClosed = blink;

  const bodyAnim = reduceMotion
    ? "none"
    : mode === "bark"
      ? "tg-breathe 2.3s ease-in-out infinite"
      : "tg-breathe-slow 4.6s ease-in-out infinite";
  const tailAnim = reduceMotion
    ? "none"
    : mode === "bark"
      ? "tg-wag .54s ease-in-out infinite"
      : "tg-sway 3.6s ease-in-out infinite";

  const px = eyesClosed ? 0 : pupil.x;
  const py = eyesClosed ? 0 : pupil.y;
  const pupilStyle: CSSProperties = {
    transform: `translate(${px}px,${py}px)`,
    transition: "transform .09s linear",
  };

  return (
    <button
      ref={rootRef}
      type="button"
      className="turing-companion"
      aria-label="Turing — tap for a training tip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {bubble && (
        <output className="turing-bubble">
          {bubble}
          <span className="turing-bubble-tip" />
        </output>
      )}

      <TuringArt
        bodyAnim={bodyAnim}
        tailAnim={tailAnim}
        headTransform={mode === "tilt" ? "rotate(-13deg)" : "rotate(0deg)"}
        earLrot={mode === "tilt" ? -7 : 0}
        earRrot={mode === "tilt" ? 6 : 0}
        pupilStyle={pupilStyle}
        lidRy={eyesClosed ? 21 : 0}
        mouthOpen={mode === "bark"}
      />
    </button>
  );
}
