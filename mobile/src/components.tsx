/**
 * The website's surface layer, as React Native views.
 *
 * ONE COMPONENT PER CSS CLASS, and each one names the class it mirrors. Until now the app wrote
 * `rounded-2xl border border-line bg-surface` by hand in a dozen places and `.chip` five times with slightly
 * different padding each time — which is the mechanical reason a screen could be pixel-correct on its own and
 * still not look like the website beside it. globals.css solved exactly this problem for the browser by naming
 * the hand-written string; this file is that same move for the app.
 *
 * WHAT IS NOT HERE. No icons. The site draws its marks as 24px stroke paths and those belong in a module of
 * their own, with `react-native-svg`: every component below that wants a mark takes it as a `leading` or
 * `glyph` node, so the caller passes the drawing and only the spacing stays here. This file now imports
 * NOTHING but React Native and ./theme — the `expo-image`, ./api and ./format imports left with the
 * deprecated screen compositions that used to sit at the foot, and the note where they stood says why.
 *
 * NO COPY AT ALL. Not one Arabic string is written below, and there is no longer an exception: the components
 * that carried a literal were the deprecated ones and they are gone. Every word on a surface is a row in
 * `public.settings` that the owner can edit without a deploy, so a label is always a prop.
 */

import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  View,
} from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  alpha,
  card,
  colour,
  edges,
  estimate,
  panel,
  radius,
  readingRow,
  ring,
  shadow,
  space,
  textDir,
  type,
} from "./theme";

/**
 * The site's `padding-inline-start` / `inset-inline-start`, as the physical pair React Native needs.
 *
 * `paddingStart` and `insetStart` are NOT these: with `I18nManager.isRTL` left false they resolve to the
 * physical left in every language, so a 42px indent meant for the right of an Arabic answer lands on its
 * left. theme.ts's note on `rtl` says why the app does not force I18nManager; this is the consequence, named
 * once instead of being got wrong per component.
 */
function inlinePadding(start: number, end: number): ViewStyle {
  const side = edges();
  return side.start === "right"
    ? { paddingRight: start, paddingLeft: end }
    : { paddingLeft: start, paddingRight: end };
}

/* ---------------------------------------------------------------------------- motion */

/**
 * Has this reader asked their phone for less movement?
 *
 * globals.css switches every animation off under `prefers-reduced-motion`, and says why it does it with
 * `animation: none` rather than the blanket rule: a loop whose duration is forced to 0.01ms is not stopped, it
 * is a strobe, and strobing is the specific harm the preference exists to prevent. The same applies here — a
 * marquee or a counter sheen must not run at all, not run fast.
 *
 * It lives in this file because four screens need the same answer and an animation that respects the setting
 * on three of them is worse than none respecting it: the reader cannot tell which part of the app is broken.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value);
      })
      .catch(() => {
        // An older platform that cannot answer is treated as «no preference», which is the default anyway.
      });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/* --------------------------------------------------------------------------- surfaces */

type SurfaceProps = {
  children?: ReactNode;
  /** `p-5`, `p-3`, `p-2.5` — the site sets padding at the call site, so this does too. */
  padding?: number;
  /**
   * A ground that REPLACES the white one — `bg-gold-soft/40` on the services card, `bg-forest-700` on the
   * first door. Pass `alpha(colour.goldSoft, 0.4)`, never an `opacity`, which would fade the border and the
   * text with it.
   */
  tint?: string;
  /** A card that is a link. The site's own `active:scale-[0.99]`; there is no ripple anywhere on the site. */
  onPress?: PressableProps["onPress"];
  pressedScale?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function Surface({
  base,
  children,
  padding,
  tint,
  onPress,
  pressedScale = 0.99,
  accessibilityLabel,
  style,
}: SurfaceProps & { base: ViewStyle }) {
  const ground: StyleProp<ViewStyle> = [
    base,
    padding === undefined ? null : { padding },
    tint ? { backgroundColor: tint } : null,
    style,
  ];
  if (!onPress) return <View style={ground}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={null}
      style={({ pressed }) => [ground, pressed ? { transform: [{ scale: pressedScale }] } : null]}
    >
      {children}
    </Pressable>
  );
}

/**
 * `.card` — `rounded-2xl border border-line bg-surface` plus `--shadow-raise`.
 *
 * The 5 % 1px shadow is almost invisible alone and is the whole point: it stops a run of cards reading as
 * loose rectangles. That is what the app's hand-written cards were missing.
 */
export function Card(props: SurfaceProps) {
  return <Surface base={card} {...props} />;
}

/** `.panel` — the same material for a container holding rows, carrying the full `--shadow-card`. */
export function Panel(props: SurfaceProps) {
  return <Surface base={panel} {...props} />;
}

/**
 * `.card .card-estimate` — a warm, opaque ground behind a dashed edge and NO elevation.
 *
 * A simulated figure must never be mistaken for real stock, so an estimate is explicitly not an object on the
 * page. Do not give this one a shadow «for consistency»: the absence is the statement.
 */
export function EstimateCard(props: SurfaceProps) {
  return <Surface base={estimate} {...props} />;
}

/* ------------------------------------------------------------------------------ chip */

export type ChipProps = {
  label: string;
  selected?: boolean;
  /**
   * How a chosen chip is marked.
   *
   * `fill` is the default because it is what every phone screen uses: the catalogue's facets and the coverage
   * card's governorates both override `.chip`'s own tint to a solid forest, and projects-phone.tsx says why —
   * a tint reads as a hover on a phone. `tint` is `.chip`'s base selected state, for a wide screen.
   */
  selectedTone?: "fill" | "tint";
  onPress?: () => void;
  disabled?: boolean;
  /** A 14–16px mark before the words (`.chip` carries `gap: 0.375rem` for one). */
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** `.chip` — a value the reader picks. */
export function Chip({
  label,
  selected = false,
  selectedTone = "fill",
  onPress,
  disabled,
  leading,
  style,
}: ChipProps) {
  const chosen = selected
    ? selectedTone === "fill"
      ? { backgroundColor: colour.forest, borderColor: colour.forest }
      : { backgroundColor: colour.leafSoft, borderColor: colour.forest }
    : null;
  const words = selected
    ? { color: selectedTone === "fill" ? colour.paper : colour.forest }
    : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected, disabled: disabled === true }}
      android_ripple={null}
      style={({ pressed }) => [
        styles.chip,
        readingRow(),
        chosen,
        disabled ? { opacity: 0.55 } : null,
        pressed && !selected ? { borderColor: colour.lineStrong } : null,
        style,
      ]}
    >
      {leading}
      <Text style={[type.chip, words]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------------------ pill */

/**
 * The tones the site's call sites hold (STAGE_TONES, PROJECT_STATUS_TONES, LAND_STATUS_TONES…). `.pill`
 * itself is only the shape; a tone is what the word means, so it stays nameable rather than guessable.
 */
export const pillTone = {
  /** `.pill-line` — a hairline badge carrying no status of its own. The catalogue rows are built from these. */
  line: { backgroundColor: colour.surface, borderColor: colour.line, borderWidth: 1, color: colour.muted },
  leaf: { backgroundColor: colour.leafSoft, color: colour.forest },
  gold: { backgroundColor: colour.goldSoft, color: colour.gold },
  forest: { backgroundColor: colour.forest, color: colour.paper },
  danger: { backgroundColor: colour.dangerSoft, color: colour.danger },
  success: { backgroundColor: colour.successSoft, color: colour.success },
} as const;

export type PillTone = keyof typeof pillTone;

/** `.pill` — `rounded-full px-2.5 py-1 text-xs font-semibold`, and never wrapping. */
export function Pill({
  label,
  tone = "line",
  leading,
  style,
}: {
  label: string;
  tone?: PillTone;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { color, ...ground } = pillTone[tone];
  return (
    <View style={[styles.pill, readingRow(), ground, style]}>
      {leading}
      <Text style={[type.pill, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------------------------- button */

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `.btn-sm` — 2.75rem (still a 44px target), 0.875rem of padding and 0.9375rem text. */
  small?: boolean;
  /**
   * `.btn` is a 12px corner (`--radius-control`), which is what this app's pill-shaped buttons were not.
   * `card` is the offer screen's floating door (`rounded-2xl`), `pill` the hero's two calls to action.
   */
  shape?: "control" | "card" | "pill";
  busy?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** `.btn bg-paper text-forest-700` — the closing ask's button, which inverts on the dark card. */
  background?: string;
  color?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** @deprecated `variant`. `quiet` was this app's name for `.btn-secondary`. */
  tone?: "primary" | "quiet";
};

/**
 * `.btn` and its three variants.
 *
 * PRESSED IS THE SITE'S OWN HOVER, not an invented opacity: `.btn-primary:hover` is `bg-forest-600`,
 * `.btn-secondary:hover` moves its border to forest, `.btn-ghost:hover` fills leaf-soft. A phone has no hover
 * and does need to acknowledge a tap, so the hover colour is what a press shows. `android_ripple` is null
 * because the website has no ripple anywhere.
 */
export function Button({
  label,
  onPress,
  variant,
  small = false,
  shape = "control",
  busy = false,
  disabled = false,
  fullWidth = false,
  background,
  color,
  leading,
  trailing,
  style,
  tone,
}: ButtonProps) {
  const kind: ButtonVariant = variant ?? (tone === "quiet" ? "secondary" : "primary");
  const off = disabled || busy;
  const corner =
    shape === "pill" ? radius.pill : shape === "card" ? radius.card : radius.control;
  const spinner = color ?? (kind === "primary" ? colour.surface : colour.forest);

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      android_ripple={null}
      style={({ pressed }) => [
        styles.button,
        readingRow(),
        small ? styles.buttonSmall : null,
        { borderRadius: corner },
        kind === "primary" ? styles.buttonPrimary : null,
        kind === "secondary" ? styles.buttonSecondary : null,
        kind === "ghost" ? styles.buttonGhost : null,
        background ? { backgroundColor: background } : null,
        fullWidth ? { alignSelf: "stretch", width: "100%" } : null,
        // `.btn:disabled { opacity: 0.55 }`.
        off ? { opacity: 0.55 } : null,
        pressed && !off && !background ? pressedOf[kind] : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={spinner} />
      ) : (
        <>
          {leading}
          <Text
            style={[
              type.button,
              // `.btn-sm` shrinks its words to 0.9375rem. `.field-sm` below deliberately does not — see there.
              small ? { fontSize: 15 } : null,
              { color: color ?? (kind === "primary" ? colour.surface : colour.forest), textAlign: "center" },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {trailing}
        </>
      )}
    </Pressable>
  );
}

const pressedOf: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colour.forest600 },
  secondary: { borderColor: colour.forest },
  ghost: { backgroundColor: colour.leafSoft },
};

/* ----------------------------------------------------------------------------- field */

/** `.label` — `block font-weight 600 text-[0.95rem] mb-1.5`. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.label, { marginBottom: 6 }, style]}>{children}</Text>;
}

/** `.hint`. */
export function Hint({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.caption, style]}>{children}</Text>;
}

/**
 * `.error-text` — `text-sm text-danger mt-1.5`.
 *
 * BOTH ANNOUNCEMENT PROPS, because each one covers a platform the other does not. `accessibilityLiveRegion`
 * is Android-only; `accessibilityRole="alert"` is what VoiceOver reads on iOS. This component and ./ui.tsx's
 * twin each carried exactly one of the two — one written by each session — so the same refusal was spoken on
 * Android and silent on iOS in half the app, and the other way round in the other half. A validation message
 * nobody hears is a form that refuses for no stated reason.
 */
export function ErrorText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[type.error, { marginTop: 6 }, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {children}
    </Text>
  );
}

export type FieldProps = Omit<TextInputProps, "style"> & {
  label?: string;
  hint?: string;
  /** A message, not a boolean: an error that cannot say what to do about it is a red border. */
  error?: string | null;
  /**
   * `.field-sm` — 2.75rem with tighter padding, and the SAME 16px text.
   *
   * The site states why it does not shrink the text where `.btn-sm` does: 16px is what stops iOS zooming the
   * page when a field takes focus, and that is a property of the input rather than of the screen it sits on.
   * In an app there is no page to zoom, but the size is still the design.
   */
  small?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/**
 * `.field` with its `.label`, `.hint` and `.error-text`.
 *
 * THE BORDER, THE GROUND AND THE FOCUS RING ARE ON A WRAPPER, not on the TextInput. That is not decoration:
 * it is what lets a field hold a leading mark, and it keeps `0 0 0 3px` — a spread-only box shadow — on an
 * ordinary View, which is the shape React Native draws most reliably.
 *
 * 16px IS NOT NEGOTIABLE. The site's note says it is what stops iOS zooming the page on focus; in an app there
 * is no page to zoom, but the size is still the design, and `.field-sm` deliberately does not shrink it.
 */
export function Field({
  label,
  hint,
  error,
  small = false,
  leading,
  trailing,
  style,
  inputStyle,
  onFocus,
  onBlur,
  multiline,
  ...input
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={[
          styles.field,
          readingRow(),
          small ? styles.fieldSmall : null,
          multiline ? { minHeight: 96, alignItems: "flex-start" } : null,
          focused ? { borderColor: colour.forest } : null,
          focused ? ring(alpha(colour.forest, 0.18)) : null,
          invalid ? { borderColor: colour.danger } : null,
        ]}
      >
        {leading}
        <TextInput
          {...input}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={colour.placeholder}
          accessibilityLabel={input.accessibilityLabel ?? label}
          aria-invalid={invalid}
          style={[
            styles.fieldInput,
            textDir(),
            small ? { paddingVertical: 6 } : null,
            multiline ? { textAlignVertical: "top" } : null,
            inputStyle,
          ]}
        />
        {trailing}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : hint ? <Hint style={{ marginTop: 6 }}>{hint}</Hint> : null}
    </View>
  );
}

/**
 * The catalogue's search box (projects-phone.tsx), which is NOT a `.field`: a pill on a 40 %-line ground with
 * a magnifier at its start and no border at all. It is its own control because it asks nothing — it filters a
 * list already on the screen — so it must not look like something to fill in.
 */
export function SearchField({
  leading,
  style,
  ...input
}: Omit<TextInputProps, "style"> & { leading?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.search, readingRow(), style]}>
      {leading}
      <TextInput
        {...input}
        placeholderTextColor={colour.muted}
        style={[styles.searchInput, textDir()]}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

/* ------------------------------------------------------------------------------ stat */

/**
 * `.stat` / `.stat-figure` — one tile of the counter band: a gold mark, the figure, what it counts, and the
 * line that explains it.
 *
 * AN EMPTY LABEL HIDES THE TILE, which is the site's rule and not a tidiness: every label is
 * `million.tile_<key>_label`, and the owner clearing one is how he says «do not report this stage». A tile
 * with a figure and no word is a number nobody can read.
 */
export function StatTile({
  figure,
  label,
  hint,
  glyph,
  rule = false,
  style,
}: {
  figure: string;
  label: string;
  hint?: string;
  glyph?: ReactNode;
  /**
   * The 1px divider the site draws at the tile's START edge, inset vertically by 8. Only the caller knows
   * whether this tile opens a row (`index % 2 === 1` on a phone), so it asks for it; the drawing is here so
   * the inset cannot drift between the two grids that use it.
   */
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!label) return null;
  return (
    <View style={[styles.statTile, style]}>
      {/* The divider sits at the tile's reading-start edge — `start-0` on the site, which follows
          `direction` there and has to be resolved to a physical side here. */}
      {rule ? <View style={[styles.statRule, edges().start === "right" ? { right: 0 } : { left: 0 }]} /> : null}
      {glyph ? <View style={{ marginBottom: space.tight }}>{glyph}</View> : null}
      <Text style={[type.figure, { textAlign: "center" }]}>{figure}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
      {hint ? <Text style={styles.statTileHint}>{hint}</Text> : null}
    </View>
  );
}

export type StatCell = {
  /** Already formatted, and null when the figure is not reported — see `StatBar`. */
  figure: string | null;
  label: string;
  /** The site prefixes a «+» to a figure that is still growing, and never to the count of governorates. */
  growing?: boolean;
};

/**
 * The hairlined bar of figures: the home's four over the hero, the offer screen's four under the name.
 *
 * ONE BAR WITH HAIRLINES, NOT FOUR TILES — home-phone.tsx says why: four cards on four grounds read as four
 * separate claims, and these are one fact about the same thing.
 *
 * A NULL FIGURE IS DROPPED, NEVER PRINTED AS A ZERO. The statistics module can be closed, and «0 زيتونة
 * محجوزة» is a statement about the business where no answer at all is simply an absent cell. The filter is
 * here so no caller can forget it.
 */
export function StatBar({
  cells,
  surface = "card",
  size = "home",
  style,
}: {
  cells: StatCell[];
  /** `float` is the home's bar, lifted onto the photograph; `card` the offer screen's, settled on the sheet. */
  surface?: "card" | "float" | "none";
  /** The home prints 18px figures over 10px labels; the offer screen 13px over 9px. */
  size?: "home" | "offer";
  style?: StyleProp<ViewStyle>;
}) {
  const shown = cells.filter((cell) => cell.figure !== null && cell.figure !== "");
  if (shown.length === 0) return null;
  const figureStyle: StyleProp<TextStyle> =
    size === "home"
      ? [type.barFigure, { textAlign: "center" }]
      : [type.barFigure, { fontSize: 13, lineHeight: 13, color: colour.ink, textAlign: "center" }];
  const labelStyle: StyleProp<TextStyle> =
    size === "home"
      ? [type.microTight, { textAlign: "center", marginTop: 4 }]
      : [type.microTight, { fontSize: 9, lineHeight: 9, textAlign: "center", marginTop: 4 }];

  return (
    <View
      style={[
        styles.statBar,
        readingRow(),
        surface === "none" ? styles.statBarBare : null,
        surface === "float" ? shadow.float : null,
        style,
      ]}
    >
      {shown.map((cell, index) => (
        <View key={`${cell.label}-${index}`} style={[styles.statBarCell, readingRow()]}>
          {index > 0 ? <View style={styles.hairlineShort} /> : null}
          <View style={styles.statBarBody}>
            <Text style={figureStyle}>
              {cell.growing ? "+" : ""}
              {cell.figure}
            </Text>
            <Text style={labelStyle}>{cell.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** The 28×1 divider the bars are built from, and the full-width 1px rule between rows. */
export function Hairline({ short = false, style }: { short?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[short ? styles.hairlineShort : styles.hairline, style]} />;
}

/* --------------------------------------------------------------------------- progress */

/**
 * `.counter-fill`'s track — the home's progress bar, a catalogue row's taken share, the counter band's goal
 * rail. Three places, one shape.
 *
 * NEVER THINNER THAN 2 %. The site clamps it, and the reason is that a bar of zero width says «this is not
 * reported» where a sliver says «almost nothing yet», and the second is the true statement.
 *
 * The travelling sheen that `.counter-fill::after` adds is NOT here: it needs a gradient, which means
 * `expo-linear-gradient`, and that belongs to the one screen whose bar earns the motion — the stylesheet
 * argues it earns it because the bar reports a quantity still being collected, which the catalogue row's
 * share is not.
 */
export function ProgressTrack({
  percent,
  height = 6,
  trackColour = colour.line,
  fillColour = colour.leaf,
  accessibilityLabel,
  style,
}: {
  percent: number;
  height?: number;
  trackColour?: string;
  fillColour?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const width = Math.min(100, Math.max(2, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      style={[{ height, borderRadius: radius.pill, backgroundColor: trackColour, overflow: "hidden" }, style]}
    >
      <View style={{ height: "100%", width: `${width}%`, borderRadius: radius.pill, backgroundColor: fillColour }} />
    </View>
  );
}

/* ----------------------------------------------------------------------- section head */

/**
 * `.section-title`, at the three sizes the phone uses it: the offers strip's head (`text-xl`), a page name and
 * the services / FAQ heads (`text-2xl`), and the counter band's own title (the full token, 30px at 375).
 *
 * `trailing` is the «الكل ←» link, and it sits on the BASELINE of the title rather than its centre, which is
 * what `items-baseline` does on the site and what keeps a 14px word from floating beside a 20px one.
 */
export function SectionHeader({
  title,
  size = "page",
  tone = "forest",
  leading,
  trailing,
  style,
}: {
  title: string;
  size?: "rail" | "page" | "section";
  tone?: "forest" | "paper";
  leading?: ReactNode;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const base = size === "rail" ? type.railTitle : size === "section" ? type.sectionTitle : type.pageTitle;
  return (
    <View
      style={[
        readingRow(),
        {
          alignItems: trailing ? "baseline" : "center",
          justifyContent: trailing ? "space-between" : "flex-start",
          gap: leading ? space.snug : 0,
        },
        style,
      ]}
    >
      {leading}
      <Text style={[base, tone === "paper" ? { color: colour.paper } : null, { flexShrink: 1 }]}>{title}</Text>
      {trailing}
    </View>
  );
}

/* ------------------------------------------------------------------------- disclosure */

/**
 * One row of the FAQ (`.disclosure`).
 *
 * THE MARKER IS DRAWN, NOT TYPED — two crossing 2px bars in a 14px box — so it cannot be selected with the
 * text and cannot go missing from a font. It becomes an × by rotating 45°, which is the gesture the site's FAQ
 * already teaches, and it sits at the START of the row because the reading eye arrives there before the words:
 * saying «this opens» after the sentence has been read is saying it too late.
 *
 * NOTHING ABOUT THE BODY ANIMATES, deliberately. globals.css states the reason and it is worth repeating: a
 * height transition is what makes a disclosure shove the page under a reader who is looking further down, and
 * it also defeats the scroll anchoring that keeps their view still. Only the marker moves — and not even that
 * for a reader who asked for less movement.
 */
export function Disclosure({
  question,
  children,
  style,
}: {
  question: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const to = open ? 1 : 0;
    if (reduceMotion) {
      turn.setValue(to);
      return;
    }
    Animated.timing(turn, { toValue: to, duration: 150, useNativeDriver: true }).start();
  }, [open, reduceMotion, turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

  return (
    <View style={style}>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        android_ripple={null}
        style={[readingRow(), styles.summary]}
      >
        <Animated.View style={[styles.marker, { transform: [{ rotate }] }]}>
          <View style={styles.markerBar} />
          <View style={[styles.markerBar, styles.markerBarUp]} />
        </Animated.View>
        <Text style={[type.label, { flex: 1 }]}>{question}</Text>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.answer,
            // The marker and the gap after it are what the question is indented by, so its answer is
            // indented by the same: 16 + 14 + 12 = 42 at the reading start, 16 at the end.
            inlinePadding(42, space.cozy),
          ]}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------ empty */

/** What a screen shows while it has nothing yet. */
export function Waiting({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.centre, style]}>
      <ActivityIndicator color={colour.forest} />
    </View>
  );
}

/**
 * And what it shows when it never will — `mt-8 text-center leading-7 text-muted`.
 *
 * A sentence, centred, in the owner's words, and nothing else: no illustration and no card. The site's empty
 * catalogue is one `<p>`, and anything more would make «there is nothing here» look like a feature.
 */
export function EmptyState({
  text,
  action,
  style,
}: {
  text: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ marginTop: 32 /* mt-8 */ }, style]}>
      <Text style={[type.body, { textAlign: "center", color: colour.muted }]}>{text}</Text>
      {action ? <View style={{ marginTop: space.cozy, alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------ gone */

/*
 * THE SEVEN DEPRECATED COMPOSITIONS THAT STOOD HERE ARE DELETED: Title, OfferCard, Fact, Empty, Figures,
 * Status and treesLine. They were kept so the OLD screens would compile while the new ones were written, and
 * the new ones have landed — nothing in app/ or src/ referred to any of them.
 *
 * Two of them were worse than dead weight, which is why they went rather than waiting:
 *
 *   · `OfferCard` read `offer.min_price_per_tree_millimes` DIRECTLY and printed it. That is the one column no
 *     component may read, because the three-part PRJ-03 guard (offered, on-tree, flag open) lives in
 *     `treePriceMillimes`. It leaked nothing — it was rendered nowhere, and `public_projects()` nulls the
 *     column anyway when the pricing module is shut — but a component that prints a price without the guard
 *     is a loaded gun pointed at the next screen that imports it.
 *   · `Empty` and `treesLine` carried «عاود جرّب» and «زيتونة» as literals, which the owner can already edit
 *     as `ui.pages.error_retry` and `ui.cards.trees_count`. They were the last hard-coded Arabic in this file.
 *
 * Their replacements, named in their own doc comments when they were deprecated: `SectionHeader` or
 * `type.sheetTitle`, the catalogue's own row and the home's 176px tile, `StatBar`, `Pill` with
 * `wordFor(config, "ui.cards.production_", code)`, and `EmptyState`, whose text and retry label are both
 * settings rows.
 */

/* ----------------------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  // .chip
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
    gap: 6,
  },

  // .pill
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 4,
  },

  // .btn
  button: {
    minHeight: 48,
    paddingHorizontal: space.card,
    alignItems: "center",
    justifyContent: "center",
    gap: space.tight,
  },
  // .btn-sm
  buttonSmall: { minHeight: 44, paddingHorizontal: 14 },
  buttonPrimary: { backgroundColor: colour.forest },
  buttonSecondary: { backgroundColor: colour.surface, borderWidth: 1.5, borderColor: colour.lineStrong },
  buttonGhost: { backgroundColor: "transparent", paddingHorizontal: space.snug },

  // .field
  field: {
    alignItems: "center",
    gap: space.tight,
    minHeight: 48,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colour.lineStrong,
    backgroundColor: colour.surface,
    paddingHorizontal: 14,
  },
  // .field-sm — `min-height: 2.75rem; padding: 0.375rem 0.75rem`, same text size.
  fieldSmall: { minHeight: 44, paddingHorizontal: 12 },
  fieldInput: { flex: 1, paddingVertical: 10, fontSize: 16, color: colour.ink },

  // projects-phone.tsx's search box: `rounded-full bg-line/40 px-4 py-2.5`.
  search: {
    alignItems: "center",
    gap: space.tight,
    borderRadius: radius.pill,
    backgroundColor: alpha(colour.line, 0.4),
    paddingHorizontal: space.cozy,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 16, color: colour.ink },

  // .stat, inside the counter band's .panel
  statTile: { flex: 1, alignItems: "center", paddingHorizontal: space.tight, gap: 6 },
  statRule: { position: "absolute", top: 8, bottom: 8, width: 1, backgroundColor: colour.line },
  statTileLabel: {
    ...type.caption,
    fontWeight: "600",
    lineHeight: 20,
    color: colour.ink,
    textAlign: "center",
  },
  statTileHint: { ...type.caption, fontSize: 12, lineHeight: 20, textAlign: "center" },

  // The figures bar.
  statBar: { ...card, alignItems: "center" },
  // `surface: "none"` has to UNDO what the .card ground brought with it, which an empty spread cannot do:
  // a later style key overrides an earlier one, so the shadow is cleared by naming it empty.
  statBarBare: { backgroundColor: "transparent", borderWidth: 0, boxShadow: [], elevation: 0 },
  statBarCell: { flex: 1, alignItems: "center" },
  statBarBody: { flex: 1, paddingVertical: 10 },

  hairline: { height: 1, backgroundColor: colour.line },
  hairlineShort: { width: 1, height: 28, backgroundColor: colour.line },

  // .disclosure
  summary: { minHeight: 48, alignItems: "center", gap: space.snug, paddingVertical: space.snug, paddingHorizontal: space.cozy },
  marker: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  markerBar: { position: "absolute", width: 14, height: 2, backgroundColor: colour.gold },
  markerBarUp: { width: 2, height: 14 },
  answer: { paddingBottom: space.cozy },

  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.roomy },

  // Deprecated compositions.
});
