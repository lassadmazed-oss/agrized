/**
 * Outline of Tunisia, simplified from the coastline and borders to about forty points. It is a
 * decorative silhouette (the board's sand-coloured map), not a map to read distances from.
 * Projection: x = (longitude − 7.4) × 83, y = (37.4 − latitude) × 100.
 */
export function TunisiaMap({ className = "h-64 w-auto", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 360 730" className={className} aria-hidden="true">
      <path
        d="M101 46L149 17L203 6L205 13L238 22L232 45L241 62L243 68L263 57L291 38L301 33L307 55L297 62L276 95L261 102L257 137L269 157L285 163L305 190L309 217L280 267L257 288L222 310L224 352L276 372L309 390L345 423L340 460L274 540L232 610L178 716L133 640L75 520L12 425L10 365L41 300L71 250L75 200L87 150L79 100L91 65Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <ellipse cx="291" cy="364" rx="17" ry="13" fill="currentColor" />
      <ellipse cx="318" cy="268" rx="10" ry="6" fill="currentColor" transform="rotate(-30 318 268)" />
      {children}
    </svg>
  );
}
