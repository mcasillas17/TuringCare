import type { CSSProperties } from "react";
import { TuringHead } from "./turing-head";

/**
 * Turing's artwork — a single inline SVG copied verbatim from the design handoff
 * (`Turing Corner.dc.html`). Owner-approved markings; do not alter the geometry.
 *
 * This is a pure presentational component: all motion is driven by the parent
 * (`TuringCompanion`) via props, so the static vector paths live apart from the
 * interaction logic. The face/ears/eyes/mouth live in `TuringHead`.
 */

export type TuringArtProps = {
  /** CSS `animation` shorthand for the body group (breathe). */
  bodyAnim: string;
  /** CSS `animation` shorthand for the tail group (sway/wag). */
  tailAnim: string;
  /** CSS `transform` for the head group (tilt). */
  headTransform: string;
  /** Ear rotation in degrees while tilting. */
  earLrot: number;
  earRrot: number;
  /** Pupil translate style (cursor eye-follow). */
  pupilStyle: CSSProperties;
  /** Eyelid ellipse `ry` (0 open, 21 closed) — animates for blink. */
  lidRy: number;
  /** Whether the open (barking) mouth is shown instead of the closed mouth. */
  mouthOpen: boolean;
};

export function TuringArt({
  bodyAnim,
  tailAnim,
  headTransform,
  earLrot,
  earRrot,
  pupilStyle,
  lidRy,
  mouthOpen,
}: TuringArtProps) {
  return (
    <svg
      viewBox="0 0 240 270"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
      preserveAspectRatio="xMidYMax meet"
    >
      <ellipse cx="120" cy="259" rx="80" ry="9" fill="#000000" opacity="0.11" />

      <g
        style={{
          transformBox: "view-box",
          transformOrigin: "120px 256px",
          animation: bodyAnim,
        }}
      >
        <g
          style={{
            transformBox: "view-box",
            transformOrigin: "180px 216px",
            animation: tailAnim,
          }}
        >
          <path
            d="M180 214 C202 205 215 222 204 239 C195 252 180 247 176 232 Z"
            fill="#9aa7b2"
            stroke="#1c1916"
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </g>

        <path
          d="M120 150 C153 150 178 174 182 208 C186 240 171 258 120 258 C69 258 54 240 58 208 C62 174 87 150 120 150 Z"
          fill="#9aa7b2"
          stroke="#1c1916"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M168 206 C172 226 166 244 150 250 C162 238 162 220 158 206 Z"
          fill="#7f8d99"
          opacity="0.6"
        />
        <circle cx="70" cy="202" r="3.4" fill="#232830" opacity="0.5" />
        <circle cx="164" cy="226" r="3" fill="#232830" opacity="0.45" />
        <circle cx="78" cy="228" r="2.6" fill="#232830" opacity="0.4" />
        <ellipse cx="74" cy="248" rx="16" ry="11" fill="#f6f3ec" stroke="#1c1916" strokeWidth="4" />
        <ellipse
          cx="166"
          cy="248"
          rx="16"
          ry="11"
          fill="#f6f3ec"
          stroke="#1c1916"
          strokeWidth="4"
        />

        <path
          d="M120 166 C135 166 144 182 144 206 C144 232 133 252 120 254 C107 252 96 232 96 206 C96 182 105 166 120 166 Z"
          fill="#f6f3ec"
          stroke="#1c1916"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        <path
          d="M90 232 C90 226 116 226 116 232 L116 250 C116 257 90 257 90 250 Z"
          fill="#f6f3ec"
          stroke="#1c1916"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M124 232 C124 226 150 226 150 232 L150 250 C150 257 124 257 124 250 Z"
          fill="#f6f3ec"
          stroke="#1c1916"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <line
          x1="99"
          y1="238"
          x2="99"
          y2="252"
          stroke="#cbc4b6"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="107"
          y1="238"
          x2="107"
          y2="252"
          stroke="#cbc4b6"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="133"
          y1="238"
          x2="133"
          y2="252"
          stroke="#cbc4b6"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="141"
          y1="238"
          x2="141"
          y2="252"
          stroke="#cbc4b6"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        <polygon
          points="120,182 130,188 130,200 120,206 110,200 110,188"
          fill="#2f8f9d"
          stroke="#1f6470"
          strokeWidth="2"
        />
        <path d="M114,199 L119,190 L122,195 L125,191 L128,199 Z" fill="#eaf6f7" />

        <TuringHead
          headTransform={headTransform}
          earLrot={earLrot}
          earRrot={earRrot}
          pupilStyle={pupilStyle}
          lidRy={lidRy}
          mouthOpen={mouthOpen}
        />
      </g>
    </svg>
  );
}
