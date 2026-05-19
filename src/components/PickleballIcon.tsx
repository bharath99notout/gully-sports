/**
 * Inline SVG for pickleball — V-shape: two paddles with handles meeting at
 * the bottom-centre, heads spread upward at ±26°, and the perforated yellow
 * ball perched front-and-centre between the heads. Mirrors the layout of
 * the reference pickleball badge the user shared, but stripped down to
 * read at thumbnail sizes.
 *
 * Design choices for legibility at 16-24px:
 *   • V-shape (rotated about a low pivot near the bottom edge) instead of
 *     an X-cross, so the paddle silhouettes fill the canvas instead of
 *     wasting the corners.
 *   • Solid two-tone paddle heads (yellow + orange) with **black** outer
 *     strokes so the shapes hold their edges on the dark dashboard cards.
 *     A faint inner rim line preserves the "paddle face vs. edge" cue
 *     without adding the fine cross-hatch that turned to mud below 24px.
 *   • Three short grip wraps on each handle = visible paddle-handle feel
 *     at small sizes without becoming line-noise.
 *   • Ball is enlarged (r=3.8 of 24, ≈32% of the viewBox width) with 7
 *     prominent dark holes — the silhouette reads as "pickleball"
 *     instead of a generic yellow disc.
 *
 * Sized via `width="1em" height="1em"` — drop it inside `text-xl`
 * (or any text utility) and it matches the visual weight of the
 * emoji-based sport icons 🏏 ⚽ 🏸 🏓.
 */
export default function PickleballIcon({ className }: { className?: string }) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      className={className}
      aria-label="Pickleball"
    >
      {/* Paddle A (left, yellow) — handle bottom-centre, head top-left.
          Pivot near the bottom edge (12, 22) so the head spreads outward
          rather than swinging behind the ball. */}
      <g transform="rotate(-26 12 22)">
        <rect x="10.7" y="11"   width="2.6" height="11"   rx="0.7" fill="#1e3a8a" stroke="#000" strokeWidth="0.5" />
        {/* Grip wraps */}
        <line x1="10.7" y1="14" x2="13.3" y2="14" stroke="#0f172a" strokeWidth="0.5" />
        <line x1="10.7" y1="16" x2="13.3" y2="16" stroke="#0f172a" strokeWidth="0.5" />
        <line x1="10.7" y1="18" x2="13.3" y2="18" stroke="#0f172a" strokeWidth="0.5" />
        {/* Paddle head */}
        <ellipse cx="12" cy="6" rx="5.3" ry="6.3" fill="#fbbf24" stroke="#000" strokeWidth="0.8" />
        <ellipse cx="12" cy="6" rx="3.9" ry="4.9" fill="none"    stroke="#854d0e" strokeWidth="0.4" opacity="0.55" />
      </g>

      {/* Paddle B (right, orange) — mirror of A */}
      <g transform="rotate(26 12 22)">
        <rect x="10.7" y="11"   width="2.6" height="11"   rx="0.7" fill="#7c2d12" stroke="#000" strokeWidth="0.5" />
        <line x1="10.7" y1="14" x2="13.3" y2="14" stroke="#0f172a" strokeWidth="0.5" />
        <line x1="10.7" y1="16" x2="13.3" y2="16" stroke="#0f172a" strokeWidth="0.5" />
        <line x1="10.7" y1="18" x2="13.3" y2="18" stroke="#0f172a" strokeWidth="0.5" />
        <ellipse cx="12" cy="6" rx="5.3" ry="6.3" fill="#fb923c" stroke="#000" strokeWidth="0.8" />
        <ellipse cx="12" cy="6" rx="3.9" ry="4.9" fill="none"    stroke="#7c2d12" strokeWidth="0.4" opacity="0.55" />
      </g>

      {/* Ball perched between/in-front-of the paddle heads — large and
          high-contrast so it reads at thumbnail sizes. */}
      <circle cx="12" cy="7" r="3.8" fill="#fde047" stroke="#000" strokeWidth="0.9" />
      <g fill="#0f172a">
        <circle cx="12"   cy="5.2" r="0.5" />
        <circle cx="13.8" cy="7"   r="0.5" />
        <circle cx="12"   cy="8.8" r="0.5" />
        <circle cx="10.2" cy="7"   r="0.5" />
        <circle cx="13.4" cy="5.6" r="0.4" />
        <circle cx="13.4" cy="8.4" r="0.4" />
        <circle cx="10.6" cy="8.4" r="0.4" />
      </g>
    </svg>
  );
}
