/**
 * The same palette the website is built from (src/app/globals.css), as plain values.
 *
 * It is copied rather than imported because nothing can cross that boundary: the site's colours live in a
 * Tailwind `@theme` block, which is CSS the bundler reads at build time and a native app never sees. Copying
 * is therefore not laziness, it is the only option — and the reason every value below carries its source name
 * is so a change on the site can be found and repeated here instead of the two drifting silently.
 *
 * WHY THE APP IS NOT «THE SITE IN A WEBVIEW». A visitor who installs an app expects a native list that flicks,
 * native photographs, and a tab bar under their thumb. What is shared with the site is the DATA — the same
 * `public_projects` rows the website reads — not the markup.
 */

export const colour = {
  paper: "#f7f5ee",
  surface: "#ffffff",
  ink: "#1b2a1f",
  muted: "#5a685c",
  line: "#e3e0d4",
  lineStrong: "#cfcab8",

  forest: "#1f4a2c",
  leaf: "#6e8e3a",
  leafSoft: "#e8eed9",

  gold: "#a87c22",
  goldBright: "#d6b04a",
  goldSoft: "#f4e8c9",

  danger: "#a33b2c",
  dangerSoft: "#f7e3de",
} as const;

/**
 * Arabic, written as Arabic.
 *
 * `writingDirection` is set per text rather than by forcing I18nManager.forceRTL at launch. Forcing it flips
 * the whole app — but only after a restart, so the first run in Expo Go and the first run after install are
 * both laid out backwards, which is the one impression that cannot be taken back. Setting the direction on
 * the text itself is correct on the very first frame, every time, and it leaves the few places that genuinely
 * need a fixed order (a price beside a label) under this file's control instead of the platform's.
 */
export const rtl = { writingDirection: "rtl", textAlign: "right" } as const;

export const type = {
  /** A screen's name. */
  title: { fontSize: 22, fontWeight: "700", color: colour.forest, ...rtl },
  /** A card's name, a row's subject. */
  heading: { fontSize: 16, fontWeight: "700", color: colour.ink, ...rtl },
  body: { fontSize: 15, lineHeight: 23, color: colour.ink, ...rtl },
  /** Secondary text: a place, a date, a note under a name. */
  note: { fontSize: 13, lineHeight: 19, color: colour.muted, ...rtl },
  /** The smallest thing that is still meant to be read. */
  caption: { fontSize: 11, lineHeight: 15, color: colour.muted, ...rtl },
  /** A figure. Never `rtl`: a number is read left to right in Arabic too. */
  figure: { fontSize: 20, fontWeight: "700", color: colour.forest, textAlign: "right" },
} as const;

/** One rhythm, so nothing is spaced by eye. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** A card's edge. Native shadows differ per platform; this is the pair that matches on both. */
export const card = {
  backgroundColor: colour.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colour.line,
} as const;
