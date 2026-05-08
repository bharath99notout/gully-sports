/**
 * Top-down view of a foosball table with proper colours so it pops next
 * to the system-emoji sport icons (🏏 ⚽ 🏸 🏓) instead of looking like a
 * grey wireframe.
 *
 *   • Green felt playfield with a centre line
 *   • Brown wooden frame
 *   • Silver rods running across
 *   • Red figurines (Side A) and blue figurines (Side B), 1-2-1 per side
 *   • White ball in the middle
 *   • Dark goal slots on the left and right edges
 *
 * Sized via `width="1em" height="1em"` so it inherits the surrounding
 * font-size — drop it inside `text-2xl` (or any text utility) and it
 * matches the visual weight of the emoji-based sport icons.
 */
export default function FoosballIcon({ className }: { className?: string }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      className={className}
      aria-label="Foosball"
    >
      {/* Wooden frame */}
      <rect x="1.5" y="4.5" width="21" height="15" rx="1.6" fill="#8b5a2b" />

      {/* Green felt playfield */}
      <rect x="3" y="6" width="18" height="12" rx="0.6" fill="#15803d" />

      {/* Centre dashed line */}
      <line x1="12" y1="6" x2="12" y2="18" stroke="#86efac" strokeWidth="0.6" strokeOpacity="0.7" strokeDasharray="1 1" />

      {/* Centre circle */}
      <circle cx="12" cy="12" r="1.6" fill="none" stroke="#86efac" strokeWidth="0.5" strokeOpacity="0.6" />

      {/* Goals — recessed dark slots inside the frame */}
      <rect x="1.5" y="9.5" width="1.5" height="5" fill="#1f2937" />
      <rect x="21" y="9.5" width="1.5" height="5" fill="#1f2937" />

      {/* Rods — silver, 8 total (4 per side) */}
      <g stroke="#cbd5e1" strokeWidth="0.5" strokeLinecap="round">
        <line x1="5"  y1="3.6" x2="5"  y2="20.4" />
        <line x1="8"  y1="3.6" x2="8"  y2="20.4" />
        <line x1="11" y1="3.6" x2="11" y2="20.4" />
        <line x1="13" y1="3.6" x2="13" y2="20.4" />
        <line x1="16" y1="3.6" x2="16" y2="20.4" />
        <line x1="19" y1="3.6" x2="19" y2="20.4" />
      </g>

      {/* Rod knobs — small dark caps on the top + bottom of each rod */}
      <g fill="#475569">
        <circle cx="5"  cy="3.6"  r="0.55" />
        <circle cx="5"  cy="20.4" r="0.55" />
        <circle cx="8"  cy="3.6"  r="0.55" />
        <circle cx="8"  cy="20.4" r="0.55" />
        <circle cx="11" cy="3.6"  r="0.55" />
        <circle cx="11" cy="20.4" r="0.55" />
        <circle cx="13" cy="3.6"  r="0.55" />
        <circle cx="13" cy="20.4" r="0.55" />
        <circle cx="16" cy="3.6"  r="0.55" />
        <circle cx="16" cy="20.4" r="0.55" />
        <circle cx="19" cy="3.6"  r="0.55" />
        <circle cx="19" cy="20.4" r="0.55" />
      </g>

      {/* Side A — RED figurines (left half) */}
      <g fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.2">
        <circle cx="5"  cy="12" r="1.0" /> {/* goalie */}
        <circle cx="8"  cy="9"  r="0.9" />
        <circle cx="8"  cy="15" r="0.9" />
        <circle cx="11" cy="12" r="0.9" /> {/* attack */}
      </g>

      {/* Side B — BLUE figurines (right half) */}
      <g fill="#2563eb" stroke="#1e3a8a" strokeWidth="0.2">
        <circle cx="13" cy="12" r="0.9" /> {/* attack */}
        <circle cx="16" cy="9"  r="0.9" />
        <circle cx="16" cy="15" r="0.9" />
        <circle cx="19" cy="12" r="1.0" /> {/* goalie */}
      </g>

      {/* Ball — white with a faint shadow to read at small sizes */}
      <circle cx="12" cy="12" r="0.95" fill="#ffffff" stroke="#1f2937" strokeWidth="0.25" />
    </svg>
  );
}
