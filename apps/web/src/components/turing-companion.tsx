import { useI18n } from "@/i18n/index";
import type { MessageKey } from "@/i18n/types";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { TuringArt } from "./turing-art";
import { TURING_TIP_BUCKETS, tipContextForPath } from "./turing-tips";
import { useTuring } from "./turing/turing-context";
import type { TuringPose } from "./turing/turing-poses";

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
  const { t } = useI18n();
  const { eventPose, asleep } = useTuring();
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLButtonElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reduceMotion = prefersReducedMotion();

  const [mode, setMode] = useState<Mode>("idle");
  const [tipKey, setTipKey] = useState<MessageKey | null>(null);
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
    const bucket = TURING_TIP_BUCKETS[tipContextForPath(pathname)];
    const key = bucket[Math.floor(Math.random() * bucket.length)] ?? "turing.tip1";
    setTipKey(key);
    setMode("bark");
    bubbleTimer.current = setTimeout(() => {
      setTipKey(null);
      setMode("idle");
    }, BUBBLE_MS);
  }, [pathname]);

  const onEnter = useCallback(() => {
    setMode((m) => (m === "bark" ? m : "tilt"));
  }, []);
  const onLeave = useCallback(() => {
    setMode((m) => (m === "bark" ? m : "idle"));
  }, []);

  const sleeping = asleep && mode === "idle" && !eventPose;
  const eyesClosed = blink || sleeping;
  const pose: TuringPose =
    eventPose ??
    (mode === "bark" ? "bark" : mode === "tilt" ? "tilt" : sleeping ? "sleep" : "idle");

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
      aria-label={t("turing.tipAria")}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {tipKey && (
        <output className="turing-bubble">
          {t(tipKey)}
          <span className="turing-bubble-tip" />
        </output>
      )}

      <TuringArt
        pose={pose}
        reduceMotion={reduceMotion}
        pupilStyle={pupilStyle}
        eyesClosed={eyesClosed}
      />
    </button>
  );
}
