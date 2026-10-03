import { Image, type ImageStyle } from "expo-image";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { sizedImage, type Offer } from "./api";
import { optionsFor, t, wordFor, type AppConfig } from "./config";
import { GrovePlaceholder } from "./icons";
import { siteFormat } from "./format";
import { colour, radius, space, type } from "./theme";

/**
 * What the catalogue row and the offer screen share: the owner's words for an offer, the two small shapes
 * `globals.css` calls `.pill` and `.chip`, and one image component.
 *
 * It exists so the two screens cannot word the same fact differently. On the website that guarantee comes
 * from `offerCardLabels()` and `stockLabels()` in src/components/site/offers.tsx, built once per page and
 * handed to every surface; this is the same idea with the same keys.
 */

// ---------------------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------------------

/**
 * The name of the section, everywhere it is named (owner, 2026-09-18: «عروضنا»).
 *
 * Emptying `offers.title` falls back to the older `projects.title`, so the section can be renamed from the
 * Back Office without a deploy — the app read `offers.title` alone and would have gone blank on the day he
 * cleared it (`offersTitle`, src/components/site/offers.tsx:146).
 */
export function offersTitle(config: AppConfig): string {
  return t(config, "offers.title") || t(config, "projects.title");
}

/** The production stage of an offer as a visitor reads it («منتج»), on a catalogue card. */
export function productionWord(config: AppConfig, code: string): string {
  return wordFor(config, `ui.cards.production_${code}`, code);
}

/** The planting system, on a catalogue card. */
export function plantationWord(config: AppConfig, code: string): string {
  return wordFor(config, `ui.cards.plantation_${code}`, code);
}

/**
 * The planting system on an OFFER'S OWN PAGE, which reads a different source on purpose: the Back Office
 * list `plantation_system`, whose codes are the ones a project stores (`plantationLabel`,
 * src/app/[lang]/(public)/projects/[code]/page.tsx:784). A code the list no longer offers prints as stored.
 *
 * The two sources agree today («تقليدية» both ways). They are kept apart because the website keeps them
 * apart, and because the card's word is a setting the owner can shorten for a 163px card while the page's is
 * the list's full label.
 */
export function plantationLabel(config: AppConfig, code: string): string {
  return optionsFor(config, "plantation_system").find((option) => option.code === code)?.label ?? code;
}

/** The status word of an offer on a public page (`ui.offer.status_*`), never the Back Office's own Arabic. */
export function statusWord(config: AppConfig, status: string): string {
  return wordFor(config, `ui.offer.status_${status}`, status);
}

/**
 * The words an offer carries about itself, in the order the catalogue builds its filter row from them:
 * production state, then planting system (`offerWords`, projects/page.tsx:125).
 *
 * The filter row is built from these and never from a list typed into the app, so it can never offer a
 * choice that matches no offer.
 */
export function offerWords(config: AppConfig, offer: Offer): string[] {
  return [
    offer.production_status ? productionWord(config, offer.production_status) : null,
    offer.plantation_system ? plantationWord(config, offer.plantation_system) : null,
  ].filter((word): word is string => Boolean(word));
}

/** Names of the active list items an offer picked, in the list's own order (`chosenLabels`, page.tsx:772). */
export function chosenLabels(config: AppConfig, listKey: string, ids: readonly string[]): string[] {
  const chosen = new Set(ids);
  return optionsFor(config, listKey)
    .filter((option) => chosen.has(option.id))
    .map((option) => option.label);
}

/** «متوفّر · بئر عميقة», or null when the team stated nothing (`waterText`, page.tsx:761). */
export function waterText(config: AppConfig, available: boolean | null, note: string | null): string | null {
  const state =
    available === true
      ? t(config, "ui.offer.water_available")
      : available === false
        ? t(config, "ui.offer.water_unavailable")
        : null;
  return [state, note].filter(Boolean).join(" · ") || null;
}

/**
 * The irrigation word.
 *
 * ONE DELIBERATE DIVERGENCE FROM THE SITE, and it is worth stating. The offer page reads
 * `t(config, 'ui.offer.irrigation_' + code)` with no code fallback, and `ui.offer.irrigation_drip` and
 * `ui.offer.irrigation_partial` DO NOT EXIST in the live settings (checked 2026-10-03; only `_rainfed` and
 * `_irrigated` are seeded). So the website would print «ui.offer.irrigation_drip» to a visitor the day an
 * offer is marked drip-irrigated. `wordFor` prints «drip» instead — untranslated, but a word rather than a
 * key. The owner should add the two rows; until he does, neither surface is right and this one is less wrong.
 */
export function irrigationWord(config: AppConfig, code: string): string {
  return wordFor(config, `ui.offer.irrigation_${code}`, code);
}

/** The production stage on an offer's own page, which has its own keys (`ui.offer.production_*`). */
export function productionLabel(config: AppConfig, code: string): string {
  return wordFor(config, `ui.offer.production_${code}`, code);
}

/** Money, areas and counts in the owner's units. Built once per screen, never per row. */
export function format(config: AppConfig) {
  return siteFormat(config);
}

// ---------------------------------------------------------------------------------------------------------
// Status tones
// ---------------------------------------------------------------------------------------------------------

/**
 * `PROJECT_STATUS_TONES` (src/lib/projects.ts:15), resolved from Tailwind classes to the colours they
 * actually paint.
 *
 * The site writes them as `bg-violet-50 text-violet-800 ring-violet-200`. Tailwind 4 defines that palette in
 * `oklch`, so each value below was converted from the exact `oklch` in
 * node_modules/tailwindcss/theme.css rather than from a remembered v3 hex — `violet-800` is #5d0ec0 in v4
 * and #5b21b6 in v3, and guessing would have been visibly off.
 *
 * Only `sold_out` and `operating` can actually reach this app: `app.project_visible` lets a stranger see
 * `published` plus those two, and a published offer wears no pill at all. The rest are carried because the
 * owner can open `projects.list_closed`, and because an unknown status must land on the neutral tone instead
 * of on nothing.
 */
export type Tone = { bg: string; fg: string; ring: string };

const NEUTRAL: Tone = { bg: "#f5f5f4", fg: "#44403b", ring: "#e7e5e4" };

const TONES: Record<string, Tone> = {
  draft: NEUTRAL,
  preparing: { bg: "#fffbeb", fg: "#973c00", ring: "#fee685" },
  internal: { bg: "#f0f9ff", fg: "#00598a", ring: "#b8e6fe" },
  published: { bg: "#ecfdf5", fg: "#006045", ring: "#a4f4cf" },
  sold_out: { bg: "#f5f3ff", fg: "#5d0ec0", ring: "#ddd6ff" },
  operating: { bg: colour.leafSoft, fg: colour.forest, ring: "rgba(110, 142, 58, 0.3)" },
  archived: { bg: "#f5f5f4", fg: "#57534d", ring: "#e7e5e4" },
};

export function statusTone(status: string): Tone {
  return TONES[status] ?? NEUTRAL;
}

// ---------------------------------------------------------------------------------------------------------
// The two small shapes
// ---------------------------------------------------------------------------------------------------------

/**
 * `.pill` — `inline-flex rounded-full px-2.5 py-1 text-xs font-semibold`, with the tone at the call site.
 *
 * `numberOfLines={1}` carries `white-space: nowrap`: a pill is one short fact and a pill that wrapped would
 * change the height of one row in a wrap and misalign the whole line.
 */
export function Pill({
  children,
  tone,
  ring,
  style,
  textStyle,
}: {
  children: ReactNode;
  tone?: Partial<Tone>;
  /** `ring-1 ring-inset`: drawn by `<StatusPill>` on a cover, and NOT by the catalogue row's own pill. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View
      style={[
        shapes.pill,
        tone?.bg ? { backgroundColor: tone.bg } : null,
        ring && tone?.ring ? { borderWidth: 1, borderColor: tone.ring } : null,
        style,
      ]}
    >
      <Text numberOfLines={1} style={[type.pill, { color: tone?.fg ?? colour.muted }, textStyle]}>
        {children}
      </Text>
    </View>
  );
}

/** `.pill .pill-line` — the hairline badge the catalogue rows are built from: white, 1px line, muted text. */
export function PillLine({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[shapes.pill, shapes.pillLine, style]}>
      <Text numberOfLines={1} style={[type.pill, { color: colour.muted }]}>
        {children}
      </Text>
    </View>
  );
}

export const shapes = StyleSheet.create({
  /** `.pill`: radius-pill, 0.25rem/0.625rem, 0.75rem/1.25 semibold. */
  pill: {
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLine: { borderWidth: 1, borderColor: colour.line, backgroundColor: colour.surface },
  /** `.chip`: min-h-9, 0.375rem/0.875rem, 1px line, white, 0.875rem semibold ink. */
  chip: {
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: colour.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * The chosen facet. A SOLID forest fill, a step past `.chip`'s own `bg-leaf-soft` tint — the site's own
   * note says the tint reads as a hover on a phone, where there is no hover (projects-phone.tsx:211).
   */
  chipOn: { borderColor: colour.forest, backgroundColor: colour.forest },
});

// ---------------------------------------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------------------------------------

/**
 * One photograph of an offer, asked for at the size it is drawn.
 *
 * FOUR THINGS IT DOES THAT A BARE `<Image>` DOES NOT, and each is the reason this component exists rather
 * than an `expo-image` at every call site:
 *
 *  1 · IT ASKS FOR THE RIGHT FILE. `sizedImage` turns the storage URL into Storage's own render endpoint at
 *      the drawn size — a catalogue thumbnail is 3.6 KB instead of 262 KB (see `sizedImage`). `scale` is the
 *      pixel density to ask for: 2 covers every current phone and costs a third of what 3 costs.
 *  2 · IT FALLS BACK. If the transformation ever answers an error — the service turned off, an object that is
 *      not an image — `onError` swaps in the original URL, so the worst case is the slow picture rather than
 *      no picture. The second failure gives up and draws the grove.
 *  3 · IT DRAWS SOMETHING WHEN THERE IS NOTHING. A missing cover is the site's drawn olive grove, seeded by
 *      the offer's id, not a grey rectangle.
 *  4 · IT SETS ITS OWN CORNER. Android does not reliably clip a child image to a rounded, elevated parent,
 *      so the radius is repeated on the image itself. That is the single most common Android-only visual bug
 *      in a list of photographs.
 *
 * `cachePolicy="memory-disk"` is what makes a list scrolled twice free: the disk cache survives the app being
 * closed, so the second visit to the catalogue draws from the phone.
 */
export function OfferImage({
  url,
  alt,
  seed,
  width,
  height,
  scale = 2,
  quality,
  corner,
  priority,
  recyclingKey,
  style,
}: {
  url: string | null;
  alt: string | null;
  /** The offer's or picture's id — what makes the drawn grove deterministic. */
  seed: string;
  /** Points, as drawn. `width` may be 0 when the box is fluid; then only `height` sizes the request. */
  width: number;
  height: number;
  scale?: number;
  quality?: number;
  corner?: StyleProp<ImageStyle>;
  priority?: "low" | "normal" | "high";
  recyclingKey?: string;
  style?: StyleProp<ImageStyle>;
}) {
  const [fallback, setFallback] = useState(false);
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <View style={[styles.placeholder, style as StyleProp<ViewStyle>, corner as StyleProp<ViewStyle>]}>
        <GrovePlaceholder seed={seed} />
      </View>
    );
  }

  // `width` is 0 when the box is fluid and only its height is known; then the height sizes both, which for a
  // `resize=cover` request is the dimension that must not be short.
  const sized = fallback
    ? url
    : (sizedImage(url, { width: (width || height) * scale, height: height * scale, quality }) ?? url);

  return (
    <Image
      source={sized}
      accessibilityLabel={alt ?? undefined}
      accessible={Boolean(alt)}
      contentFit="cover"
      // 180ms is what the list already used and it is right: long enough to read as a fade, short enough
      // that a row scrolled past does not arrive mid-animation.
      transition={180}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={recyclingKey}
      placeholder={{ blurhash: BLURHASH }}
      placeholderContentFit="cover"
      onError={() => (fallback ? setBroken(true) : setFallback(true))}
      style={[style, corner]}
    />
  );
}

/**
 * A grove in the brand's own greens, as a blurhash: four bytes of olive and sky that fill the frame while the
 * real photograph arrives. It is the one the app already carried, kept because it is honestly the right
 * colour for every picture in this catalogue.
 */
const BLURHASH = "L6Ec00~qRj00_3WBofay00WB%MRj";

const styles = StyleSheet.create({
  placeholder: { overflow: "hidden", backgroundColor: colour.leafSoft },
});

/** The gap between a row's thumbnail and its words — `p-2.5` and `gap-2.5` are 10, not `space.snug`. */
export const ROW_PAD = 10;

/** `size-17` — the catalogue row's thumbnail, which is the height of the three lines beside it. */
export const THUMB = 68;
