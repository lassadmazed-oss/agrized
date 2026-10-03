import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { alpha, colour } from "./theme";

/**
 * The marks the website draws, drawn.
 *
 * WHY A DEPENDENCY FOR THIS. Every glyph on the site's phone screens is an inline `<svg>` on a 24px grid at
 * stroke 1.8–2.2 with round caps — the back arrow, the search lens, the pin, the share nodes, the chevron.
 * The app was substituting characters: «←» for the forward arrow, «⌕» and «▦» for the two door marks, emoji
 * for the tab bar. A character is a different drawing on each platform, takes the platform's own colour (an
 * emoji leaf is a multicolour Apple glyph, not gold on a wash) and sits on its own baseline, so those were
 * the most visible single-element mismatches on the screen. `react-native-svg` is what makes the site's own
 * `d` attributes reproducible instead of approximated, and it is on Expo's SDK version matrix, so it updates
 * with `expo install` like everything else.
 *
 * EVERY PATH BELOW IS COPIED FROM THE SITE, with the file and line it came from. Nothing is redrawn by eye.
 *
 * MIRRORING. An arrow that means «forward» points physically LEFT in Arabic and right in a Latin language,
 * and it is the same drawing either way — the site writes `ltr:-scale-x-100`. Here the caller passes
 * `edges().flip`, which is that same rule from theme.ts.
 */

type IconProps = {
  /** The side of the square box, in points. The site's `size-6` is 24, `size-5` 20, `size-4` 16. */
  size?: number;
  color?: string;
};

/** projects-phone.tsx:231 — the way back, drawn for Arabic (pointing right, the way the reader came from). */
export function ArrowBack({ size = 24, color = colour.forest }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12h16m0 0-6-6m6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * home-phone.tsx:548 (`ArrowGo`) — forward.
 *
 * The site sets this one as the «←» CHARACTER in two places on the offer screen (the floating door, the map
 * caption) and as this drawn path on the home. The drawing is used for both here: at 16px a text arrow
 * renders as a different shape and on a different baseline on each platform, which is exactly the fault the
 * emoji tab marks had.
 */
export function ArrowGo({ size = 16, color = colour.surface }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 12H4m0 0 6-6m-6 6 6 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** projects-phone.tsx:240 — the search lens on the catalogue's pill-shaped box. */
export function SearchIcon({ size = 20, color = colour.muted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={1.8} />
      <Path d="m20 20-3.6-3.6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** offer-phone.tsx:455 — points the way the reader came from: right on an RTL screen. */
export function ChevronBack({ size = 24, color = colour.forest }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 6 6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** account-screen.tsx — the chevron that closes a row that is a link. */
export function ChevronForward({ size = 20, color = colour.lineStrong }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 6 8.5 12l6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** offer-phone.tsx:463 — three nodes and the two lines between them. */
export function ShareIcon({ size = 20, color = colour.forest }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={18} cy={5} r={3} stroke={color} strokeWidth={1.8} />
      <Circle cx={6} cy={12} r={3} stroke={color} strokeWidth={1.8} />
      <Circle cx={18} cy={19} r={3} stroke={color} strokeWidth={1.8} />
      <Path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** offer-phone.tsx:474 — the place mark beside an offer's governorate. */
export function PinIcon({ size = 16, color = colour.muted }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx={12} cy={10} r={2.5} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

/** offer-card.tsx:328 — the same mark on a cover's foot, gold so it reads on a photograph of any season. */
export function PinGlyph({ size = 16, color = colour.goldBright }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.5s7-6 7-11.3a7 7 0 1 0-14 0c0 5.3 7 11.3 7 11.3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={9.9} r={2.4} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * offer-phone.tsx:405 — a DRAWN preview of a location, not a map of it.
 *
 * The site's own reasoning, kept because it is the whole point: a static map needs a keyed tile service this
 * project does not have, and a picture of the WRONG place would be worse than no picture. What this gives is
 * the shape of the thing — roads, a plot, a pin — so the box reads as a location rather than as a link, and
 * the control under it opens the real map at the offer's own coordinates, which is where an exact answer
 * belongs.
 *
 * `preserveAspectRatio="xMidYMid slice"` is the site's, and react-native-svg honours it, so the sketch fills
 * a 2:1 box the same way at every width.
 */
export function MapSketch() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice">
      <Rect width={320} height={160} fill="#EDEADC" />
      <G stroke="#DAD5C2" strokeWidth={1}>
        <Path d="M0 32h320M0 64h320M0 96h320M0 128h320M40 0v160M80 0v160M120 0v160M160 0v160M200 0v160M240 0v160M280 0v160" />
      </G>
      <Path d="M-10 120 Q 80 96 160 112 T 330 92" fill="none" stroke="#CFC8B0" strokeWidth={7} />
      <Path d="M40 -10 Q 70 64 130 104 T 190 170" fill="none" stroke="#CFC8B0" strokeWidth={5} />
      <Path d="M150 56 L228 68 L236 112 L158 102 Z" fill="#7CA03F" fillOpacity={0.32} stroke="#4F7527" strokeWidth={2} />
      <G transform="translate(192,84)">
        <Path d="M0 12 C 0 12 -10 2 -10 -5 A 10 10 0 0 1 10 -5 C 10 2 0 12 0 12 Z" fill="#1B4429" />
        <Circle cx={0} cy={-5} r={3.5} fill="#E7C566" />
      </G>
    </Svg>
  );
}

/**
 * site-photo.tsx:74 — an olive grove drawn in the brand colours, for a picture that is not there.
 *
 * It is deterministic per seed, so two placeholders on one screen do not look like the same missing image,
 * and it is what makes an offer with no photograph read as a deliberate cover rather than as a gap. Every
 * live offer has one today; a new one in the Back Office does not until somebody uploads.
 *
 * The site's colours are CSS variables resolved by the browser; here they are the same tokens from theme.ts.
 */
export function GrovePlaceholder({ seed }: { seed: string }) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;

  const trees = Array.from({ length: 5 }, (_, index) => {
    const spread = ((hash + index * 173) % 100) / 100;
    return {
      x: 60 + index * 70 + spread * 26,
      y: 172 + ((hash + index * 61) % 22),
      scale: 0.74 + ((hash + index * 37) % 55) / 100,
    };
  });

  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`sky-${hash}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={colour.goldSoft} />
          <Stop offset="100%" stopColor={colour.leafSoft} />
        </LinearGradient>
      </Defs>

      <Rect width={400} height={300} fill={`url(#sky-${hash})`} />
      <Circle cx={300 + (hash % 40)} cy={62} r={26} fill={colour.goldBright} opacity={0.5} />

      <Path
        d={`M0 ${150 + (hash % 18)} Q 110 ${104 + (hash % 30)} 226 ${152 + (hash % 14)} T 400 138  L400 300 L0 300 Z`}
        fill={colour.leaf}
        opacity={0.35}
      />
      <Path
        d={`M0 ${190 + (hash % 12)} Q 150 ${150 + (hash % 24)} 400 186 L400 300 L0 300 Z`}
        fill={colour.forest600}
        opacity={0.22}
      />
      <Rect y={238} width={400} height={62} fill={colour.forest} opacity={0.12} />

      {trees.map((tree) => (
        <G key={tree.x} transform={`translate(${tree.x} ${tree.y}) scale(${tree.scale})`}>
          <Path d="M0 46 L0 14" stroke={colour.forest700} strokeWidth={5} strokeLinecap="round" opacity={0.55} />
          <Circle cx={0} cy={2} r={20} fill={colour.forest} opacity={0.5} />
          <Circle cx={-13} cy={12} r={13} fill={colour.forest600} opacity={0.5} />
          <Circle cx={13} cy={11} r={12} fill={colour.leaf} opacity={0.55} />
        </G>
      ))}
    </Svg>
  );
}

/** The scrim the offer card draws over its cover, as a plain colour list for expo-linear-gradient. */
export const COVER_SCRIM = {
  /** offer-card.tsx:307 — `from-forest-700/92 via-forest-700/26 to-forest-700/8`, written top-to-bottom. */
  colors: [alpha(colour.forest700, 0.08), alpha(colour.forest700, 0.26), alpha(colour.forest700, 0.92)] as const,
  locations: [0, 0.5, 1] as const,
};
