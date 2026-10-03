/**
 * The same palette, rhythm, radii, elevations and type scale the website is built from
 * (src/app/globals.css), as plain values.
 *
 * It is copied rather than imported because nothing can cross that boundary: the site's tokens live in
 * Tailwind `@theme` blocks, which is CSS the bundler reads at build time and a native app never sees. Copying
 * is therefore not laziness, it is the only option — and the reason every value below carries the name of the
 * CSS token it came from is so a change on the site can be found and repeated here instead of the two drifting
 * silently.
 *
 * WHY THE APP IS NOT «THE SITE IN A WEBVIEW». A visitor who installs an app expects a native list that flicks,
 * native photographs, and a tab bar under their thumb. What is shared with the site is the DATA — the same
 * `public_projects` rows and the same `settings` sentences the website reads — and the DESIGN, to the pixel.
 * What is not shared is the implementation: a CSS marquee becomes a list that flicks, a `position: fixed` bar
 * becomes a navigator that owns its own safe area. The design is copied exactly; the mechanism is not copied
 * at all.
 *
 * EVERY NUMBER HERE IS RESOLVED AT 375px, and that is deliberate. The site's three largest type tokens are
 * `clamp()` expressions, and at 375px all three sit at their minimum — so the minimum is written as a plain
 * number rather than re-derived from a formula. A phone never leaves the floor, and an app that interpolated
 * would drift from the site the day somebody changed a clamp.
 */

import { Platform, type TextStyle, type ViewStyle } from "react-native";

// ---------------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------------

/** globals.css `@theme` — the brand tokens, taken from the logo. Each key is its `--color-*` name. */
export const colour = {
  paper: "#f7f5ee", // --color-paper
  surface: "#ffffff", // --color-surface
  ink: "#1b2a1f", // --color-ink
  muted: "#5a685c", // --color-muted
  line: "#e3e0d4", // --color-line
  lineStrong: "#cfcab8", // --color-line-strong

  forest: "#1f4a2c", // --color-forest
  forest700: "#163821", // --color-forest-700
  forest600: "#2a5c38", // --color-forest-600
  leaf: "#6e8e3a", // --color-leaf
  leafSoft: "#e8eed9", // --color-leaf-soft

  gold: "#a87c22", // --color-gold
  goldBright: "#d6b04a", // --color-gold-bright
  goldSoft: "#f4e8c9", // --color-gold-soft

  danger: "#a33b2c", // --color-danger
  dangerSoft: "#f7e3de", // --color-danger-soft
  success: "#2d6e45", // --color-success
  successSoft: "#deeee2", // --color-success-soft

  /** globals.css `.field::placeholder` — the one grey that is not in the `@theme` block. */
  placeholder: "#9aa39b",
} as const;

export type Colour = (typeof colour)[keyof typeof colour];

function channels(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Tailwind's `/40`, as a native colour: `alpha(colour.goldSoft, 0.4)` is `bg-gold-soft/40`.
 *
 * IT MUST NOT BE DONE WITH `opacity`. A View's opacity fades its children too, so a card whose ground was
 * meant to be 40 % gold would also hand the reader a 40 % border and 40 % text. The alpha belongs to the
 * colour, and the parent's ground composites behind it exactly as the browser composites over `body`.
 */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * CSS `color-mix(in srgb, a <pct>, b)`, as an opaque hex. The two are not interchangeable: `alpha` leaves a
 * translucent colour that the ground shows through, `mix` resolves to one flat value — which is what
 * `.card-estimate` asks for, because a dashed edge over a translucent ground would show the page through the
 * dashes.
 */
export function mix(a: string, b: string, weightOfA: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const part = (x: number, y: number) => Math.round(x * weightOfA + y * (1 - weightOfA));
  return `#${[part(ar, br), part(ag, bg), part(ab, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Colours the site writes as a `color-mix`, resolved once here so no call site repeats the arithmetic. */
export const blend = {
  /** `.card-estimate` ground: `color-mix(in srgb, gold-soft 50%, surface)` → a warm, opaque cream. */
  estimateGround: mix(colour.goldSoft, colour.surface, 0.5),
  /** `.card-estimate` edge: `color-mix(in srgb, gold 40%, line-strong)`. */
  estimateEdge: mix(colour.gold, colour.lineStrong, 0.4),
  /**
   * The wordmark's «Zed». The site clips a `gold-bright → gold` vertical gradient to the glyphs, which has no
   * native equivalent without a mask view; at 18.4px across three letters the two stops are indistinguishable
   * from their midpoint, so the midpoint is the honest substitute — and it is derived here rather than typed
   * as a magic hex, so it follows the two gold tokens if either changes.
   */
  goldMid: mix(colour.goldBright, colour.gold, 0.5),
} as const;

// ---------------------------------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------------------------------

export type Dir = "rtl" | "ltr";

/**
 * Arabic, written as Arabic.
 *
 * `writingDirection` is set per text rather than by forcing `I18nManager.forceRTL` at launch. Forcing it flips
 * the whole app — but only after a restart, so the first run in Expo Go and the first run after install are
 * both laid out backwards, which is the one impression that cannot be taken back. Setting the direction on the
 * text itself is correct on the very first frame, every time, and it leaves the few places that genuinely need
 * a fixed order (a figure beside its unit) under this file's control instead of the platform's.
 *
 * THE CONSEQUENCE, WRITTEN DOWN BECAUSE IT CATCHES EVERYONE: with `I18nManager.isRTL` left false, every row
 * Yoga lays out is physically left-to-right, and React Native's own `start`/`end` props (`marginStart`,
 * `insetStart`, `paddingStart`…) resolve to LEFT and RIGHT, not to the reading edges. So they are NOT the
 * site's `ms-*` / `start-*` / `end-*`, and using them for a logical edge puts the brand lockup, the language
 * chip and the FAQ marker on the wrong side. Ask `readingRow`, `alignToEnd` and `edges` below instead.
 */
export const rtl = { writingDirection: "rtl", textAlign: "right" } as const satisfies TextStyle;

/** The same, for a Latin language. */
export const ltr = { writingDirection: "ltr", textAlign: "left" } as const satisfies TextStyle;

/**
 * A figure is read left to right in Arabic too, so a number never takes `rtl`: it takes this, which centres or
 * end-aligns the glyphs without reversing them, and asks the font for fixed-width digits so a column of
 * figures lines up and a counter does not jog as it changes.
 */
export const numeric = { writingDirection: "ltr", fontVariant: ["tabular-nums"] } satisfies TextStyle;

let layoutDir: Dir = "rtl";

/**
 * The app's reading direction, in one place.
 *
 * Arabic today. The website has been five languages since 0109, so the Latin ones have to mirror back, and the
 * difference between «a later language is a settings change» and «a later language is a rewrite» is whether
 * every row asked this or wrote `row-reverse` by hand. Call `setDirection` once, before the tree renders, from
 * wherever the chosen language is resolved.
 */
export function direction(): Dir {
  return layoutDir;
}

export function setDirection(next: Dir): void {
  layoutDir = next;
}

export function isRTL(): boolean {
  return layoutDir === "rtl";
}

/** `rtl` or `ltr`, whichever the current language is. For a Text whose language is the app's. */
export function textDir(dir: Dir = layoutDir): TextStyle {
  return dir === "rtl" ? rtl : ltr;
}

/**
 * A row in READING order: its first child sits at the start edge — the RIGHT in Arabic, the left in the four
 * Latin languages. This is what a plain `flex-row` means on the site, where `direction: rtl` is on `<html>`.
 */
export function readingRow(dir: Dir = layoutDir): ViewStyle {
  return { flexDirection: dir === "rtl" ? "row-reverse" : "row" };
}

/**
 * A row whose order is PHYSICAL and must never mirror. It says so on purpose rather than inheriting, because
 * the cases are specific and each one is a decision:
 *
 *   · a figure beside its unit, or a price beside its currency — «167 د.ت» is one token and reads one way;
 *   · the brand lockup, where the eye must meet the emblem and then «AgriZed» in every language;
 *   · anything whose order came from a photograph or a drawing rather than from a sentence.
 *
 * Everything else wants `readingRow`.
 */
export const fixedRow = { flexDirection: "row" } as const satisfies ViewStyle;

/**
 * `ms-auto`: pushed to the END edge of the reading direction, which is the LEFT in Arabic — where the owner
 * asked for the phone's logo on 2026-10-03 — and the right in the Latin languages.
 *
 * `flex-start` really is the Arabic answer: with `I18nManager.isRTL` false, `alignSelf: 'flex-start'` is the
 * physical left, and the reading END in a right-to-left language is the physical left.
 */
export function alignToEnd(dir: Dir = layoutDir): ViewStyle {
  return { alignSelf: dir === "rtl" ? "flex-start" : "flex-end" };
}

/** `me-auto`: the START edge — the RIGHT in Arabic. */
export function alignToStart(dir: Dir = layoutDir): ViewStyle {
  return { alignSelf: dir === "rtl" ? "flex-end" : "flex-start" };
}

/**
 * Which physical side each reading edge is on, for `position: absolute` and for a mirrored glyph.
 *
 *   const { start, end } = edges();
 *   <View style={{ position: "absolute", top: 12, [end]: 12 }} />   // the site's `end-3 top-3`
 *
 * `flip` is the `ltr:-scale-x-100` the site puts on every arrow: an arrow that points forward points
 * physically left in Arabic and right in a Latin language, and it is the same drawing either way.
 */
export function edges(dir: Dir = layoutDir): {
  start: "left" | "right";
  end: "left" | "right";
  flip: ViewStyle;
} {
  return dir === "rtl"
    ? { start: "right", end: "left", flip: {} }
    : { start: "left", end: "right", flip: { transform: [{ scaleX: -1 }] } };
}

/**
 * The first-strong isolate a holder's name is wrapped in (U+2068 … U+2069) lives in ./config as `isolate`,
 * beside the `ui.zitounti.greeting` text it is used on. Named here only so nobody adds a second one: it is a
 * bidi concern and it looks like it belongs in this file, and one of it is the point.
 */

// ---------------------------------------------------------------------------------------------------
// Spacing, radii
// ---------------------------------------------------------------------------------------------------

/**
 * globals.css `@theme static` — the rhythm the pages already keep. Named by the role, so nothing is spaced by
 * eye and a `p-card` on the site is `space.card` here.
 *
 * `xs … xxl` are the names this file used before the site's scale was copied in. They are kept as aliases so
 * nothing breaks while the screens are rewritten; new code should name the site's token. `xxl` is the one with
 * no counterpart on the site at all.
 */
export const space = {
  hair: 4, // --spacing-hair
  tight: 8, // --spacing-tight
  snug: 12, // --spacing-snug
  cozy: 16, // --spacing-cozy
  card: 20, // --spacing-card  (p-5, the padding of most cards)
  roomy: 24, // --spacing-roomy
  section: 40, // --spacing-section
  band: 64, // --spacing-band  (py-16, one section of the home page)

  /*
   * THE SIX xs..xxl ALIASES ARE GONE. They were this app's own scale before the site's names were copied in,
   * and they were kept as aliases so the screens would compile while they were rewritten one at a time. The
   * rewrite has landed and not one of them is referred to any more — checked, all six at zero.
   *
   * They are deleted rather than left harmless because the vocabulary IS the design here. `xxl: 32` answered
   * to no token on the website at all, so any later use of it would have been off-design by construction; and
   * the pair `card: 20` / `band: 64` that the site does have has no short name, so a screen reaching for
   * «the big one» would have found 32 and missed both. One name per measurement the site actually uses.
   */
} as const;

/**
 * globals.css `@theme static`, plus the three Tailwind radii the phone design uses directly.
 *
 * `--radius-card` is 1rem on purpose: that is what `rounded-2xl` resolves to, so a `.card` and a hand-written
 * card keep the same corner. `--radius-control` is the 12px corner of `.btn` and `.field` — the app's buttons
 * used to be pills, and the site's are not.
 */
export const radius = {
  mark: 10, // rounded-[0.625rem] — the 28px icon squares of the two door cards
  control: 12, // --radius-control, = rounded-xl
  card: 16, // --radius-card, = rounded-2xl
  hero: 24, // rounded-3xl — the hero card, the counter band, the holdings card
  choice: 14, // globals.css `.choice`
  pill: 9999, // --radius-pill

  /* The four sm/md/lg/xl aliases are gone with the spacing ones above, and for the same reason: every corner
     on the website is one of the six named radii, and `sm: 8` was not any of them. */
} as const;

/**
 * The page frame the phone screens share (home-phone.tsx: `mx-auto max-w-md px-4 pb-6 pt-3`).
 *
 * `top` is before the safe-area inset is added: the site's 12px sits under a browser chrome that has already
 * cleared the status bar, and a native screen has to clear it itself (`12 + insets.top`).
 */
export const frame = {
  maxWidth: 448, // max-w-md
  gutter: 16, // px-4
  top: 12, // pt-3
  bottom: 24, // pb-6  (the catalogue uses pb-8 = 32)
} as const;

// ---------------------------------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------------------------------

/**
 * THE WEBSITE'S THREE ELEVATIONS, REPRODUCED RATHER THAN APPROXIMATED.
 *
 * The note that used to stand here said React Native cannot take a spread, so the shadows had to be the
 * closest pair that read the same. That is no longer true, and it is worth saying exactly why, because it is
 * the difference between the site's shadows and a guess at them.
 *
 * React Native 0.76 added `boxShadow`, and 0.86 has it: a LIST of shadows, each with its own offset, blur,
 * spread and colour, implemented against the CSS specification on both platforms — sigma = blur / 2, the
 * source rect inflated by the spread, the list painted in CSS z-order. So `--shadow-card` is not translated
 * here, it is transcribed: the same two layers, the same 14px offset, the same 34px blur, the same −22px
 * spread, the same 22 % ink. Verified in the installed copy of React Native, not assumed:
 * `ReactAndroid/.../drawable/OutsetBoxShadowDrawable.kt` quotes the spec paragraph and halves the blur, and
 * `ReactCommon/react/renderer/components/view/YogaStylableProps.cpp` is the shared renderer both platforms
 * use, so iOS and Android are the same code path.
 *
 * THE ONE PLATFORM GATE. That same Kotlin file sets `MIN_OUTSET_BOX_SHADOW_SDK_VERSION = 28`, and
 * `BackgroundStyleApplicator.setBoxShadow` silently skips a shadow below it — it does not fall back to
 * anything. So on Android 8 and older a `boxShadow` draws NOTHING, and those builds get `elevation` instead:
 * a Material shadow, downward only, whose shape cannot be set. It is an approximation and it is named as one.
 * iOS has no such gate.
 *
 * WHY `elevation` IS NOT SET ALONGSIDE `boxShadow`. It would draw as well, not instead — two shadows on every
 * card on every modern Android phone. The branch below is on `Platform.Version`, which on Android is the API
 * level, so each device gets exactly one of the two.
 *
 * THE ELEVATION NUMBERS WERE CHOSEN BY REACH, NOT BY EYE. The CSS shadows were integrated numerically on the
 * vertical centre line of four real elements from this design — the 319×54 stats bar, the 176×160 offer tile,
 * a 343×220 FAQ panel and a 343×88 catalogue row — to get the alpha at 0, 2, 4 … 44px below the bottom edge.
 * `--shadow-card` peaks at 0.11 and is gone by 26px, which is Material's elevation 6; `--shadow-raise` peaks
 * at 0.04 and is gone by 3px, which is as close to elevation 1 as Android's integer scale allows.
 *
 * AND ONE THING THE MEASUREMENT FOUND THAT THE CSS DOES NOT SAY OUT LOUD: `--shadow-float`'s big layer is
 * `0 30px 60px -30px`, and a −30px spread on all four sides needs an element taller than 60px to survive. The
 * stats bar is about 54. So on the phone home the browser paints only that shadow's first layer,
 * `0 2px 8px / 0.08` — the bar's shadow on the photograph is light and tight, not a deep pool. Transcribing
 * both layers reproduces this for free, because the spread rule is the specification's and React Native
 * implements it; the pair of RN values this file used to carry could not, and drew the pool at every size.
 */
type Shadow = Pick<ViewStyle, "boxShadow" | "elevation" | "shadowColor">;

const ANDROID_WITHOUT_BOX_SHADOW = Platform.OS === "android" && Number(Platform.Version) < 28;

function elevated(css: NonNullable<ViewStyle["boxShadow"]>, fallbackElevation: number): Shadow {
  if (ANDROID_WITHOUT_BOX_SHADOW) {
    return { elevation: fallbackElevation, shadowColor: colour.ink };
  }
  return { boxShadow: css };
}

const INK = (a: number) => alpha(colour.ink, a);

export const shadow = {
  /**
   * `--shadow-raise`: `0 1px 2px rgb(27 42 31 / 0.05)`. Almost invisible alone, and the reason a run of cards
   * reads as a set rather than as loose rectangles. Every `.card` carries it.
   */
  raise: elevated([{ offsetX: 0, offsetY: 1, blurRadius: 2, color: INK(0.05) }], 1),

  /** `--shadow-card`: `0 1px 2px / 0.05, 0 14px 34px -22px / 0.22`. A `.panel` — one block, lifted. */
  card: elevated(
    [
      { offsetX: 0, offsetY: 1, blurRadius: 2, color: INK(0.05) },
      { offsetX: 0, offsetY: 14, blurRadius: 34, spreadDistance: -22, color: INK(0.22) },
    ],
    6,
  ),

  /** `--shadow-float`: `0 2px 8px / 0.08, 0 30px 60px -30px / 0.45`. The figures bar over the photograph. */
  float: elevated(
    [
      { offsetX: 0, offsetY: 2, blurRadius: 8, color: INK(0.08) },
      { offsetX: 0, offsetY: 30, blurRadius: 60, spreadDistance: -30, color: INK(0.45) },
    ],
    12,
  ),

  /**
   * The tab bar's own, which is the one shadow on the site that points UP
   * (tab-bar.tsx: `shadow-[0_-6px_18px_-12px_rgb(27_42_31/0.35)]`).
   *
   * Android's `elevation` cannot do this at all — it casts downward, always — so below API 28 the bar is left
   * with its 1px top hairline and nothing else, which is honest: a bar with a shadow on the wrong side is
   * worse than a bar with none.
   */
  bar: elevated([{ offsetX: 0, offsetY: -6, blurRadius: 18, spreadDistance: -12, color: INK(0.35) }], 0),

  /**
   * `.card-estimate`, and anything else whose statement is that it is NOT an object on the page.
   *
   * It names both keys empty rather than being an empty object, because a style has to be able to UNDO what
   * an earlier one in the same array brought: `[card, shadow.none]` must actually take the raise off, and
   * spreading `{}` over it does nothing at all.
   */
  none: { boxShadow: [], elevation: 0 },
} satisfies Record<string, Shadow>;

/**
 * `0 0 0 3px` — a ring rather than a shadow, for `.field:focus`. The same mechanism, so it needs the same
 * platform note: on Android 8 and older there is no ring and the border colour alone says the field is
 * focused.
 */
export function ring(color: string, width = 3): ViewStyle {
  if (ANDROID_WITHOUT_BOX_SHADOW) return {};
  return { boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: width, color }] };
}

/** True when this device draws `boxShadow`. Exported so a screen can say what it is compensating for. */
export const hasBoxShadow = !ANDROID_WITHOUT_BOX_SHADOW;

// ---------------------------------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------------------------------

/**
 * The site's two typefaces (src/app/fonts.ts): IBM Plex Sans Arabic for everything, Markazi Text for every
 * heading, section title, card name, price and counter figure. The app loaded neither, so none of those
 * matched at any size — and they are the three things a reader actually looks at.
 *
 * THE FAMILY NAMES ARE THE CONTRACT. On native there is no such thing as asking a family for a weight: each
 * weight is registered under its own family name, and a style has to name the exact one. These are the names
 * `@expo-google-fonts/ibm-plex-sans-arabic` and `@expo-google-fonts/markazi-text` register, so whichever way
 * the root layout loads them — those packages, or five static `.ttf` files handed to `useFonts` under these
 * keys — the type scale below resolves.
 *
 * MARKAZI IS BUNDLED AT 700 AND 400. The site loads Markazi with no weight array (the 400 file) and then asks
 * for `font-bold` everywhere, and the browser synthesises the bold. Native synthetic bold for Arabic is
 * unreliable on both platforms, so the real bold face is bundled instead.
 */
export const FONT = {
  sans: {
    400: "IBMPlexSansArabic_400Regular",
    500: "IBMPlexSansArabic_500Medium",
    600: "IBMPlexSansArabic_600SemiBold",
    700: "IBMPlexSansArabic_700Bold",
  },
  display: {
    400: "MarkaziText_400Regular",
    700: "MarkaziText_700Bold",
  },
} as const;

/** Every family name the root layout has to register, for a `useFonts` map or an asset check. */
export const FONT_FAMILIES: readonly string[] = [
  ...Object.values(FONT.sans),
  ...Object.values(FONT.display),
];

/**
 * ONE DECISION, IN ONE FUNCTION: a style names both the weight's own family AND `fontWeight`.
 *
 * The family is what actually picks the face. `fontWeight` is kept beside it so that a build where the fonts
 * have not been bundled — the first run of a branch, a bad asset path — still renders a heading bold in the
 * system Arabic face instead of rendering every title at regular weight, which looks like a broken screen
 * rather than a missing font.
 *
 * If Android ever draws a synthetic bold ON TOP of `MarkaziText_700Bold`, the cure is to drop `fontWeight`
 * here, in this one function, and nowhere else.
 */
function face(family: string, weight: NonNullable<TextStyle["fontWeight"]>): TextStyle {
  return { fontFamily: family, fontWeight: weight };
}

/** `--font-sans`: IBM Plex Sans Arabic, at one of its four bundled weights. */
export function sans(weight: 400 | 500 | 600 | 700 = 400): TextStyle {
  return face(FONT.sans[weight], String(weight) as NonNullable<TextStyle["fontWeight"]>);
}

/** `--font-display`: Markazi Text — every heading, every price, every counter figure. */
export function display(weight: 400 | 700 = 700): TextStyle {
  return face(FONT.display[weight], String(weight) as NonNullable<TextStyle["fontWeight"]>);
}

// ---------------------------------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------------------------------

/**
 * Type, named by the role the text plays rather than by its size — the site's own rule, and the reason a class
 * and a hand-written heading stay the same height.
 *
 * NO `letterSpacing`, ANYWHERE, AT ANY SIZE. home-phone.tsx states it twice as a rule: tracking breaks the
 * joins in Arabic. It is not set to 0 either, because RN's default is already none and an explicit 0 invites
 * somebody to change it.
 *
 * A SIZE THE SITE WRITES ONCE STAYS A LITERAL AT ITS CALL SITE. The site itself writes `text-[0.5rem]` for the
 * one 8px prefix on an offer tile; naming that here would suggest it is a role. What is named below is what
 * appears more than once, or what the stylesheet itself names.
 *
 * SYSTEM TEXT SCALING IS LEFT ON. A reader who enlarged their phone's text gets larger text than the website
 * shows them, and that is correct — `allowFontScaling={false}` would be matching the website by taking an
 * accessibility setting away. Every size below is therefore a base, not a promise.
 */
type TypeScale = Record<string, TextStyle>;

function buildType(dir: Dir): TypeScale {
  const dirStyle = textDir(dir);
  /**
   * The direction WITHOUT an alignment, for text inside a centred control.
   *
   * A chip, a pill and a button all centre their words, so `textAlign` would be fighting `justifyContent` —
   * but the direction still has to be there, because these are the labels that mix a figure with a word
   * («49 م²», «100 زيتونة متاحة») and bidi gets that wrong without being told which way the line runs.
   */
  const bidi = { writingDirection: dir } as const;
  return {
    // ---- the site's own tokens (globals.css `@theme static` and the component layer) ----

    /** `--text-display` at 375px, where its clamp sits at the minimum: 2.25rem / 1.1. */
    display: { ...display(700), fontSize: 36, lineHeight: 40 },
    /** `.section-title` — `--text-section-title` at its 1.875rem minimum, 1.25. */
    sectionTitle: { ...display(700), fontSize: 30, lineHeight: 37.5, color: colour.forest, ...dirStyle },
    /** `.stat-figure` — `--text-figure` at its 1.875rem minimum, 1.05. The counter tiles. */
    figure: { ...display(700), fontSize: 30, lineHeight: 31.5, color: colour.forest, ...numeric },
    /** `.stat-label`. */
    statLabel: { ...sans(400), fontSize: 13.6, lineHeight: 21.8, color: colour.muted, ...dirStyle },
    /** `--text-body`: 1rem / 1.75. */
    body: { ...sans(400), fontSize: 16, lineHeight: 28, color: colour.ink, ...dirStyle },
    /** `--text-label`, and `.label`'s own weight: 0.95rem / 1.4, semibold. */
    label: { ...sans(600), fontSize: 15.2, lineHeight: 21.3, color: colour.ink, ...dirStyle },
    /** `--text-caption`, and `.hint`'s colour: 0.85rem / 1.6, muted. */
    caption: { ...sans(400), fontSize: 13.6, lineHeight: 21.8, color: colour.muted, ...dirStyle },
    /** `.error-text`. */
    error: { ...sans(400), fontSize: 14, lineHeight: 21, color: colour.danger, ...dirStyle },
    /** `.chip`. */
    chip: { ...bidi, ...sans(600), fontSize: 14, lineHeight: 17.5, color: colour.ink },
    /** `.pill`. */
    pill: { ...bidi, ...sans(600), fontSize: 12, lineHeight: 15 },
    /** `.btn`: 1rem / 1.2, semibold. */
    button: { ...bidi, ...sans(600), fontSize: 16, lineHeight: 19.2 },

    // ---- the phone screens' own roles, each written more than once on the site ----

    /** home-phone.tsx:261 — the hero headline. 1.75rem / 1.15, pure white, over a photograph. */
    heroHeadline: {
      ...display(700),
      fontSize: 28,
      lineHeight: 32.2,
      color: colour.surface,
      textAlign: "center",
      writingDirection: dir,
      textShadowColor: alpha("#000000", 0.28),
      textShadowOffset: { width: 0, height: 2 },
      // The CSS blur is 28px and RN's radius is a sigma, so half of it. What the shadow is for is giving the
      // words their own ground over the brightest frame of the slideshow, and at 14 they still have it.
      textShadowRadius: 14,
    },
    /**
     * The offer screen's and the account screen's `h1`: 1.375rem / 1.25, SANS.
     *
     * Both files state the sans deliberately — they are the two screens that depart from the display face, and
     * it is written down so nobody restores `font-display` on them.
     */
    sheetTitle: { ...sans(700), fontSize: 22, lineHeight: 27.5, color: colour.forest, ...dirStyle },
    /** The catalogue's centred page name, and the services / FAQ heads: `text-2xl` through `.section-title`. */
    pageTitle: { ...display(700), fontSize: 24, lineHeight: 30, color: colour.forest, ...dirStyle },
    /** The home's «عروضنا» strip head: `text-xl` on the display face. */
    railTitle: { ...display(700), fontSize: 20, lineHeight: 25, color: colour.forest, ...dirStyle },
    /** A catalogue row's name, an offer screen's section head: `text-lg` + `leading-tight`. */
    cardTitle: { ...display(700), fontSize: 18, lineHeight: 22.5, color: colour.forest, ...dirStyle },
    /** The figures bar on the home and the facts bar on the offer: `text-lg`, `leading-none`, tabular. */
    barFigure: { ...display(700), fontSize: 18, lineHeight: 18, color: colour.forest, ...numeric },
    /** A door card's title: `text-[0.8125rem]` + `leading-tight`. */
    tileTitle: { ...sans(600), fontSize: 13, lineHeight: 16.25, ...dirStyle },
    /** 0.625rem with air under it — a door card's note, an offer tile's foot. */
    micro: { ...sans(400), fontSize: 10, lineHeight: 14, color: colour.muted, ...dirStyle },
    /** The same size with `leading-none` — a figures-bar label, a «ابتداءً من» under a price. */
    microTight: { ...sans(400), fontSize: 10, lineHeight: 10, color: colour.muted, ...dirStyle },
    /** A catalogue row's price: display, `text-lg`, `leading-none`, tabular, gold. */
    price: { ...display(700), fontSize: 18, lineHeight: 18, color: colour.gold, ...numeric },
    /** An offer tile's price: the same, at `text-sm`. */
    priceSmall: { ...display(700), fontSize: 14, lineHeight: 14, color: colour.gold, ...numeric },
    /** The offer screen's own price, which is sans with the rest of that screen's head. */
    priceLarge: { ...sans(700), fontSize: 24, lineHeight: 24, color: colour.forest, ...numeric },
    /** A quote card: `--text-label` on the display face, `leading-snug`. */
    quote: { ...display(700), fontSize: 15.2, lineHeight: 20.9, ...dirStyle },

    // ---- aliases kept so nothing breaks while the screens are rewritten ----

    /** @deprecated `sheetTitle` (a screen's own name) or `pageTitle` (a centred page name). */
    title: { ...sans(700), fontSize: 22, lineHeight: 27.5, color: colour.forest, ...dirStyle },
    /** @deprecated a card's name is `cardTitle`; a row's subject is `label`. */
    heading: { ...sans(700), fontSize: 16, lineHeight: 24, color: colour.ink, ...dirStyle },
    /** @deprecated `caption` — which is now the site's 13.6, where this was an invented 13. */
    note: { ...sans(400), fontSize: 13, lineHeight: 19, color: colour.muted, ...dirStyle },
  };
}

const TYPE_CACHE = new Map<Dir, TypeScale>();

/**
 * The scale bound to a reading direction. Built once per direction and kept, because a style object allocated
 * inside a render is a style object allocated sixty times a second.
 */
export function typeFor(dir: Dir = layoutDir): TypeScale {
  let found = TYPE_CACHE.get(dir);
  if (!found) {
    found = buildType(dir);
    TYPE_CACHE.set(dir, found);
  }
  return found;
}

/**
 * THE ARABIC BINDING, which is what every screen uses today, and the reason it is a constant rather than a
 * call: `type.body` reads like a token and `typeFor().body` reads like plumbing.
 *
 * It is baked at module load, so a screen in one of the four Latin languages cannot use it — it would set
 * `writingDirection: 'rtl'` on a French sentence. Ask `typeFor(dir)` there, or override the one text with
 * `...ltr`. Arabic is the source language and the app's only one today; this is the seam where that changes.
 */
export const type: TypeScale = typeFor("rtl");


// ---------------------------------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------------------------------

/**
 * `.card` — a drop-in for `rounded-2xl border border-line bg-surface`, plus `--shadow-raise`.
 *
 * Padding stays at the call site, exactly as the class is used on the site (`class="card p-5"`).
 *
 * THE GROUND IS ALWAYS SET EXPLICITLY, and on Android that is not cosmetic: `elevation` draws against the
 * view's own background, so a shadowed view with no `backgroundColor` shows no shadow at all on an Android 8
 * device. Every surface in this file therefore names its ground.
 */
export const card = {
  backgroundColor: colour.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colour.line,
  ...shadow.raise,
} as const satisfies ViewStyle;

/**
 * `absolute inset-0` — a photograph behind a card, a wash over it, a scrim over a band.
 *
 * IT IS HERE BECAUSE THE OBVIOUS SPELLING IS A TRAP. `StyleSheet.absoluteFillObject` was the idiom for this
 * for a decade and React Native 0.86 has REMOVED it — not deprecated, removed: it is in neither the types nor
 * the runtime source, so `style={StyleSheet.absoluteFillObject}` is `style={undefined}` and the layer it was
 * meant to position renders in the flow instead. A hero wash that does that does not look broken, it looks
 * like a page with no wash, which is the hard kind of bug to see. `StyleSheet.absoluteFill` is the registered
 * replacement and this is the plain object, named once.
 */
export const fill = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const satisfies ViewStyle;

/** `.panel` — the same material for a container holding rows, carrying the full `--shadow-card`. */
export const panel = {
  backgroundColor: colour.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colour.line,
  ...shadow.card,
} as const satisfies ViewStyle;

/**
 * `.card-estimate` — a warm, opaque ground behind a dashed edge, and NO elevation at all.
 *
 * A simulated figure must never be mistaken for real stock, so an estimate is explicitly not an object on the
 * page. React Native's `borderStyle: 'dashed'` honours `borderRadius` on both platforms but draws its dashes
 * at a length it chooses; the edge reads as dashed, which is the whole signal.
 */
export const estimate = {
  backgroundColor: blend.estimateGround,
  borderRadius: radius.card,
  borderWidth: 1.5,
  borderStyle: "dashed",
  borderColor: blend.estimateEdge,
} as const satisfies ViewStyle;
