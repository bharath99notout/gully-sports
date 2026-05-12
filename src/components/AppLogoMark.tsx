export type AppLogoMarkProps = {
  /** Square icon edge length in CSS pixels */
  iconSize?: number;
  /** Show the GullySports wordmark beside the icon */
  wordmark?: boolean;
  /** Tailwind / className for the wordmark span (ignored when wordmark is false) */
  wordmarkClassName?: string;
  className?: string;
};

/**
 * In-app brand mark — same file as PWA / manifest (`/public/icons/icon-192.png`).
 * Uses a plain `<img>` so the icon loads in TWA / in-app WebViews without relying
 * on the `/_next/image` optimizer (which can fail to paint there even when Lucide SVGs work).
 */
export default function AppLogoMark({
  iconSize = 28,
  wordmark = true,
  wordmarkClassName = 'text-lg font-bold text-emerald-400',
  className = '',
}: AppLogoMarkProps) {
  const px = `${iconSize}px`;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={iconSize}
        height={iconSize}
        decoding="async"
        fetchPriority="high"
        className="shrink-0 rounded-lg"
        style={{ width: px, height: px, objectFit: 'contain' }}
      />
      {wordmark && <span className={wordmarkClassName}>GullySports</span>}
    </span>
  );
}
