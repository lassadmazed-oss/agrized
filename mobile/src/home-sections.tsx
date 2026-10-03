import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { supabase, areaPerTree, type Offer } from "./api";
import {
  Chip,
  Disclosure,
  Panel,
  StatTile,
  useReduceMotion,
  type StatCell,
} from "./components";
import { moduleOpen, optionsFor, settingJson, settingText, t, type AppConfig } from "./config";
import { treePriceMillimes, siteFormat } from "./format";
import { ArrowGo, SearchIcon } from "./icons";
import { OfferImage, offersTitle } from "./offer-ui";
import {
  alpha,
  blend,
  card,
  colour,
  display,
  edges,
  isRTL,
  panel,
  radius,
  readingRow,
  alignToEnd,
  sans,
  shadow,
  space,
  type,
} from "./theme";

/**
 * الرئيسية, section by section — the website's phone home, drawn with native views.
 *
 * WHAT THIS FILE IS. The site's phone home is `src/components/site/mobile/home-phone.tsx` and the five
 * sections it composes (quote-strip, counter-band → million-counter, services-map, faq, closing-cta). Each is
 * reproduced here as a React Native component, in the same order, at the same measurements, carrying the same
 * words from the same database rows. `app/(tabs)/index.tsx` is the screen; this is what it draws.
 *
 * COPY THE DESIGN EXACTLY AND THE IMPLEMENTATION NOT AT ALL. Every number below is the resolved value of a
 * Tailwind class in the site's own source — `p-card` is 20, `-mt-10` is −40, `text-[1.75rem]` is 28,
 * `rounded-3xl` is 24 — read off the file rather than guessed, so a change on the site can be found and
 * repeated. What is NOT copied is the mechanism: a CSS marquee becomes a list the reader flicks, a
 * scroll-driven reveal becomes nothing at all, `position: fixed` becomes the navigator's own bar. Each of
 * those is named where it happens.
 *
 * NOT ONE ARABIC SENTENCE IS WRITTEN HERE. Every word is a `public.settings` row read through `./config`, the
 * same rows the browser reads, because the owner edits a sentence once and both surfaces have to change.
 *
 * WHAT IT DOES NOT OWN. The surfaces, the chips, the figures bar, the disclosure rows and the marks are
 * `./components`, `./offer-ui` and `./icons` — one component per CSS class, shared with the other screens, so
 * two screens cannot word or space the same thing differently. Only the HOME's own compositions are here, and
 * the only drawings kept in this file are the marks nothing else uses.
 */

// ---------------------------------------------------------------------------------------------------
// Physical edges, from the logical ones
// ---------------------------------------------------------------------------------------------------

/**
 * `start-0` and `end-0` as React Native sees them.
 *
 * `theme.ts` deliberately does not force `I18nManager`, so `insetStart` resolves to the physical left and is
 * NOT the site's `start-*`. `edges()` says which physical side each reading edge is on; these two turn that
 * into a style without a cast at every call site.
 */
/**
 * `absolute inset-0`, as a plain object.
 *
 * `StyleSheet.absoluteFill` is a registered ViewStyle: it cannot be spread, and it cannot be handed to an
 * Image's style. React Native 0.86's typings no longer carry the plain-object form of it either. So this is
 * that object, once, and no call site writes the four edges by hand.
 */
const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

function atStart(value: number): ViewStyle {
  return edges().start === "right" ? { right: value } : { left: value };
}
function atEnd(value: number): ViewStyle {
  return edges().end === "right" ? { right: value } : { left: value };
}

// ---------------------------------------------------------------------------------------------------
// The two reads the rest of the app does not make
// ---------------------------------------------------------------------------------------------------

/** One photograph slot of the site (`public.site_media`), with the caption the owner wrote for it. */
export type Picture = { slot: string; url: string; alt: string | null };

/**
 * «وين وصلنا؟» — exactly the figures `million_progress()` answers with.
 *
 * EVERY ONE IS NULLABLE AND A MISSING ONE STAYS NULL. The RPC answers a stranger with nothing at all while
 * `public_statistics` is closed, and inside its answer a figure it did not compute is absent — «0 زيتونة
 * محجوزة» is a statement about the business where no answer is simply a gap in the data (src/lib/million.ts).
 */
export type Figures = {
  goal: number | null;
  treesRequested: number | null;
  treesReserved: number | null;
  treesContracted: number | null;
  treesPlanted: number | null;
  participants: number | null;
  projectsUnderStudy: number | null;
  /** m² in the database, hectares on the screen — the conversion belongs to the cell that prints it. */
  areaOfferedM2: number | null;
};

/**
 * The fallback order of the sliding cover (`HERO_SLOTS`, landing/hero.tsx:210).
 *
 * It is used for exactly one window: a database that has not had 0123 applied answers `in_cover` for nothing,
 * and without this the home would open on an empty frame. 0123 seeds the same five as ticked, so applying it
 * changes nothing on screen — it only moves the decision off this line and into الإعدادات ← صور الموقع.
 */
const HERO_SLOTS = ["home.hero", "home.journey", "home.coverage", "home.land", "home.closing"] as const;

export type HomeData = {
  /** The slots the owner ticked for the cover, in his order (`coverSlots`). */
  covers: Picture[];
  /** Every filled slot by name, for `home.coverage` behind the counter band and `home.closing` on the ask. */
  media: Map<string, Picture>;
  progress: Figures | null;
};

const NO_HOME_DATA: HomeData = { covers: [], media: new Map(), progress: null };

/**
 * The photographs.
 *
 * `select("*")` and not a column list, for the reason src/lib/config.ts states at length: naming a column
 * PostgREST has not heard of yet makes it reject the WHOLE query, and that took the site down once when
 * `in_cover` was still a draft. Six rows, so the extra columns cost nothing. `site_media_read` (0015) grants
 * `anon` every one of them.
 */
async function readMedia(): Promise<{ covers: Picture[]; media: Map<string, Picture> }> {
  const { data, error } = await supabase.from("site_media").select("*");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as {
    slot?: unknown;
    url?: unknown;
    alt_ar?: unknown;
    in_cover?: unknown;
    sort_order?: unknown;
  }[];

  const media = new Map<string, Picture>();
  for (const row of rows) {
    if (typeof row.slot !== "string" || typeof row.url !== "string" || !row.url) continue;
    media.set(row.slot, {
      slot: row.slot,
      url: row.url,
      alt: typeof row.alt_ar === "string" && row.alt_ar.trim() ? row.alt_ar : null,
    });
  }

  // `coverSlots()`: the owner's ticked pictures, in the order الإعدادات ← صور الموقع already lists them. A
  // slot with no upload is never returned even when it is ticked — a gap mid-rotation reads as a broken
  // screen rather than as a slot waiting for a photograph.
  const chosen = rows
    .filter((row) => row.in_cover === true)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((row) => (typeof row.slot === "string" ? media.get(row.slot) : undefined))
    .filter((picture): picture is Picture => picture !== undefined);

  const covers =
    chosen.length > 0
      ? chosen
      : HERO_SLOTS.map((slot) => media.get(slot)).filter((picture): picture is Picture => picture !== undefined);

  return { covers, media };
}

async function readProgress(): Promise<Figures | null> {
  const { data, error } = await supabase.rpc("million_progress");
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const figure = (key: string): number | null => {
    const raw = row[key];
    if (raw === null || raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    goal: figure("goal"),
    treesRequested: figure("trees_requested"),
    treesReserved: figure("trees_reserved"),
    treesContracted: figure("trees_contracted"),
    treesPlanted: figure("trees_planted"),
    participants: figure("participants"),
    projectsUnderStudy: figure("projects_under_study"),
    areaOfferedM2: figure("area_offered_m2"),
  };
}

/**
 * The home's own two reads, beside the configuration and the offers every screen already shares.
 *
 * They are here and not in `./config` because nothing else asks for them: the counter band and the sliding
 * cover are this screen, and the offer screen reads its own pictures through `public_project_page`.
 *
 * EACH ONE FAILS ALONE, and so does this hook as a whole. A photograph that did not arrive costs the hero its
 * picture, not the page — `OfferImage` draws the site's own grove instead — and a counter that did not answer
 * takes the band away exactly as a closed statistics module does. Nothing here can blank the screen, which is
 * the fault the old home had: one rejected read among four returned a single empty state for all of it.
 */
export function useHomeData(): { data: HomeData; ready: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<HomeData>(NO_HOME_DATA);
  /**
   * SETTLED, NOT SUCCEEDED. The screen waits on this for its first frame so the figures bar does not render
   * one cell and then jump to four, and a failed read must end that wait as surely as a successful one.
   */
  const [ready, setReady] = useState(false);
  const gone = useRef(false);

  const load = useCallback(async () => {
    const [pictures, progress] = await Promise.all([
      readMedia().catch(() => ({ covers: [] as Picture[], media: new Map<string, Picture>() })),
      readProgress().catch(() => null),
    ]);
    if (gone.current) return;
    setData({ ...pictures, progress });
    setReady(true);
  }, []);

  useEffect(() => {
    gone.current = false;
    void load();
    return () => {
      gone.current = true;
    };
  }, [load]);

  return { data, ready, reload: load };
}

// ---------------------------------------------------------------------------------------------------
// Words this screen names
// ---------------------------------------------------------------------------------------------------

/**
 * The calculator's one word, on every control that opens it (`estimateLabel`, site-header.tsx:23).
 *
 * The rule that file states: every control that opens /start says what /start does, so the hero's door, the
 * bar and the last card can never carry three different words. `site.cta_estimate_label` has no row today and
 * the fallback `site.unit_cta` — «احسب مشروعك» — is what prints.
 */
export function estimateLabel(config: AppConfig): string {
  return settingText(config, "site.cta_estimate_label") || t(config, "site.unit_cta");
}

/**
 * One row of a list the owner writes with a field per language — `{ "ar": "…", "fr": "…" }`. A plain string is
 * its own text (`rowText`, landing/hero.tsx:218).
 *
 * The site reads the row in the page's language FIRST and in Arabic, the source, after it. This reads Arabic
 * only, because Arabic is the app's only language today and asking for a field that cannot exist would be
 * plumbing that pretends. The seam is `theme.ts`'s `direction()`: the day the app resolves a locale, this
 * takes it as an argument and tries `fields[locale]` before `fields.ar`, which is three lines and no caller
 * change.
 */
function rowText(row: unknown): string {
  if (typeof row === "string") return row.trim();
  if (!row || typeof row !== "object") return "";
  const fields = row as Record<string, unknown>;
  return typeof fields.ar === "string" ? fields.ar.trim() : "";
}

// ---------------------------------------------------------------------------------------------------
// The marks only the home draws
// ---------------------------------------------------------------------------------------------------

/**
 * `./icons` holds every mark more than one screen needs. These are the home's own, path for path from
 * home-phone.tsx, million-counter.tsx, services-map.tsx, faq.tsx and closing-cta.tsx — the badge's leaf, the
 * second door's grid, a quote card's olive branch, the counter's five stage marks, the FAQ's question mark
 * and the last card's two glyphs. They are drawn rather than typed for the reason `./icons` states: a
 * character is a different drawing on each platform, cannot take a colour and sits on its own baseline.
 */
type MarkProps = { size: number; color: string };

/** home-phone.tsx:547 — the leaf in the hero badge. */
function LeafMark({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 20C11 12 14 7 21 4c1 7-2 13-10 14z" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** home-phone.tsx:573 — the four squares on the «إكتشف العروض» door. */
function GridMark({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={3} y={3} width={7.5} height={7.5} rx={2} />
        <Rect x={13.5} y={3} width={7.5} height={7.5} rx={2} />
        <Rect x={3} y={13.5} width={7.5} height={7.5} rx={2} />
        <Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={2} />
      </G>
    </Svg>
  );
}

/** quote-strip.tsx:41 — low and large, so a quote card has a picture in it with no photograph to crop. */
function OliveBranch({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill={color}>
        <Path d="M11 20C11 12 14 7 21 4c1 7-2 13-10 14z" />
        <Path d="M11 20c-3-4-6-5-8-4 1 3 4 5 8 4z" />
      </G>
    </Svg>
  );
}

/** million-counter.tsx:406 — the leaf AFTER a section heading, which in Arabic puts it on the left. */
function SectionLeaf({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 3c-7.7 0-12.8 2.9-14.7 7.3-1 2.3-.8 4.6.3 6.3l-2.9 2.9a1 1 0 1 0 1.4 1.4l2.9-2.9c1.7 1.1 4 1.3 6.3.3C18.7 16.4 21.6 11.3 21.6 3.6A.6.6 0 0 0 21 3Z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * million-counter.tsx:350 — a hand raised (asked for), a bookmark (held), a signed page (contracted), a
 * seedling in the ground (planted), an olive sprig for the two context counts.
 *
 * THE MARK NEVER DECIDES WHETHER ITS TILE RENDERS. The Back Office can add a stage this file has never heard
 * of, and then the tile shows with no mark rather than not at all.
 */
function StageMark({ name, size, color }: MarkProps & { name: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {name === "requested" ? (
          <>
            <Circle cx={9.2} cy={7.6} r={3.2} />
            <Path d="M3 20.4c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6" />
            <Path d="M16.2 4.9a3.2 3.2 0 0 1 0 5.6M17.8 15.1c2.1.8 3.2 2.6 3.2 5.3" />
          </>
        ) : null}
        {name === "reserved" ? (
          <>
            <Path d="M6.4 3.4h11.2a1 1 0 0 1 1 1v16.2L12 17.2l-6.6 3.4V4.4a1 1 0 0 1 1-1Z" />
            <Path d="M9.4 8.6h5.2" />
          </>
        ) : null}
        {name === "contracted" ? (
          <>
            <Path d="M6.6 2.6h6.6l4.8 4.8v13.5a.5.5 0 0 1-.5.5H6.6a.5.5 0 0 1-.5-.5V3.1a.5.5 0 0 1 .5-.5Z" />
            <Path d="M13.2 2.6v4.8H18" />
            <Path d="M9.2 15.2l2.2 2.2 3.6-3.8" />
          </>
        ) : null}
        {name === "planted" ? (
          <>
            <Path d="M12 21v-7.4" />
            <Path d="M12 13.6c0-3 2.3-5.2 5.4-5.2 0 3-2.3 5.2-5.4 5.2Z" />
            <Path d="M12 16.2c0-2.6-1.9-4.5-4.6-4.5 0 2.6 1.9 4.5 4.6 4.5Z" />
            <Path d="M4.6 21h14.8" />
          </>
        ) : null}
        {name === "participants" || name === "projects" ? (
          <>
            <Path d="M20.6 3.8c-7.6 0-12.4 2.8-14.3 7-1 2.2-.8 4.4.3 6.1" />
            <Path d="M20.6 3.8c0 7.6-2.8 12.4-7 14.3-2.2 1-4.4.8-6.1-.3" />
            <Path d="M3.6 20.8 7.5 17" />
          </>
        ) : null}
      </G>
    </Svg>
  );
}

/** faq.tsx:61 — the circled question mark that leads «أسئلة شائعة». */
function QuestionMark({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeWidth={1.5} />
      <Path d="M9.4 9.3a2.7 2.7 0 1 1 3.4 2.6c-.8.3-1.2.9-1.2 1.7v.4" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Circle cx={11.6} cy={16.6} r={1} fill={color} />
    </Svg>
  );
}

/** closing-cta.tsx:126 — «تواصل معنا» opens a conversation, so it is drawn as one. */
function ChatBubble({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M17 9.5c0 3.3-3.1 6-7 6a8 8 0 0 1-2.2-.3L4 16.5l1-2.7A5.7 5.7 0 0 1 3 9.5c0-3.3 3.1-6 7-6s7 2.7 7 6Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** landing/hero.tsx:180 (`LandingIcon` "leaf") — the filled mark that leads the services card. */
function ServicesLeaf({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 2.9c-8.6-.5-14.7 2-17.1 6.9-1.9 3.9-.5 8.4 3.1 10.2 3.7 1.9 8.3.2 10.7-3.9C20 12.5 21 8.2 21 2.9Z" fill={color} fillOpacity={0.92} />
      <Path d="M3.6 21.4a.9.9 0 0 1-.5-1.6c2.8-2 5-4.7 6.7-8a.9.9 0 1 1 1.6.8c-1.8 3.6-4.2 6.5-7.3 8.7a.9.9 0 0 1-.5.1Z" fill={color} />
    </Svg>
  );
}

/** landing/hero.tsx:123 (`LandingIcon` "pin") — the filled pin that leads «وين تحب تكون أرضك؟». */
function CoveragePin({ size, color }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22c.35 0 7-6.4 7-11.2A7 7 0 1 0 5 10.8C5 15.6 11.65 22 12 22Zm0-8.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * services-map.tsx:130 — the backdrop of the coverage card: a pin standing over the rows of a grove, at 9 %.
 *
 * It is the site's own sketch and not a map, for the reason that file gives: the project holds no map asset,
 * and what is drawn instead is the brand's own line vocabulary — parcels, which is what we do have. The rows
 * are LINES and not little rectangles, because a run of small boxes behind a run of chips reads as broken
 * chips, which is what the first version of the drawing looked like.
 */
function FieldsDecor() {
  const tint = alpha(colour.leaf, 0.09);
  return (
    <View style={[styles.decor, atEnd(0)]} pointerEvents="none">
      <Svg width={288} height={288} viewBox="0 0 200 200">
        <Path
          d="M100 18c-17 0-30.8 13.4-30.8 30 0 21.5 27.7 51 29 52.3 1 1 2.6 1 3.6 0 1.3-1.3 29-30.8 29-52.3 0-16.6-13.8-30-30.8-30Zm0 42a12 12 0 1 1 0-24 12 12 0 0 1 0 24Z"
          fill={tint}
        />
        <Path
          d="M10 196c26-28 54-48 86-60M46 196c22-24 46-41 72-51M86 196c17-19 36-33 56-41M128 196c11-13 24-23 38-29"
          fill="none"
          stroke={tint}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// The one thing native cannot do: a strip that starts at the reading edge
// ---------------------------------------------------------------------------------------------------

/**
 * A row the reader flicks — the honest native form of the site's two phone strips.
 *
 * WHAT IT REPLACES, AND WHY NOT LITERALLY. The quote strip is a CSS marquee: the cards rendered twice and the
 * track driven to +50 % forever on a 40s loop, paused on hover. The offers strip is a scroll-snap row with
 * LOGICAL scroll padding. Native has no `max-content`, no `:hover`, no logical scroll padding, and a 40s loop
 * running whenever the home screen is mounted is a battery cost a browser tab does not pay. The website
 * itself removed exactly that motion from its own offers strip on 2026-10-03 — the owner's words were «offre
 * remove it» — and wrote down why: a price that slides away while somebody is reading it is the one thing a
 * page selling olive trees cannot afford. The same argument retires the quote marquee here. So this carries
 * the same cards, in the same order, at the same size, and nothing drives it. NATIVE BEHAVIOUR WINS, and the
 * content, the order and the appearance are untouched.
 *
 * THE START EDGE IS THE REAL WORK. Because `theme.ts` deliberately does not force `I18nManager`, a native
 * ScrollView is physically left-to-right: left alone, the first tile lands at the LEFT edge where the website
 * parks it at the RIGHT, and an Arabic reader has to scroll backwards to reach the first offer. Of the two
 * cures — reversing the data, or mirroring the scroller — this MIRRORS: `scaleX: -1` on the ScrollView with
 * every child counter-flipped. It needs no measurement, has no first-frame jump, and leaves `snapToInterval`
 * parking a tile exactly at the start edge. Both platforms transform touch coordinates into a view's own
 * space before delivering them, so the drag still follows the finger: the drawing and the input are mirrored
 * by the same matrix. Reversing the data instead needs an imperative scroll-to-end on mount, which flashes.
 *
 * ONE CONSTANT TO UNDO IT. If the mirror ever reads wrong on a device, it is the `flip` below and nothing
 * else — the children's counter-flip comes from the same place.
 *
 * `interval` is the card's width plus the gap, so a card is always parked and never half shown.
 */
function Flick({
  interval,
  gap,
  lead,
  tail = 0,
  style,
  children,
}: {
  interval: number;
  gap: number;
  lead: number;
  tail?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  // A Latin language needs none of this: its strip already starts where a native ScrollView starts. The
  // mirror is therefore the RTL case only, and it is one condition rather than a transform written twice.
  const mirror = isRTL() ? styles.mirror : null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={interval}
      snapToAlignment="start"
      decelerationRate="fast"
      style={[mirror, style]}
      contentContainerStyle={{ paddingHorizontal: lead, paddingBottom: tail, gap }}
    >
      {Children.map(children, (child, index) => (
        // The flip is undone once per card, so its own words, photograph and shadow are drawn the right way
        // round inside a scroller that is not.
        <View key={index} style={mirror}>
          {child}
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------
// 0 · The brand lockup
// ---------------------------------------------------------------------------------------------------

/**
 * AgriZed, on the end side, above everything (home-phone.tsx:191-197).
 *
 * The site gained this on 2026-10-03, after the owner said «in the mobile view i dont see any logo». He was
 * right, and it was not the logo that was missing — it was the whole bar: below `md` the page takes the site
 * header off, because a second navigation bar on a 375px screen is a row of nothing useful, and the lockup
 * went with it. The app has the same fault for the same reason, now that the tab navigator draws no header:
 * the name has to be ON the screen.
 *
 * `ms-auto`, NOT `ml-auto`, and the site says why: in Arabic the inline END is the physical left, which is
 * the side the owner asked for («make the logo in the mobile on the other side left side»), and the same rule
 * puts it on the right in the four Latin languages. `alignToEnd()` is that rule.
 *
 * THE EMBLEM is the owner's own artwork, bundled from the file the website serves at /brand — the app's
 * launcher icon is a separate job, but a screen cannot ask the network for the brand's own name. It keeps the
 * artwork's cream ground baked in, which all but disappears on paper.
 *
 * THE WORDMARK is live text, exactly as on the site: «Agri» forest, «Zed» gold, the display face, 18.4px,
 * `leading-none`, left-to-right because it is a Latin word inside an Arabic screen. The site clips a
 * gold-bright → gold gradient to the three glyphs with `background-clip: text`, which native cannot do
 * without a mask view; `blend.goldMid` is the midpoint of those two stops, which at this size is
 * indistinguishable from the gradient and costs no dependency.
 */
// Metro resolves a bundled asset through `require`, and an `import` of a `.webp` has no type declaration
// in this project — so this is the typed way to name the file, and the rule is told why once.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EMBLEM = require("../assets/agrized-emblem.webp");

export function BrandLockup({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel="AgriZed"
      android_ripple={null}
      style={[styles.lockup, alignToEnd()]}
    >
      {/* 256 × 241 intrinsic, drawn at `h-9 w-auto` — 36 tall, 38 wide, resolved once. */}
      <Image source={EMBLEM} alt="" accessible={false} contentFit="contain" style={styles.emblem} />
      <Text style={styles.wordmark}>
        <Text style={styles.wordmarkAgri}>Agri</Text>
        <Text style={styles.wordmarkZed}>Zed</Text>
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------
// 0b · The quote strip
// ---------------------------------------------------------------------------------------------------

/**
 * Four grounds, cycled by index — enough that no two neighbours match, few enough that the strip stays one
 * family (quote-strip.tsx:26, resolved from the palette).
 */
const QUOTE_GROUNDS = [
  { bg: colour.forest700, text: colour.paper, quiet: alpha(colour.paper, 0.6), mark: alpha(colour.goldBright, 0.25) },
  { bg: colour.goldSoft, text: colour.forest, quiet: colour.gold, mark: alpha(colour.gold, 0.3) },
  { bg: colour.leafSoft, text: colour.forest, quiet: alpha(colour.forest, 0.6), mark: alpha(colour.leaf, 0.35) },
  { bg: colour.forest, text: colour.paper, quiet: alpha(colour.paper, 0.6), mark: alpha(colour.leaf, 0.35) },
] as const;

const QUOTE_CARD = 256;

/**
 * The proverbs, above the hero (home-phone.tsx:204 → QuoteStrip).
 *
 * PHONE ONLY, AND THE APP HAD THAT RULE BACKWARDS. Its old home argued the strip was dropped «for the reason
 * the site now hides it on wide screens» — but the site wraps it in `md:hidden`: it shows the strip ON a phone
 * and took it off the DESKTOP (owner, 2026-09-24: «remove the quotes from the desktop view»), because across
 * 1200px the first impression of the business becomes a fortune cookie above the thing the visitor came for.
 * The app IS the phone, so the strip belongs here, and leaving it out was a design divergence.
 *
 * FEWER THAN TWO RENDERS NOTHING, as on the site: one card cannot slide anywhere, and an emptied `site.quotes`
 * is how the owner turns the strip off everywhere at once.
 *
 * WHY THESE ARE DRAWN AND NOT PICTURES is quote-strip.tsx's own argument and it carries over intact: a quote
 * card made as a raster has exactly one size, crops the moment the frame's ratio changes, cannot be
 * translated and has to be re-exported to fix a comma. Drawn, the words come from `site.quotes` and the owner
 * rewrites a line without anyone opening a design tool.
 */
export function QuoteStrip({ config }: { config: AppConfig }) {
  const quotes = useMemo(
    () =>
      settingJson<unknown[]>(config, "site.quotes", [])
        .map((row) => ({
          ar: rowText(row),
          by: typeof (row as { by?: unknown })?.by === "string" ? ((row as { by: string }).by) : undefined,
        }))
        .filter((quote) => quote.ar),
    [config],
  );
  if (quotes.length < 2) return null;

  return (
    // `-mx-4`: the strip bleeds past both gutters of the page's 16px column.
    <Flick interval={QUOTE_CARD + space.tight} gap={space.tight} lead={space.cozy} style={styles.quoteStrip}>
      {quotes.map((quote, index) => {
        const ground = QUOTE_GROUNDS[index % QUOTE_GROUNDS.length];
        return (
          <View key={`${quote.ar}-${index}`} style={[styles.quoteCard, { backgroundColor: ground.bg }]}>
            <View style={[styles.quoteMark, atStart(-8)]} pointerEvents="none">
              <OliveBranch size={64} color={ground.mark} />
            </View>
            <Text style={[type.quote, { color: ground.text }]}>{quote.ar}</Text>
            {quote.by ? <Text style={[styles.quoteBy, { color: ground.quiet }]}>— {quote.by}</Text> : null}
          </View>
        );
      })}
    </Flick>
  );
}

// ---------------------------------------------------------------------------------------------------
// 1 · The hero
// ---------------------------------------------------------------------------------------------------

/**
 * The sliding cover (`PhotoSlideshow`, landing/photo-slideshow.tsx).
 *
 * THE OWNER'S OWN PACE, in his own words (2026-09-22: «a sliding and faster, not a fade … 1.2 sec or less»):
 * each photograph HOLDS the frame for 1.2s, then slides away over 0.45s while the next takes its place. A
 * hand-over between two stills, not a drift — and not a cross-fade, which is the thing he rejected when he
 * said «i don't like it, consistent slide … not like that» about the marquee this replaced.
 *
 * HOW THE LOOP CLOSES, which is the site's trick kept intact: the list is rendered TWICE and the track steps
 * exactly half its width, so the last step lands on a copy of the first frame and the reset to zero changes
 * nothing on screen. Nothing counts anything — a sixth photograph joins the strip and the arithmetic is
 * unchanged. `Animated.loop` resets its value before each iteration, which IS that reset.
 *
 * ONE PHOTOGRAPH IS ONE PHOTOGRAPH, with no animation: a single picture sliding into itself is a stutter, not
 * a slideshow. And none at all is the site's drawn grove, through `OfferImage`, never a grey box.
 *
 * THE TRACK IS ANCHORED TO THE READING START EDGE AND TRAVELS TOWARD IT, which is +x in Arabic — the sign
 * `photo-slideshow.tsx`'s own `sign = config.dir === "rtl" ? 1 : -1` carries, with the warning that getting
 * it wrong «does not look like a reversed animation, it looks like the content vanishing». A transform has no
 * logical form, so the direction is named once, here.
 */
function Slideshow({ pictures, reduceMotion }: { pictures: Picture[]; reduceMotion: boolean }) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  // `useState` with an initialiser rather than `useRef(new Animated.Value(0)).current`: both create the
  // value exactly once, and this one is a VALUE rather than a ref read during render — which is what the
  // `react-hooks/refs` rule is about, and it is right that an animated value is not a ref.
  const [x] = useState(() => new Animated.Value(0));
  const count = pictures.length;
  const still = count < 2 || reduceMotion;

  useEffect(() => {
    if (still || box.width <= 0) return;
    const sign = edges().start === "right" ? 1 : -1;
    const steps = Array.from({ length: count }, (_, index) =>
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(x, {
          toValue: sign * (index + 1) * box.width,
          duration: 450,
          easing: Easing.bezier(0.65, 0, 0.35, 1),
          useNativeDriver: true,
        }),
      ]),
    );
    const animation = Animated.loop(Animated.sequence(steps));
    animation.start();
    return () => {
      animation.stop();
      x.setValue(0);
    };
  }, [still, count, box.width, x]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
  };

  const frame = (picture: Picture, index: number) => (
    <OfferImage
      key={`${picture.slot}-${index}`}
      url={picture.url}
      alt={picture.alt}
      seed={picture.slot}
      width={box.width}
      height={box.height}
      priority={index === 0 ? "high" : "normal"}
      style={{ width: box.width, height: box.height }}
    />
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.heroGround]} onLayout={onLayout}>
      {box.width <= 0 ? null : count === 0 ? (
        <OfferImage url={null} alt={null} seed="home.hero" width={box.width} height={box.height} style={{ width: box.width, height: box.height }} />
      ) : still ? (
        frame(pictures[0], 0)
      ) : (
        <Animated.View
          style={[
            styles.slideTrack,
            atStart(0),
            readingRow(),
            { width: count * 2 * box.width, transform: [{ translateX: x }] },
          ]}
        >
          {[...pictures, ...pictures].map(frame)}
        </Animated.View>
      )}
    </View>
  );
}

export type HeroProps = {
  config: AppConfig;
  covers: Picture[];
  onExplore: () => void;
  onGuide: () => void;
};

/**
 * The photographic card the screen opens on (home-phone.tsx:208-300).
 *
 * FIVE LAYERS, bottom up, exactly as the site stacks them: the slideshow, the language chip, a vertical wash,
 * a second SIDE wash that is `lg:block` and therefore NOT on a phone, and a faint inset ring closing the card
 * against the page.
 *
 * DEPTH IS THREE LAYERS, NOT ONE WASH (owner, 2026-09-24: «make it nice and deep and clean»). A single
 * gradient dims every part of the photograph by the same rule, so nothing recedes; here the foot is darkened
 * for the words and the sky — the reason the picture is there at all — keeps almost all of its light.
 *
 * THE 56px FOOT IS LOAD-BEARING. The figures bar is lifted onto it at −40, and nothing the hero says may end
 * up behind that bar. The words are centred on the foot, which is right for a 13rem card where there is no
 * «beside» (the site anchors them to the inline start only from `lg`).
 *
 * THE LANGUAGE CHIP IS A RESERVED SLOT AND IS NOT DRAWN. The site puts it in the card's top end corner
 * because the header that carries it is not drawn on a phone (0109). The app has no locale yet — no language
 * state, no translated screens — and the standard home-phone.tsx itself sets for the notification bell and
 * the avatar it refuses to draw is the one that applies: «a control that does nothing is worse than a missing
 * one — it teaches a visitor the app is a picture of an app». The composition already carries the chip's
 * consequence (`language` drives the 56px TOP padding, because centred, the badge and the chip would touch),
 * so the control appears the day the app can act on it and nothing else moves.
 *
 * NO `tracking-*` AT ANY SIZE: letter-spacing breaks the joins in Arabic, which home-phone.tsx states twice
 * as a rule and `theme.ts`'s type scale therefore never sets. And `site.home_subheadline` is `hidden
 * lg:block` — it must never appear here.
 */
export function Hero({ config, covers, onExplore, onGuide }: HeroProps) {
  const reduceMotion = useReduceMotion();
  const badge = settingText(config, "site.app_greeting_note");
  const language: ReactNode = null;

  return (
    <View style={styles.hero}>
      <Slideshow pictures={covers} reduceMotion={reduceMotion} />

      {/* `bg-gradient-to-t from-forest-700/94 via-forest-700/50 to-forest-700/10`. CSS names the stops from
          the BOTTOM up, so the array is rewritten top-to-bottom; `via` with no position is 50 %. */}
      <LinearGradient
        colors={[alpha(colour.forest700, 0.1), alpha(colour.forest700, 0.5), alpha(colour.forest700, 0.94)]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {language}
      {/* `ring-1 ring-inset ring-surface/12` — the hairline that closes the card against the page. */}
      <View style={styles.heroRing} pointerEvents="none" />

      <View style={[styles.heroBody, language ? styles.heroBodyWithChip : null]}>
        {badge ? (
          <View style={[styles.badge, readingRow()]}>
            {/* `backdrop-blur-sm` is 4px over a wash that is already 50–94 % forest: at 11px it is
                invisible, and a BlurView would cost a dependency and an Android approximation for nothing.
                The flat `bg-surface/15` fill reads the same. */}
            <LeafMark size={12} color={colour.paper} />
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}

        <Text style={type.heroHeadline}>{t(config, "site.app_hero_line")}</Text>

        <View style={[styles.doors, readingRow()]}>
          {/* The hero's two calls to action are NOT `.btn` on the site either: `min-h-11 rounded-full px-4
              text-label font-semibold`. They are the one pair of controls in the app that is not the shared
              Button, and the site's own classes are why. */}
          <Pressable
            onPress={onExplore}
            accessibilityRole="button"
            android_ripple={null}
            style={({ pressed }) => [styles.doorPrimary, readingRow(), pressed ? styles.press98 : null]}
          >
            <Text style={styles.doorPrimaryText}>{t(config, "site.app_hero_cta")}</Text>
            <ArrowGo size={16} color={colour.ink} />
          </Pressable>
          <Pressable
            onPress={onGuide}
            accessibilityRole="button"
            android_ripple={null}
            style={({ pressed }) => [styles.doorGhost, readingRow(), pressed ? styles.press98 : null]}
          >
            <Text style={styles.doorGhostText}>{t(config, "site.app_guide_cta")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * The four figures the bar prints, in the site's order (page.tsx:121-141).
 *
 * A NULL CELL IS DROPPED, NEVER SHOWN AS A ZERO — `StatBar` filters, so no caller can forget. Each label is
 * read WITH its figure (`{count}`), so a language that says «1 olivier» and «512 oliviers» can.
 *
 * THE GOVERNORATES CELL IS NOT GATED ON THE COUNTER, and that is the site's behaviour rather than an
 * oversight: with the statistics module closed the bar renders ONE cell, the places. It is also the one
 * figure that never takes a «+» — the country has 24 governorates and that number does not grow.
 */
export function homeStats(config: AppConfig, progress: Figures | null): StatCell[] {
  const fmt = siteFormat(config);
  const written = (value: number | null) => (value === null ? null : fmt.count(value));
  // m² in the database, hectares on the screen: a unit change, not a business rule, and rounding DOWN keeps
  // the cell from ever claiming more land than the offers hold.
  const hectares =
    progress?.areaOfferedM2 == null ? null : Math.floor(progress.areaOfferedM2 / 10_000);
  const places = config.governorates.length || null;

  return [
    { figure: written(progress?.treesRequested ?? null), label: t(config, "site.tab_trees", { count: progress?.treesRequested ?? 0 }), growing: true },
    { figure: written(progress?.participants ?? null), label: t(config, "site.stat_people", { count: progress?.participants ?? 0 }), growing: true },
    { figure: written(hectares), label: t(config, "site.stat_hectares", { count: hectares ?? 0 }), growing: true },
    { figure: written(places), label: t(config, "site.stat_governorates", { count: places ?? 0 }), growing: false },
  ];
}

// ---------------------------------------------------------------------------------------------------
// 3 · The two doors
// ---------------------------------------------------------------------------------------------------

/**
 * The split (home-phone.tsx:327-348), and the point of the whole composition.
 *
 * Two doors named by what the visitor already knows, not by what we want to sell: someone with an offer in
 * mind, and someone who only knows they want olive trees. They need different things — the first wants to get
 * out of the way fast, the second wants to be asked what suits them — and the old screen sent both down the
 * same door. Naming the split on the home screen is what makes the two intake flows legible instead of
 * arbitrary.
 *
 * `flex: 1` EACH, NOT A PERCENTAGE. `grid-cols-2 gap-2` means two equal columns; the app's old tiles used
 * «48 %», which leaves a seam that changes width with the screen.
 */
export function DoorCards({ config, onGuide, onOffers }: { config: AppConfig; onGuide: () => void; onOffers: () => void }) {
  return (
    <View style={[styles.split, readingRow()]}>
      <Pressable
        onPress={onGuide}
        accessibilityRole="button"
        android_ripple={null}
        style={({ pressed }) => [styles.door, styles.doorDark, pressed ? styles.press99 : null]}
      >
        <View style={[styles.doorMark, { backgroundColor: alpha(colour.goldBright, 0.2) }]}>
          <SearchIcon size={16} color={colour.goldBright} />
        </View>
        <Text style={[type.tileTitle, { color: colour.paper }]}>{t(config, "site.app_guide_title")}</Text>
        <Text style={[type.micro, { color: alpha(colour.paper, 0.7) }]}>{t(config, "site.app_guide_note")}</Text>
      </Pressable>
      <Pressable
        onPress={onOffers}
        accessibilityRole="button"
        android_ripple={null}
        style={({ pressed }) => [styles.door, styles.doorLight, pressed ? styles.press99 : null]}
      >
        <View style={[styles.doorMark, { backgroundColor: colour.goldSoft }]}>
          <GridMark size={16} color={colour.gold} />
        </View>
        <Text style={[type.tileTitle, { color: colour.ink }]}>{t(config, "site.app_pick_title")}</Text>
        <Text style={type.micro}>{t(config, "site.app_pick_note")}</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// 4 · The offers strip
// ---------------------------------------------------------------------------------------------------

/** `w-44` — a fixed tile, because a track of items that size to their own text stutters as it moves. */
const TILE = 176;
/** `h-28` — 112px of photograph, which is what makes the grove the first thing seen. */
const TILE_IMAGE = 112;

/**
 * «عروضنا» and the tiles the reader swipes (home-phone.tsx:358-411, and `OfferTile` at 525).
 *
 * THE PHONE GETS A STRIP, NOT A GRID. The site draws its 4:3 cards three and four to a row from `md` and
 * hides them below it; what a 375px screen gets is this row of 176px tiles bleeding past both gutters. The
 * app drew the DESKTOP arrangement — the first four offers, two to a line — which says «there are four»
 * where the strip says «there are more», and «الكل» carries the rest.
 *
 * THE PICTURE IS THE POINT (owner, 2026-09-22: «the images not visible … show more of the img»). The tile
 * used to be 56px of photograph under 76px of words; it is 112px of photograph over one line of name, with
 * the place and the price sharing the last row — the same four facts in half the text height.
 *
 * NO PRICE, NO PRICE CELL. Unlike the desktop card, which keeps a ruled foot so a grid of cards stays level,
 * the tile simply drops it: nothing beside it has to be the same height.
 *
 * EVERY OFFER, ONCE, UP TO TWELVE — which is the page's own slice. The second aria-hidden copy went with the
 * loop that needed it.
 */
export function OffersStrip({
  config,
  offers,
  placeOf,
  onAll,
  onOpen,
}: {
  config: AppConfig;
  offers: Offer[];
  placeOf: (offer: Offer) => string;
  onAll: () => void;
  onOpen: (offer: Offer) => void;
}) {
  const fmt = siteFormat(config);
  const shown = offers.slice(0, 12);
  if (shown.length === 0) return null;
  const from = t(config, "start.from_prefix");

  return (
    <View style={styles.offersSection}>
      {/* `items-baseline`, so a 13.6px word does not float beside a 20px title. */}
      <View style={[styles.sectionHead, readingRow()]}>
        <Text style={[type.railTitle, { flexShrink: 1 }]}>{offersTitle(config)}</Text>
        <Pressable onPress={onAll} accessibilityRole="button" android_ripple={null} style={[styles.allLink, readingRow()]}>
          <Text style={styles.allText}>{t(config, "offers.filter_all")}</Text>
          <ArrowGo size={14} color={colour.forest} />
        </Pressable>
      </View>

      <Flick interval={TILE + space.snug} gap={space.snug} lead={space.cozy} tail={space.hair} style={styles.offersStrip}>
        {shown.map((offer) => {
          const perTree = areaPerTree(offer);
          // PRJ-03, checked on this side of the wire too: `treePriceMillimes` is the mirror of the site's
          // `offerTreePrice()` and is the ONE place any screen reads that column. No price, no cell.
          // The flag is the site's third leg (`offerTreePrice(project, pricingOpen)`), read from this
          // visitor's own copy of it — so the strip withholds a figure the moment the owner shuts the module,
          // without waiting to be told again by the next request.
          const millimes = treePriceMillimes(offer, moduleOpen(config, "pricing"));
          const meta = [placeOf(offer), perTree === null ? null : fmt.area(Math.round(perTree))]
            .filter(Boolean)
            .join(" · ");

          return (
            <Pressable
              key={offer.id}
              onPress={() => onOpen(offer)}
              accessibilityRole="button"
              accessibilityLabel={offer.name}
              android_ripple={null}
              style={({ pressed }) => [styles.tile, pressed ? styles.press99 : null]}
            >
              <OfferImage
                url={offer.cover_url}
                alt={offer.cover_alt_ar}
                seed={offer.id}
                width={TILE}
                height={TILE_IMAGE}
                corner={styles.tileCorner}
                style={styles.tileImage}
              />
              <View style={styles.tileBody}>
                <Text style={[type.tileTitle, { color: colour.ink, fontSize: 12, lineHeight: 15 }]} numberOfLines={1} ellipsizeMode="tail">
                  {offer.name}
                </Text>
                <View style={[styles.tileFoot, readingRow()]}>
                  <Text style={[type.microTight, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
                    {meta}
                  </Text>
                  {millimes === null ? null : (
                    <View style={[styles.tilePrice, readingRow()]}>
                      <Text style={type.priceSmall}>{fmt.money(millimes)}</Text>
                      <Text style={styles.tileFrom}>{from}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </Flick>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// 5 · «وين وصلنا؟» — the band, and the one-line bar that stands in for it
// ---------------------------------------------------------------------------------------------------

const STAGES = ["requested", "reserved", "contracted", "planted"] as const;
const CONTEXTS = ["participants", "projects"] as const;

/**
 * «وين وصلنا؟» in full (landing/counter-band.tsx → million-counter.tsx), on its dark photographic band.
 *
 * MIL-01: these are counts of real rows. Nothing here is a target, an estimate or a projection. The order was
 * rebuilt around the one sentence the owner keeps repeating — «الهدف مش الوصول لرقم مليون زيتونة، بل كم شخص
 * نقدر نعاونوه» — so it reads: the title, the people who have started, the counts on one white surface, and
 * only then the bar and its goal, small, below a hairline. A section that opened with a progress bar toward a
 * number read as an advertisement for that number, and the counts — the only honest thing in it — came third.
 *
 * TWO COLUMNS AT PHONE WIDTH IS A DECISION, NOT A SQUASH (`STAGE_COLUMNS`): four across gives each cell about
 * 70px, and «زيتونات تم التعاقد عليها» with its hint is unreadable at that width. The 1px rule before a cell
 * is drawn only for an ODD index, because an even one opens a row.
 *
 * A STAGE KEEPS ITS TILE AT 0 — beside a stage that has moved, a zero is information: it says how far the
 * offer has come. A stage the counter did not answer with does not appear at all, and an emptied
 * `million.tile_*_label` hides its tile, which is how the owner says «do not report this stage». The two
 * CONTEXT counts are not stages, and a context figure at 0 reports nothing, so they appear once they have
 * something to say.
 *
 * THE SCRIM IS FLAT AND NOT A GRADIENT: the words sit at one end and the card at the other, and both need the
 * same darkness behind them — unlike the hero, where the wash is directional.
 */
export function ProgressBand({
  config,
  progress,
  photo,
}: {
  config: AppConfig;
  progress: Figures;
  photo: Picture | undefined;
}) {
  const fmt = siteFormat(config);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const label = (key: string) => settingText(config, `million.tile_${key}_label`);
  const hint = (key: string) => settingText(config, `million.tile_${key}_hint`);
  const figureOf: Record<string, number | null> = {
    requested: progress.treesRequested,
    reserved: progress.treesReserved,
    contracted: progress.treesContracted,
    planted: progress.treesPlanted,
    participants: progress.participants,
    projects: progress.projectsUnderStudy,
  };

  const stages = STAGES.flatMap((key) =>
    label(key) && figureOf[key] !== null ? [{ key, value: figureOf[key] as number }] : [],
  );
  const contexts = CONTEXTS.flatMap((key) =>
    label(key) && figureOf[key] !== null && (figureOf[key] as number) > 0
      ? [{ key, value: figureOf[key] as number }]
      : [],
  );

  // The band word for the live participant count. The count is the real one (MIL-01); the word describing it
  // lives in the Back Office, so «عشرات» becomes «مئات» on its own. With NO count answered no band is
  // reached and the line does not appear — it would otherwise read as «nobody has started yet», which is a
  // statement rather than a missing figure.
  const bands = settingJson<{ min?: unknown; text?: unknown }[]>(config, "million.people_bands", []);
  const reached = bands.filter(
    (band) =>
      typeof band?.min === "number" &&
      Number.isFinite(band.min) &&
      typeof band.text === "string" &&
      progress.participants !== null &&
      progress.participants >= band.min,
  ) as { min: number; text: string }[];
  const band = reached.length > 0 ? reached.reduce((best, item) => (item.min > best.min ? item : best)) : null;
  const peopleLine = band && settingText(config, "million.people_lead") ? t(config, "million.people_lead", { people: band.text }) : "";
  const encourage = settingText(config, "million.people_encourage");
  const note = settingText(config, "site.progress_note");

  const goal = progress.goal ?? 0;
  const requested = progress.treesRequested;
  const share = goal > 0 && requested !== null ? Math.min(requested / goal, 1) : 0;
  // A real but tiny share still deserves a mark on the bar, and never a rounded-up number next to it.
  const barWidth = requested !== null && requested > 0 ? Math.max(share * 100, 0.8) : 0;

  return (
    <View
      style={styles.band}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      {photo && box.width > 0 ? (
        <OfferImage
          url={photo.url}
          alt={photo.alt}
          seed={photo.slot}
          width={box.width}
          height={box.height}
          style={FILL}
        />
      ) : null}
      {photo ? <View style={styles.bandScrim} pointerEvents="none" /> : null}

      {/* TWO COLUMNS, STACKED — `grid gap-roomy`, which is one 24px gap between the words and the readout and
          NOT a 24px gap between every line. Each column keeps its own margins, exactly as the site writes
          them; flattening the two into one gapped list is how a copy of this section drifts. */}
      <View style={styles.bandInner}>
        <View>
          <View style={[styles.bandTitleRow, readingRow()]}>
            <Text style={[type.sectionTitle, { color: colour.paper, flexShrink: 1 }]}>
              {t(config, "site.progress_title")}
            </Text>
            <SectionLeaf size={24} color={alpha(colour.leafSoft, 0.8)} />
          </View>
          {peopleLine ? <Text style={styles.bandPeople}>{peopleLine}</Text> : null}
          {encourage ? <Text style={styles.bandEncourage}>{encourage}</Text> : null}
        </View>

        <View>
          {/* ONE WHITE SURFACE HOLDING EVERY STAGE, split by hairlines that are INSET rather than drawn edge
              to edge: the figures then read as one readout instead of four boxes. */}
          {stages.length > 0 ? (
            <View style={[styles.stagePanel, readingRow()]}>
              {stages.map((stage, index) => (
                // The rule is drawn HERE and not through `StatTile`'s own `rule`, because it belongs at the
                // reading START edge of the cell (`start-0`, inset vertically by 8) and a physical side
                // cannot be named inside a shared component that does not know the direction.
                <View key={stage.key} style={styles.stageSlot}>
                  {index % 2 === 1 ? <View style={[styles.stageRule, atStart(0)]} pointerEvents="none" /> : null}
                  <StatTile
                    figure={fmt.count(stage.value)}
                    label={label(stage.key)}
                    hint={hint(stage.key)}
                    glyph={<StageMark name={stage.key} size={28} color={colour.gold} />}
                    style={styles.stageTile}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* The two context counts are not stages, so they read as one quiet line rather than two more
              boxes. This is where the real participant count is printed, and nothing else. */}
          {contexts.length > 0 ? (
            <View style={[styles.contextRow, readingRow()]}>
              {contexts.map((item) => (
                <View key={item.key} style={[styles.contextItem, readingRow()]}>
                  <Text style={styles.contextFigure}>{fmt.count(item.value)}</Text>
                  <Text style={styles.contextLabel}>{label(item.key)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* The bar, last and quiet. It measures a count against a goal, and a goal is the one thing in this
              section that is not a report — so it sits under the counts, on its own hairline, at caption
              size, instead of leading them. `million.goal` is 0 today, so none of this renders; it is written
              because the owner turning the goal on must not need a release. */}
          {goal > 0 && requested !== null ? (
            <View style={styles.goalBlock}>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width: `${barWidth}%` }]} />
              </View>
              <View style={[styles.goalCaptions, readingRow()]}>
                <Text style={styles.goalCaption}>{t(config, "million.goal_label", { goal })}</Text>
                <Text style={styles.goalCaption}>
                  {t(config, requested > 0 ? "million.bar_caption" : "million.bar_empty", { count: requested, goal })}
                </Text>
              </View>
            </View>
          ) : null}

          {note ? <Text style={styles.bandNote}>{note}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/**
 * The one-line counter (home-phone.tsx:421-434), which is what shows when there is no band.
 *
 * THE TWO ARE MUTUALLY EXCLUSIVE and stay so: both answer «وين وصلنا؟», and the band already carries the
 * figure this bar carries one of — on the site they also both wore `id="million"`, and two elements answering
 * one anchor is a bug the browser resolves by guessing. With the statistics module open the band wins; with
 * it closed the counter answers a stranger with nothing and neither renders. So this branch is reached only
 * if a caller ever holds a counter figure without a band, and it is written because that is what the site
 * does and because it is the cheap half.
 *
 * `.counter-fill`'s travelling sheen is the one motion globals.css argues earns itself — the bar reports a
 * quantity still being collected — so it is kept, on a 3.2s loop, and switched off for a reader who asked for
 * less movement. The track is `ProgressTrack`'s shape by hand here because the sheen has to live inside the
 * fill, and that component deliberately holds no gradient.
 */
export function ProgressNote({
  config,
  note,
  percent,
}: {
  config: AppConfig;
  note: string;
  percent: number | null;
}) {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [sheen] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion || width <= 0) return;
    const animation = Animated.loop(
      Animated.timing(sheen, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, width, sheen]);

  return (
    <View style={styles.counterCard}>
      <View style={[styles.counterHead, readingRow()]}>
        <Text style={styles.counterTitle}>{t(config, "million.title")}</Text>
        <Text style={[type.microTight, { flexShrink: 1 }]}>{note}</Text>
      </View>
      {percent === null ? null : (
        <View style={styles.counterTrack}>
          <View
            // Never thinner than 2 %: a bar of zero width says «this is not reported», where a sliver says
            // «almost nothing yet», and the second is the true statement.
            style={[styles.counterFill, { width: `${Math.min(100, Math.max(2, percent))}%` }]}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          >
            {width > 0 && !reduceMotion ? (
              <Animated.View
                style={[
                  styles.sheen,
                  {
                    width,
                    transform: [
                      { translateX: sheen.interpolate({ inputRange: [0, 0.6, 1], outputRange: [-width, width, width] }) },
                    ],
                  },
                ]}
                pointerEvents="none"
              >
                <LinearGradient
                  colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// 5b · Services, and where the land can be
// ---------------------------------------------------------------------------------------------------

/**
 * «إنت تستثمر، وإحنا نتلهاو» and «وين تحب تكون أرضك؟» (landing/services-map.tsx).
 *
 * TWO CARDS, AND THE APP DREW ONE. Both lists are database rows — the services are `option_items` with
 * list_key = 'agrized_service', the places are the ACTIVE governorates — and neither is typed here, and
 * neither is truncated to the six a reference happens to draw: `site.coverage_text` promises «التسجيل مفتوح
 * من كل الولايات», so printing six and hiding eighteen would contradict the paragraph directly above them.
 *
 * `site.services_note` IS LOAD-BEARING and is not decoration: report v3 §36 sells follow-up for a known fee,
 * and that line is what keeps the chip row from reading as «free».
 *
 * THE FILLED CHIP is a governorate that already holds land on offer — a row, not a decoration. The fill is a
 * solid forest, a step past `.chip`'s own leaf-soft tint, because at this size the tint does not survive the
 * warm ground the card sits on. `Chip`'s `selectedTone: "fill"` is that same decision.
 *
 * `px-4 py-section` INSIDE the page's own 16px gutter is copied exactly, because it is what gives this block
 * its air — and losing it is what made the app's single services card read as one more row.
 *
 * NO TITLE IN SETTINGS, NO CARD: the rule the home page has always applied to these two blocks, and the way
 * the owner removes either of them without a deploy.
 */
export function ServicesMap({
  config,
  offerPlaces,
}: {
  config: AppConfig;
  /** The governorates actually holding a live offer today, by name — derived by the screen from its offers. */
  offerPlaces: Set<string>;
}) {
  const servicesTitle = settingText(config, "site.services_title");
  const servicesText = settingText(config, "site.services_text");
  const servicesNote = settingText(config, "site.services_note");
  const coverageTitle = settingText(config, "site.coverage_title");
  const coverageText = settingText(config, "site.coverage_text");
  const services = servicesTitle ? optionsFor(config, "agrized_service") : [];
  const places = coverageTitle ? config.governorates : [];

  if (!servicesTitle && !coverageTitle) return null;

  return (
    <View style={styles.servicesSection}>
      {/* Services first, so on a phone the card answering «what do I get for my money» comes before the one
          asking where the visitor's land should be. */}
      {servicesTitle ? (
        <View style={[styles.serviceCard, { backgroundColor: alpha(colour.goldSoft, 0.4) }]}>
          <CardHead title={servicesTitle} glyph={<ServicesLeaf size={32} color={colour.forest} />} />
          {servicesText ? <Text style={styles.cardBody}>{servicesText}</Text> : null}
          {services.length > 0 ? (
            <View style={[styles.chipRow, readingRow()]}>
              {services.map((service) => (
                <Chip key={service.id} label={service.label} />
              ))}
            </View>
          ) : null}
          {servicesNote ? <Text style={styles.cardNote}>{servicesNote}</Text> : null}
        </View>
      ) : null}

      {coverageTitle ? (
        <View style={[styles.serviceCard, styles.coverageCard, { backgroundColor: alpha(colour.goldSoft, 0.55) }]}>
          <FieldsDecor />
          <CardHead title={coverageTitle} glyph={<CoveragePin size={32} color={colour.forest} />} />
          {coverageText ? <Text style={styles.cardBody}>{coverageText}</Text> : null}
          {places.length > 0 ? (
            <View style={[styles.chipRow, readingRow()]}>
              {places.map((place) => (
                <Chip key={place.id} label={place.name} selected={offerPlaces.has(place.name)} selectedTone="fill" />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A card heading. Unlike the centred heads of a wide screen's sections, here the mark LEADS — it sits at the
 * start of the title, which is how the reference draws it inside these two cards and inside the FAQ.
 */
function CardHead({ title, glyph }: { title: string; glyph: ReactNode }) {
  return (
    <View style={[styles.cardHead, readingRow()]}>
      {glyph}
      <Text style={[type.pageTitle, { flexShrink: 1 }]}>{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// 6 · The questions, then the ask
// ---------------------------------------------------------------------------------------------------

type FaqItem = { q: string; a: string; flag?: string };

/**
 * The questions that may be printed: `site.faq`, minus any item whose module is closed.
 *
 * Exported because the SCREEN needs the same answer — the site wraps the questions and the ask in one
 * `mt-4 grid gap-3` and draws that wrapper only when at least one of them exists, so an empty FAQ with a
 * closed interest module must leave no spacer behind.
 */
export function faqItems(config: AppConfig): FaqItem[] {
  return settingJson<FaqItem[]>(config, "site.faq", [])
    .filter((item) => typeof item?.q === "string" && item.q.trim() && typeof item?.a === "string")
    .filter((item) => !item.flag || moduleOpen(config, item.flag));
}

/**
 * «أسئلة شائعة» (landing/faq.tsx, over globals.css's `.disclosure`).
 *
 * It is on the phone home because the owner pointed out on 2026-09-23 that a visitor on a telephone reached
 * the offers, the figures and then the footer with every objection answered nowhere. The app had no FAQ at
 * all.
 *
 * AN ANSWER WHOSE MODULE IS CLOSED IS NOT PRINTED. An item may carry a `flag`, because an answer can point at
 * a door — «من قسم «عندك أرض أو ضيعة؟»» — and a closed module takes that door off the screen while the answer
 * stays, sending the reader nowhere. Nothing about which answer that is lives here: the owner adds `"flag":
 * "land_offers"` to the item in `site.faq`.
 *
 * THE SET IS A BOX OF ROWS INSIDE THE CARD, not a run of rows on it: the hairline between two questions then
 * means «these are one list» rather than «the card stops here». The rows themselves, the drawn marker at the
 * reading start and the indent that lines an answer up under its question are `./components`' `Disclosure` —
 * including its rule that NOTHING about the body animates, because a height transition is what makes a
 * disclosure shove the page under a reader who is looking further down.
 */
export function FaqCard({ config }: { config: AppConfig }) {
  const items = useMemo(() => faqItems(config), [config]);
  if (items.length === 0) return null;
  const title = settingText(config, "site.faq_title");

  return (
    <Panel padding={space.card}>
      {title ? <CardHead title={title} glyph={<QuestionMark size={28} color={colour.forest} />} /> : null}
      <View style={[styles.disclosureList, title ? { marginTop: space.cozy } : null]}>
        {items.map((item, index) => (
          <Disclosure key={`${item.q}-${index}`} question={item.q} style={index > 0 ? styles.disclosureRule : undefined}>
            <Text style={[type.body, { color: colour.muted }]}>{item.a}</Text>
          </Disclosure>
        ))}
      </View>
    </Panel>
  );
}

/**
 * The last ask of the home screen (landing/closing-cta.tsx).
 *
 * AT PHONE WIDTH THE PHOTOGRAPH IS A BAND ACROSS THE TOP, not the side bleed a wide screen gets: below `sm` a
 * side picture leaves the words about 200px of usable width. It dissolves into the card's own ground so there
 * is no seam, and the body's 160px top padding is what clears the 144px band.
 *
 * THE CONTACT LINE OPENS A REAL CONVERSATION OR IT IS NOT DRAWN: WhatsApp first, the telephone after it,
 * nothing at all when the owner has filled in neither. The number is `site.contact_whatsapp` /
 * `site.contact_phone` — the rows the site's own footer and closing card read — and not a build-time
 * environment variable, which is what the app's retired contact tab used and why the owner changing his
 * number changed the website and not the app.
 *
 * `site.final_cta_note` — «التسجيل مجاني وما يلزمك بشيء.» — STAYS, because it is the sentence that makes the
 * button safe to press. `text-wrap: balance` on the title has no native equivalent; the ragged break is
 * accepted rather than fixed with a manual line break, which would be a layout decision taken over copy the
 * owner edits.
 *
 * THE WHOLE CARD IS GATED ON `interest_form` by the screen, exactly as page.tsx gates it — a card asking for
 * a registration the module has closed is a door that opens on nothing.
 */
export function ClosingCta({
  config,
  photo,
  onEstimate,
}: {
  config: AppConfig;
  photo: Picture | undefined;
  onEstimate: () => void;
}) {
  const [width, setWidth] = useState(0);
  const title = settingText(config, "site.final_cta_title");
  const note = settingText(config, "site.final_cta_note");
  const contactLabel = settingText(config, "site.final_cta_contact_label");
  const ctaLabel = estimateLabel(config);
  const whatsapp = settingText(config, "site.contact_whatsapp").replace(/\D/g, "");
  const phone = settingText(config, "site.contact_phone");
  const contactHref = whatsapp ? `https://wa.me/${whatsapp}` : phone ? `tel:${phone}` : "";

  if (!title && !ctaLabel) return null;

  return (
    <View style={styles.closing} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.closingBand}>
        {photo && width > 0 ? (
          <OfferImage
            url={photo.url}
            alt={photo.alt}
            seed={photo.slot}
            width={width}
            height={CLOSING_BAND}
            style={FILL}
          />
        ) : null}
        {/* `bg-linear-to-b from-transparent to-forest-700` — no seam where the picture meets the green. */}
        <LinearGradient
          colors={[alpha(colour.forest700, 0), colour.forest700]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.closingBody}>
        {title ? <Text style={styles.closingTitle}>{title}</Text> : null}

        {/* A column, so at 375 the button takes the full width without the contact line stretching with it. */}
        <View style={styles.closingStack}>
          {ctaLabel ? (
            <Pressable
              onPress={onEstimate}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              android_ripple={null}
              style={({ pressed }) => [styles.closingBtn, readingRow(), pressed ? styles.press99 : null]}
            >
              <Text style={styles.closingBtnText} numberOfLines={1}>
                {ctaLabel}
              </Text>
              <ArrowGo size={16} color={colour.forest700} />
            </Pressable>
          ) : null}

          {contactHref && contactLabel ? (
            <Pressable
              onPress={() => void Linking.openURL(contactHref).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={contactLabel}
              android_ripple={null}
              style={[styles.contactLink, readingRow()]}
            >
              <ChatBubble size={16} color={colour.goldBright} />
              <Text style={styles.contactText}>{contactLabel}</Text>
            </Pressable>
          ) : null}
        </View>

        {note ? <Text style={styles.closingNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

/** `h-36` — the photographic band across the top of the closing card at phone width. */
const CLOSING_BAND = 144;

// ---------------------------------------------------------------------------------------------------
// The measurements
// ---------------------------------------------------------------------------------------------------

const styles = StyleSheet.create({
  /** The mirror the two strips are built from; see `Flick`. */
  mirror: { transform: [{ scaleX: -1 }] },
  /** `active:scale-[0.98]` on the hero's calls to action, `0.99` on a card. There is no ripple on the site. */
  press98: { transform: [{ scale: 0.98 }] },
  press99: { transform: [{ scale: 0.99 }] },

  // 0 · the lockup — `mb-3 ms-auto flex-row-reverse items-center gap-snug rounded-xl`
  lockup: {
    // `flex-row-reverse` under `dir="rtl"` lays out left-to-right, so the eye meets the emblem and then the
    // word in EVERY language. That is `theme.ts`'s `fixedRow`, stated rather than inherited.
    flexDirection: "row",
    alignItems: "center",
    gap: space.snug,
    borderRadius: radius.control,
    marginBottom: space.snug,
  },
  emblem: { width: 38, height: 36 },
  // `text-[1.15rem] leading-none tracking-tight`, left-to-right: a Latin word inside an Arabic screen.
  wordmark: { ...display(700), fontSize: 18.4, lineHeight: 18.4, writingDirection: "ltr" },
  wordmarkAgri: { color: colour.forest },
  wordmarkZed: { color: blend.goldMid },

  // 0b · the quote strip — `-mx-4 mb-3`; cards `h-24 w-64 rounded-2xl px-4 py-3`, content centred
  quoteStrip: { marginHorizontal: -space.cozy, marginBottom: space.snug },
  quoteCard: {
    width: QUOTE_CARD,
    height: 96,
    borderRadius: radius.card,
    paddingHorizontal: space.cozy,
    paddingVertical: space.snug,
    justifyContent: "center",
    overflow: "hidden",
  },
  // `-bottom-3 -start-2 size-16`
  quoteMark: { position: "absolute", bottom: -12, width: 64, height: 64 },
  quoteBy: { ...sans(400), fontSize: 10, lineHeight: 10, marginTop: 6, writingDirection: "rtl", textAlign: "right" },

  // 1 · the hero — `rounded-3xl overflow-hidden shadow-card`
  hero: {
    borderRadius: radius.hero,
    overflow: "hidden",
    // Android draws an `elevation` shadow against the view's own background, so the ground is explicit — and
    // it is the band's forest rather than nothing, which is also what shows before the first frame decodes.
    backgroundColor: colour.forest700,
    ...shadow.card,
  },
  heroGround: { backgroundColor: colour.forest700, overflow: "hidden" },
  slideTrack: { position: "absolute", top: 0, bottom: 0 },
  heroRing: {
    ...FILL,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: alpha(colour.surface, 0.12),
  },
  // `min-h-[13rem] flex-col items-center justify-end p-4 pb-14 text-center`
  heroBody: {
    minHeight: 208,
    padding: space.cozy,
    paddingBottom: 56,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  // `max-md:pt-14`, and only when the language chip owns the card's top corner.
  heroBodyWithChip: { paddingTop: 56 },
  // `mb-2 gap-1.5 rounded-full border border-surface/25 bg-surface/15 px-2.5 py-1`
  badge: {
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: alpha(colour.surface, 0.25),
    backgroundColor: alpha(colour.surface, 0.15),
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: space.tight,
  },
  badgeText: { ...sans(500), fontSize: 11, color: colour.paper, writingDirection: "rtl" },
  // `mt-3 flex-wrap justify-center gap-2`
  doors: { flexWrap: "wrap", justifyContent: "center", gap: space.tight, marginTop: space.snug },
  // `min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-label font-semibold text-ink shadow-card`
  doorPrimary: {
    minHeight: 44,
    alignItems: "center",
    gap: space.tight,
    borderRadius: radius.pill,
    backgroundColor: colour.surface,
    paddingHorizontal: space.cozy,
    ...shadow.card,
  },
  doorPrimaryText: { ...type.label, color: colour.ink },
  // `min-h-11 rounded-full border-[1.5px] border-surface/40 px-4 text-label font-semibold text-surface`
  doorGhost: {
    minHeight: 44,
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: alpha(colour.surface, 0.4),
    paddingHorizontal: space.cozy,
  },
  doorGhostText: { ...type.label, color: colour.surface },

  // 3 · the two doors — `mt-4 grid-cols-2 gap-2`; each `rounded-2xl p-3 gap-1.5`
  split: { gap: space.tight, marginTop: space.cozy },
  door: { flex: 1, borderRadius: radius.card, padding: space.snug, gap: 6 },
  // No border and no shadow on the dark one: the site gives it neither.
  doorDark: { backgroundColor: colour.forest700 },
  doorLight: { ...card },
  // `size-7 rounded-[0.625rem]`
  doorMark: { width: 28, height: 28, borderRadius: radius.mark, alignItems: "center", justifyContent: "center" },

  // 4 · the offers — `mt-4`; head `items-baseline justify-between`; strip `-mx-4 mt-2 gap-3 pb-1`
  offersSection: { marginTop: space.cozy },
  sectionHead: { alignItems: "baseline", justifyContent: "space-between" },
  allLink: { alignItems: "center", gap: space.hair },
  allText: { ...type.caption, ...sans(600), color: colour.forest },
  offersStrip: { marginHorizontal: -space.cozy, marginTop: space.tight },
  // `.card w-44 flex-none overflow-hidden`
  tile: { ...card, width: TILE, overflow: "hidden" },
  tileImage: { width: TILE, height: TILE_IMAGE, backgroundColor: colour.leafSoft },
  // The radius is repeated on the image, because Android does not reliably clip a child image to a rounded
  // parent — and these are the TOP two corners only, since the picture sits at the top of the tile.
  tileCorner: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  tileBody: { padding: space.tight },
  // `mt-1 items-baseline justify-between gap-1.5`
  tileFoot: { alignItems: "baseline", justifyContent: "space-between", gap: 6, marginTop: space.hair },
  tilePrice: { alignItems: "baseline", gap: 2, flexShrink: 0 },
  // `ms-0.5 text-[0.5rem] leading-none` — the site writes this one size as a literal, so it stays one.
  tileFrom: { ...sans(400), fontSize: 8, lineHeight: 8, color: colour.muted, writingDirection: "rtl" },

  // 5 · the band — `mt-3 rounded-3xl overflow-hidden`, `px-4 py-section` inside, a FLAT 78 % scrim
  band: { marginTop: space.snug, borderRadius: radius.hero, overflow: "hidden", backgroundColor: colour.forest700 },
  bandScrim: { ...FILL, backgroundColor: alpha(colour.forest700, 0.78) },
  bandInner: { paddingHorizontal: space.cozy, paddingVertical: space.section, gap: space.roomy },
  bandTitleRow: { alignItems: "center", gap: space.tight },
  // `mt-cozy text-xl font-bold leading-relaxed` — inside a 24px-gapped grid, so the gap carries the margin.
  bandPeople: { ...sans(700), fontSize: 20, lineHeight: 32.5, color: colour.paper, marginTop: space.cozy, writingDirection: "rtl", textAlign: "right" },
  // `mt-snug leading-7 text-paper/80`
  bandEncourage: { ...type.body, color: alpha(colour.paper, 0.8), marginTop: space.snug },

  // `.panel grid-cols-2 gap-y-cozy p-cozy`
  stagePanel: { ...panel, flexWrap: "wrap", padding: space.cozy, rowGap: space.cozy },
  // Two columns at phone width, fixed rather than flexible: `StatTile` is `flex: 1`, and a flexible basis in
  // a wrapping row makes the second row's single cell twice as wide as the first row's two.
  stageSlot: { width: "50%", flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  stageTile: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  // `absolute inset-y-2 start-0 w-px bg-line`
  stageRule: { position: "absolute", top: space.tight, bottom: space.tight, width: 1, backgroundColor: colour.line, zIndex: 1 },

  // `mt-cozy flex-wrap items-baseline gap-x-roomy gap-y-tight text-caption text-paper/75`
  contextRow: { flexWrap: "wrap", alignItems: "baseline", columnGap: space.roomy, rowGap: space.tight, marginTop: space.cozy },
  contextItem: { alignItems: "baseline", gap: space.tight },
  contextFigure: { ...display(700), fontSize: 20, lineHeight: 20, color: colour.goldBright, writingDirection: "ltr", fontVariant: ["tabular-nums"] },
  contextLabel: { ...type.caption, color: alpha(colour.paper, 0.75) },

  // `mt-cozy border-t border-paper/20 pt-cozy`
  goalBlock: { borderTopWidth: 1, borderTopColor: alpha(colour.paper, 0.2), paddingTop: space.cozy, marginTop: space.cozy, gap: space.snug },
  goalTrack: { height: 6, borderRadius: radius.pill, backgroundColor: alpha(colour.paper, 0.2), overflow: "hidden" },
  goalFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colour.goldBright },
  goalCaptions: { flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: space.cozy, rowGap: space.hair },
  goalCaption: { ...type.caption, color: alpha(colour.paper, 0.75), flexShrink: 1 },
  // `mt-cozy text-caption leading-6 text-paper/70`
  bandNote: { ...type.caption, lineHeight: 24, color: alpha(colour.paper, 0.7), marginTop: space.cozy },

  // 5 · the one-line counter — `.card mt-3 p-3`
  counterCard: { ...card, marginTop: space.snug, padding: space.snug },
  counterHead: { alignItems: "baseline", justifyContent: "space-between", gap: space.tight },
  counterTitle: { ...sans(600), fontSize: 13, color: colour.ink, writingDirection: "rtl", textAlign: "right" },
  // `mt-2 h-1.5 rounded-full bg-line`
  counterTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colour.line, overflow: "hidden", marginTop: space.tight },
  counterFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colour.leaf, overflow: "hidden" },
  sheen: { position: "absolute", top: 0, bottom: 0 },

  // 5b · services and coverage — `px-4 py-section`, `gap-cozy`, each card `.card p-card`
  servicesSection: { marginTop: space.snug, paddingHorizontal: space.cozy, paddingVertical: space.section, gap: space.cozy },
  // The tint is an ALPHA on the ground and never a View opacity, which would fade the border and the words
  // with it (theme.ts's `alpha`). The page's paper composites behind it exactly as the browser's does.
  serviceCard: { ...card, padding: space.card },
  coverageCard: { overflow: "hidden" },
  // `size-72` at the card's end/bottom corner, clipped by the card's own overflow.
  decor: { position: "absolute", bottom: 0, width: 288, height: 288 },
  // `flex items-center gap-snug`
  cardHead: { alignItems: "center", gap: space.snug },
  // `mt-snug leading-7 text-muted`
  cardBody: { ...type.body, color: colour.muted, marginTop: space.snug },
  // `mt-cozy text-caption leading-6 text-muted`
  cardNote: { ...type.caption, lineHeight: 24, marginTop: space.cozy },
  // `mt-cozy flex-wrap gap-tight`
  chipRow: { flexWrap: "wrap", gap: space.tight, marginTop: space.cozy },

  // 6 · the questions — a box of rows inside the card: `rounded-2xl border border-line bg-paper/70`
  disclosureList: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colour.line,
    backgroundColor: alpha(colour.paper, 0.7),
    overflow: "hidden",
  },
  disclosureRule: { borderTopWidth: 1, borderTopColor: colour.line },

  // 6 · the ask — `rounded-2xl bg-forest-700 shadow-card`, a 144px band across the top
  closing: { borderRadius: radius.card, overflow: "hidden", backgroundColor: colour.forest700, ...shadow.card },
  closingBand: { position: "absolute", top: 0, left: 0, right: 0, height: CLOSING_BAND },
  // `p-card pt-40` — 160 is what clears the 144px band.
  closingBody: { padding: space.card, paddingTop: 160 },
  // `font-display text-2xl font-bold leading-tight text-paper`
  closingTitle: { ...type.pageTitle, color: colour.paper },
  // `mt-cozy flex-col items-stretch gap-snug`
  closingStack: { marginTop: space.cozy, alignItems: "stretch", gap: space.snug },
  // `.btn bg-paper text-forest-700 shadow-raise` — a 12px corner, not a pill.
  closingBtn: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: space.tight,
    borderRadius: radius.control,
    paddingHorizontal: space.card,
    backgroundColor: colour.paper,
    ...shadow.raise,
  },
  closingBtnText: { ...type.button, color: colour.forest700 },
  // `min-h-11 items-center justify-center gap-tight text-caption font-semibold text-gold-bright underline`
  contactLink: { minHeight: 44, alignItems: "center", justifyContent: "center", gap: space.tight },
  // RN has no `underline-offset`; the underline itself is the signal and the 4px offset is accepted as lost.
  contactText: { ...type.caption, ...sans(600), color: colour.goldBright, textDecorationLine: "underline" },
  // `mt-snug text-caption leading-6 text-paper/70`
  closingNote: { ...type.caption, lineHeight: 24, color: alpha(colour.paper, 0.7), marginTop: space.snug },
});
