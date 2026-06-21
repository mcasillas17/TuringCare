import type { CSSProperties } from "react";

/**
 * Turing's head group (face, ears, eyes, muzzle, mouth) — the interactive half
 * of the artwork. Split out of `TuringArt` so each file stays readable; geometry
 * is copied verbatim from the owner-approved handoff and must not be altered.
 */

const LID_STYLE: CSSProperties = { transition: "ry .12s ease" };

export type TuringHeadProps = {
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

export function TuringHead({
  headTransform,
  earLrot,
  earRrot,
  pupilStyle,
  lidRy,
  mouthOpen,
}: TuringHeadProps) {
  return (
    <g
      style={{
        transformBox: "view-box",
        transformOrigin: "120px 112px",
        transform: headTransform,
        transition: "transform .55s cubic-bezier(.34,1.3,.5,1)",
      }}
    >
      <path
        d="M120 28 C170 28 200 58 200 102 C200 144 172 172 120 172 C68 172 40 144 40 102 C40 58 70 28 120 28 Z"
        fill="#9aa7b2"
        stroke="#1c1916"
        strokeWidth="5"
        strokeLinejoin="round"
      />

      <path
        d="M56 94 C54 74 84 66 100 86 C108 100 106 132 86 138 C62 136 56 116 56 94 Z"
        fill="#232830"
      />
      <path
        d="M150 52 C170 46 190 58 192 84 C192 102 180 114 162 112 C150 102 144 68 150 52 Z"
        fill="#232830"
      />
      <circle cx="168" cy="112" r="3.6" fill="#232830" opacity="0.6" />
      <circle cx="178" cy="98" r="3" fill="#232830" opacity="0.5" />
      <circle cx="136" cy="70" r="3" fill="#232830" opacity="0.5" />
      <circle cx="190" cy="110" r="2.6" fill="#232830" opacity="0.45" />
      <circle cx="120" cy="58" r="2.6" fill="#232830" opacity="0.45" />
      <circle cx="156" cy="100" r="2.4" fill="#232830" opacity="0.4" />

      <path
        d="M120 30 C134 30 145 41 145 57 C145 73 140 87 132 96 C152 99 169 115 171 137 C173 159 150 174 120 174 C90 174 67 159 69 137 C71 115 88 99 108 96 C100 87 95 73 95 57 C95 41 106 30 120 30 Z"
        fill="#f6f3ec"
        stroke="#1c1916"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M120 150 C108 150 100 138 99 126 C112 132 128 132 141 126 C140 138 132 150 120 150 Z"
        fill="#ddd8cb"
        opacity="0.5"
      />

      <path
        d="M88 122 C80 124 74 134 78 144 C86 144 96 138 100 128 C97 123 92 121 88 122 Z"
        fill="#c0894f"
        opacity="0.92"
      />
      <path
        d="M152 122 C160 124 166 134 162 144 C154 144 144 138 140 128 C143 123 148 121 152 122 Z"
        fill="#c0894f"
        opacity="0.92"
      />
      <ellipse cx="98" cy="140" rx="6" ry="5" fill="#c0894f" opacity="0.55" />
      <ellipse cx="142" cy="140" rx="6" ry="5" fill="#c0894f" opacity="0.55" />

      <g
        style={{
          transformBox: "view-box",
          transformOrigin: "88px 46px",
          transform: `rotate(${earLrot}deg)`,
          transition: "transform .5s ease",
        }}
      >
        <path
          d="M90 38 C62 30 26 42 18 74 C12 104 24 140 52 158 C60 140 66 112 70 88 C74 64 84 48 90 38 Z"
          fill="#232830"
          stroke="#1c1916"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M34 80 C28 108 40 138 54 150 C46 128 42 104 47 82 C43 80 38 79 34 80 Z"
          fill="#39414b"
          opacity="0.8"
        />
        <path
          d="M40 141 C34 149 37 157 47 158 C56 156 57 146 51 140 C47 137 43 138 40 141 Z"
          fill="#9aa7b2"
        />
      </g>
      <g
        style={{
          transformBox: "view-box",
          transformOrigin: "152px 46px",
          transform: `rotate(${earRrot}deg)`,
          transition: "transform .5s ease",
        }}
      >
        <path
          d="M150 38 C178 30 214 42 222 74 C228 104 216 140 188 158 C180 140 174 112 170 88 C166 64 156 48 150 38 Z"
          fill="#232830"
          stroke="#1c1916"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M206 80 C212 108 200 138 186 150 C194 128 198 104 193 82 Z"
          fill="#39414b"
          opacity="0.8"
        />
      </g>

      <path
        d="M80 84 C86 77 99 77 105 83"
        fill="none"
        stroke="#b97f4c"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M135 83 C141 77 154 77 160 84"
        fill="none"
        stroke="#b97f4c"
        strokeWidth="5"
        strokeLinecap="round"
      />

      <circle cx="96" cy="104" r="18" fill="#5fa0c6" />
      <path d="M96 86 A18 18 0 0 1 96 122 Z" fill="#a8763c" />
      <circle cx="96" cy="104" r="18" fill="none" stroke="#1c1916" strokeWidth="4" />
      <g style={pupilStyle}>
        <circle cx="96" cy="106" r="10" fill="#16181c" />
        <circle cx="91" cy="100" r="4.5" fill="#ffffff" />
        <circle cx="100" cy="110" r="2.2" fill="#ffffff" opacity="0.85" />
      </g>
      <ellipse cx="96" cy="104" rx="21" ry={lidRy} fill="#232830" style={LID_STYLE} />

      <circle cx="144" cy="104" r="18" fill="#a8763c" stroke="#1c1916" strokeWidth="4" />
      <g style={pupilStyle}>
        <circle cx="144" cy="106" r="10" fill="#16120c" />
        <circle cx="139" cy="100" r="4.5" fill="#ffffff" />
        <circle cx="148" cy="110" r="2.2" fill="#ffffff" opacity="0.85" />
      </g>
      <ellipse cx="144" cy="104" rx="21" ry={lidRy} fill="#9aa7b2" style={LID_STYLE} />

      <path
        d="M104 121 C108 114 132 114 136 121 C140 133 130 143 120 145 C110 143 100 133 104 121 Z"
        fill="#232830"
        stroke="#1c1916"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <ellipse cx="112" cy="123" rx="3.5" ry="2.2" fill="#ffffff" opacity="0.4" />

      <g style={{ display: mouthOpen ? "none" : "block" }}>
        <path d="M120 145 L120 153" stroke="#1c1916" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M120 153 C113 165 101 164 97 153"
          fill="none"
          stroke="#1c1916"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M120 153 C127 165 139 164 143 153"
          fill="none"
          stroke="#1c1916"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <g style={{ display: mouthOpen ? "block" : "none" }}>
        <path
          d="M104 146 Q120 151 136 146 Q133 167 120 169 Q107 167 104 146 Z"
          fill="#7a2f33"
          stroke="#1c1916"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M111 158 C110 174 130 174 129 158 Q120 154 111 158 Z"
          fill="#e98a92"
          stroke="#c96b73"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <line
          x1="120"
          y1="160"
          x2="120"
          y2="171"
          stroke="#c96b73"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}
