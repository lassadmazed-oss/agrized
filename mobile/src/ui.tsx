import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { alpha, colour, edges, radius, readingRow, ring, sans, shadow, space, type } from "./theme";

/**
 * The website's `@layer components` — `.btn`, `.field`, `.label`, `.hint`, `.error-text`, `.choice`, `.chip`,
 * `.pill`, `.stat` — as React Native views, at the pixel.
 *
 * WHY A FILE OF ITS OWN AND NOT TWELVE COPIES. Before this, `.chip` was written out five times across the app
 * with slightly different padding each time, and the warm dashed surface a simulated figure has to sit on was
 * re-invented inline by the calculator. The site keeps these in one stylesheet precisely because the material
 * has to mean one thing everywhere: dashed gold is an estimate, a filled green card is the answer you chose,
 * a hairline white card is an object on the page. Copy the material per screen and within a week two screens
 * disagree about what «chosen» looks like — which is exactly what had happened.
 *
 * IT OWNS NO TOKENS. Every colour, radius, elevation, spacing step and type style comes from `theme.ts`,
 * which carries globals.css resolved to pixels and the reasoning behind each one. This file is only the
 * SHAPES: what a control is made of, and which of them a finger can press.
 *
 * WHAT CANNOT CROSS, AND WHAT IT BECAME.
 *  · `:hover` has no meaning under a thumb. Every hover rule is dropped rather than translated into something
 *    a phone would show at the wrong moment; `:active` becomes `pressed`.
 *  · `transition` is dropped: a 150ms colour fade on a control a finger is already holding is invisible.
 *  · `.choice:has(input:checked)` becomes a `picked` prop. The site reads the state from the native input so
 *    that no call site has to change how it marks a choice; here the call site holds the state anyway.
 */

/* --------------------------------------------------------------- type pieces */

/** `.label` — 0.95rem semibold, 0.375rem under it. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.label, { marginBottom: 6 }, style]}>{children}</Text>;
}

/** `.hint` — 0.85rem muted. The caption size the app had as 12 and the site has as 13.6. */
export function Hint({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.caption, style]}>{children}</Text>;
}

/**
 * `.error-text` — 0.875rem danger, 0.375rem above it. Spoken as an alert, as `role="alert"` is on the site.
 *
 * BOTH ANNOUNCEMENT PROPS: `accessibilityRole="alert"` is what VoiceOver reads on iOS and
 * `accessibilityLiveRegion` is Android-only, so one alone leaves a platform silent. This file had the first
 * and ./components.tsx's twin had the second, which meant the same refusal spoke on one platform in half the
 * app and on the other platform in the other half. Both now carry both.
 */
export function ErrorText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[type.error, { marginTop: 6 }, style]}
    >
      {children}
    </Text>
  );
}

/* -------------------------------------------------------------------- field */

/**
 * `.field` — 3rem tall, a 1.5px line-strong edge, a 12px corner, and SIXTEEN PIXEL TEXT.
 *
 * The 16px is not a taste. globals.css records that iOS Safari zooms the page when a focused field's text is
 * smaller, and `.field-sm` deliberately does not shrink it either: it is a property of the input, not of the
 * screen it sits on. A 14px field is a field the owner's customers mistype their phone number into.
 *
 * `:focus` is a forest edge PLUS a 3px ring, and `theme.ts`'s `ring()` reproduces it with `boxShadow` on
 * every device that has it — which is the same mechanism, not an approximation. On Android 8 and older there
 * is no ring and the border colour alone carries the focus, which the theme states as a platform limit.
 */
export function Field({
  value,
  onChangeText,
  placeholder,
  invalid,
  keyboardType,
  autoComplete,
  maxLength,
  accessibilityLabel,
  /** A phone number is Latin digits read left to right, on an Arabic screen as on any other. */
  ltr,
  multiline,
  centre,
  style,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "email-address";
  autoComplete?: "name" | "tel" | "email" | "off";
  maxLength?: number;
  accessibilityLabel?: string;
  ltr?: boolean;
  multiline?: boolean;
  centre?: boolean;
  style?: StyleProp<TextStyle>;
  onSubmitEditing?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onSubmitEditing={onSubmitEditing}
      placeholder={placeholder}
      // `.field::placeholder` — lighter than muted, and the one grey globals.css writes outside @theme.
      // The value is `colour.placeholder` and not the literal: theme.ts already names it, and a hex typed
      // in a screen is a colour that stops following the token the day the token moves.
      placeholderTextColor={colour.placeholder}
      keyboardType={keyboardType}
      autoComplete={autoComplete}
      autoCorrect={false}
      maxLength={maxLength}
      multiline={multiline}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.field,
        ltr ? styles.fieldLtr : styles.fieldRtl,
        centre ? { textAlign: "center" } : null,
        multiline ? styles.fieldMultiline : null,
        focused ? [{ borderColor: colour.forest }, ring(alpha(colour.forest, 0.18))] : null,
        invalid ? { borderColor: colour.danger } : null,
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------- choices */

/**
 * `.choice` — the answer card. 44px minimum on a phone (owner, 2026-09-22: «takes too much space»; still the
 * accessible minimum, and four rows of them stop being four screens), a 1.5px line-strong edge, a 14px
 * corner, 8px/12px of padding.
 *
 * A CHOSEN ANSWER FILLS, and globals.css argues it at length because it settled forty call sites at once: the
 * leaf-soft tint this app used reads as a HOVER on a phone, and on the payment question — where the tiles are
 * the whole decision — it was the thing every redesign kept being asked to fix. So the chosen card goes solid
 * forest with white words, carries `--shadow-card`, and wears the tick as well, because on a grid of eight a
 * coloured edge alone is not enough to find the one that is on.
 */
export function Choice({
  picked,
  onPress,
  children,
  style,
  accessibilityLabel,
}: {
  picked: boolean;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: picked, checked: picked }}
      accessibilityLabel={accessibilityLabel}
      // The website has no ripple anywhere, so neither does this.
      android_ripple={null}
      style={({ pressed }) => [
        styles.choice,
        readingRow(),
        picked ? [styles.choicePicked, shadow.card] : null,
        pressed ? { transform: [{ scale: 0.99 }] } : null,
        style,
      ]}
    >
      {children}
      {picked ? <Tick /> : null}
    </Pressable>
  );
}

/** The tick a chosen card carries, at the END corner — the site's `absolute end-2 top-2 size-6`. */
export function Tick() {
  const { end } = edges();
  return (
    <View style={[styles.tick, { [end]: 8 }]} pointerEvents="none">
      <Svg viewBox="0 0 24 24" width={14} height={14} fill="none">
        <Path
          d="m5 13 4 4 10-10"
          stroke={colour.surface}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * `.chip` — a value the visitor picks: 2.25rem tall, a hairline edge, 0.875rem semibold.
 *
 * The chosen one is a SOLID forest fill, a step past `.chip`'s own tint. The catalogue screen settled on that
 * for the same reason the choice card did: a tint reads as a hover on a phone.
 */
export function Chip({
  label,
  on,
  onPress,
  style,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      android_ripple={null}
      style={({ pressed }) => [styles.chip, on ? styles.chipOn : null, pressed ? { opacity: 0.9 } : null, style]}
    >
      <Text style={[type.chip, on ? { color: colour.paper } : null]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A checkbox and the sentence it agrees to — the shape `.choice items-start` takes for a consent or a yes/no.
 * The whole ROW is the tap target, never the box: a 22px square is not something a thumb should have to find.
 */
export function CheckRow({
  on,
  onToggle,
  children,
  fillWhenOn = true,
  style,
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** The consent row fills when ticked, as `.choice` does; «نحب نزور الأرض» sits on its own tinted ground. */
  fillWhenOn?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      android_ripple={null}
      style={({ pressed }) => [
        styles.choice,
        readingRow(),
        { alignItems: "flex-start" },
        on && fillWhenOn ? styles.choicePicked : null,
        pressed ? { opacity: 0.9 } : null,
        style,
      ]}
    >
      <View style={{ marginTop: 2 }}>
        <CheckBox on={on} inverted={on && fillWhenOn} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </Pressable>
  );
}

/** The box itself. `inverted` is the site's `.choice:has(input:checked) input { accent-color: surface }`. */
export function CheckBox({ on, size = 22, inverted }: { on: boolean; size?: number; inverted?: boolean }) {
  const line = inverted ? colour.surface : on ? colour.forest : colour.lineStrong;
  const fill = on ? (inverted ? colour.surface : colour.forest) : colour.surface;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: line,
        backgroundColor: fill,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on ? (
        <Svg viewBox="0 0 24 24" width={size - 8} height={size - 8} fill="none">
          <Path
            d="m5 13 4 4 10-10"
            stroke={inverted ? colour.forest : colour.surface}
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------- buttons */

/**
 * `.btn` — 3rem tall, 1.25rem of inside padding, a 12px corner, 1rem semibold, an 8px gap.
 *
 * The app's own button was a 50px pill. A pill is a different object: it is what `.chip` is, and using it for
 * the one action a screen is asking for made every screen's main control look like a filter.
 *
 * `paper` is the tone the two dark cards use — `.btn bg-paper text-forest-700` on the closing ask, and
 * `.btn bg-surface text-forest` on the holdings card — a light button on a forest ground.
 */
export function Btn({
  label,
  onPress,
  tone = "primary",
  busy,
  disabled,
  style,
  minHeight,
  trailing,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "paper" | "ghost" | "mute" | "gold";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** `.btn min-h-13` and friends: the site raises the height per call site, never by redefining the class. */
  minHeight?: number;
  trailing?: ReactNode;
}) {
  const off = disabled === true || busy === true;
  const fills: Record<string, StyleProp<ViewStyle>> = {
    primary: styles.btnPrimary,
    secondary: styles.btnSecondary,
    paper: [styles.btnPaper, shadow.raise],
    ghost: styles.btnGhost,
    mute: styles.btnMute,
    gold: styles.btnGold,
  };
  const labels: Record<string, StyleProp<TextStyle>> = {
    primary: styles.btnPrimaryText,
    secondary: styles.btnSecondaryText,
    paper: styles.btnPaperText,
    ghost: styles.btnSecondaryText,
    mute: styles.btnMuteText,
    gold: styles.btnGoldText,
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      android_ripple={null}
      style={({ pressed }) => [
        styles.btn,
        readingRow(),
        fills[tone],
        minHeight ? { minHeight } : null,
        // `.btn:disabled { opacity: 0.55; cursor: not-allowed }`
        off ? { opacity: 0.55 } : null,
        pressed && !off ? { transform: [{ scale: 0.99 }] } : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone === "primary" ? colour.surface : colour.forest} />
      ) : (
        <>
          <Text style={labels[tone]} numberOfLines={1}>
            {label}
          </Text>
          {trailing}
        </>
      )}
    </Pressable>
  );
}

/* --------------------------------------------------------------------- bits */

/** `.pill .pill-line` — a hairline badge carrying no status of its own. */
export function PillLine({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.pill, readingRow(), styles.pillLine]}>
      <Text style={[type.pill, { color: colour.muted }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** `.pill bg-gold-soft text-forest-700` — the stamp that marks a figure as a sample. */
export function PillGold({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.pill, readingRow(), { backgroundColor: colour.goldSoft }]}>
      <Text style={[type.pill, { color: colour.forest700 }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/**
 * `.stat` — a figure and what it counts, with the 0.375rem gap the class sets and no surface of its own, so
 * it works bare (the home's facts row) and inside a card (the counter tiles) exactly as on the site.
 */
export function Stat({
  figure,
  label,
  notes,
  align = "right",
}: {
  figure: string;
  label: string;
  notes?: string[];
  align?: "right" | "center";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.figure, { textAlign: align }]}>{figure}</Text>
      <Text style={[type.statLabel, { textAlign: align }]}>{label}</Text>
      {notes?.map((note) => (
        <Text key={note} style={[type.caption, { fontSize: 12, lineHeight: 20, textAlign: align }]}>
          {note}
        </Text>
      ))}
    </View>
  );
}

/**
 * The calculator's rail: `h-1.5 rounded-full bg-line` with a leaf fill, filling from the START of the reading
 * order — the right in Arabic.
 *
 * No width transition. The site animates it over 300ms; on a phone the step changes with the same tap that
 * replaces the whole question, and a bar still sliding while the new question is being read is the kind of
 * motion that makes a screen feel slower than it is.
 */
export function ProgressRail({ step, total, label }: { step: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (step / total) * 100)) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: step }}
      style={styles.rail}
    >
      <View style={[styles.railFill, { width: `${percent}%` }]} />
    </View>
  );
}

/** A 1px `bg-line` hairline — what the site separates rows with, and nothing else. */
export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colour.line }, style]} />;
}

/* ------------------------------------------------------------- whole screens */

/**
 * `ComingSoon` (src/components/site/module-gate.tsx) — what a module's page shows while its flag keeps it
 * closed: a gold eyebrow, the page's own title, the owner's sentence, and the way home.
 *
 * It exists in the app because a flag can close a module while a screen is already open — a deep link, a tab
 * the reader left open overnight, a switch the owner threw in the Back Office — and the honest answer is the
 * one the website gives, in his words, not a blank screen or a calculator whose way forward opens nothing.
 */
export function ComingSoon({
  title,
  eyebrow,
  text,
  backLabel,
  onBack,
}: {
  title: string;
  eyebrow: string;
  text: string;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    // `mx-auto max-w-xl px-4 py-24 text-center`
    <View style={{ paddingVertical: space.band + space.roomy, gap: space.tight, alignItems: "stretch" }}>
      <Text style={[type.caption, sans(600), { fontSize: 14, color: colour.gold, textAlign: "center" }]}>
        {eyebrow}
      </Text>
      {/* `mt-2 font-display text-4xl font-bold text-forest` */}
      <Text style={[type.display, { color: colour.forest, textAlign: "center", writingDirection: "rtl" }]}>
        {title}
      </Text>
      <Text style={[type.body, { marginTop: space.tight, color: colour.muted, textAlign: "center" }]}>{text}</Text>
      <View style={{ marginTop: space.roomy, alignSelf: "center" }}>
        <Btn label={backLabel} tone="secondary" onPress={onBack} />
      </View>
    </View>
  );
}

/**
 * A read that did not answer, said in the owner's words with his own «جرّب مرّة أخرى».
 *
 * The app's screens used to blank themselves when ANY of their reads failed — one rejected query taking the
 * hero, the copy, the figures and the services with it. The site drops only the section that failed. This is
 * the shape for the case where there is genuinely nothing to draw: the sentence, and a way to ask again.
 */
export function Failure({
  text,
  retryLabel,
  onRetry,
}: {
  text: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <View style={{ marginTop: space.roomy, gap: space.snug, alignItems: "stretch" }}>
      <Text style={[type.caption, { textAlign: "center" }]}>{text}</Text>
      <View style={{ alignSelf: "center" }}>
        <Btn label={retryLabel} tone="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------- icons */

/**
 * The site's drawn glyphs, path for path from its own files.
 *
 * NOT CHARACTERS. The app had «←» inside a Text, «⌕», «▦» and four emoji: every one of them is a different
 * drawing on iOS and Android, an emoji cannot take a colour at all, and a typographic arrow sits on a
 * different baseline in every Arabic system face. `react-native-svg` makes the site's own 24px grid
 * reproducible instead of approximated — and the arrows mirror with `edges().flip`, which is the site's own
 * `ltr:-scale-x-100`.
 */

/** «back» — drawn pointing RIGHT, which is back in Arabic (start-chooser.tsx's phone bar). */
export function BackArrow({ size = 20, color = colour.forest }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
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

/** The chevron that closes a link row, pointing left — forward in Arabic (account-screen.tsx). */
export function Chevron({ size = 20, color = colour.lineStrong }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M14.5 6 8.5 12l6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** «≈» — what the figures on the estimate card are. */
export function EstimateIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Circle cx={12} cy={12} r={9} stroke={colour.gold} strokeWidth={1.75} />
      <Path
        d="M7.6 10.4c1.1-1.3 2.2-1.3 3.3 0s2.2 1.3 3.3 0"
        stroke={colour.gold}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M7.6 14.4c1.1-1.3 2.2-1.3 3.3 0s2.2 1.3 3.3 0"
        stroke={colour.gold}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** The padlock beside «معلوماتك مؤمّنة وآمنة». */
export function LockIcon({ size = 14, color = colour.muted }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Rect x={5} y={10} width={14} height={10} rx={2} stroke={color} strokeWidth={1.75} />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * The olive tree that grows with the number on a tier card (tree-card.tsx).
 *
 * The site hides it below `sm` — «a lovely idea on a wide card and 20px of noise on a 56px chip where the
 * number is already the whole message» — so the tier grid does not draw it. It is here because the custom
 * number card uses it, where there is room.
 */
export function OliveMark({ trees, color = colour.leaf }: { trees: number; color?: string }) {
  const size = trees >= 500 ? 46 : trees >= 250 ? 40 : trees >= 100 ? 34 : trees >= 50 ? 28 : 24;
  return (
    <Svg viewBox="0 0 32 32" width={size} height={size} fill="none">
      <Path d="M16 28v-9" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M16 22l-4-3M16 19l4-3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={16} cy={11} r={6} stroke={color} strokeWidth={1.6} />
      <Circle cx={9.5} cy={15} r={3.6} stroke={color} strokeWidth={1.6} />
      <Circle cx={22.5} cy={15} r={3.2} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  field: {
    width: "100%",
    minHeight: 48,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colour.lineStrong,
    backgroundColor: colour.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colour.ink,
  },
  fieldRtl: { textAlign: "right", writingDirection: "rtl" },
  fieldLtr: { textAlign: "left", writingDirection: "ltr" },
  fieldMultiline: { minHeight: 80, paddingTop: 12, textAlignVertical: "top" },

  choice: {
    alignItems: "center",
    gap: space.snug,
    minHeight: 44,
    paddingVertical: space.tight,
    paddingHorizontal: space.snug,
    borderWidth: 1.5,
    borderColor: colour.lineStrong,
    borderRadius: radius.choice,
    backgroundColor: colour.surface,
  },
  choicePicked: { borderColor: colour.forest, backgroundColor: colour.forest },
  tick: {
    position: "absolute",
    top: 8,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colour.forest,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raise,
  },

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
  chipOn: { backgroundColor: colour.forest, borderColor: colour.forest },

  btn: {
    minHeight: 48,
    paddingHorizontal: space.card,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    gap: space.tight,
  },
  btnPrimary: { backgroundColor: colour.forest },
  btnPrimaryText: { ...type.button, color: colour.surface },
  btnSecondary: { backgroundColor: colour.surface, borderWidth: 1.5, borderColor: colour.lineStrong },
  btnSecondaryText: { ...type.button, color: colour.forest },
  btnPaper: { backgroundColor: colour.paper },
  btnPaperText: { ...type.button, color: colour.forest700 },
  btnGhost: { backgroundColor: "transparent", paddingHorizontal: space.snug },
  // `.btn bg-line text-muted` — the site's own shape for a way forward that is not open yet.
  btnMute: { backgroundColor: colour.line },
  btnMuteText: { ...type.button, color: colour.muted },
  // `.btn bg-gold-bright text-lg text-forest-700` — the calculator's «سجّل اهتمامك», the one gold button on
  // the site. It is gold and not forest because it closes a simulation rather than opening one.
  btnGold: { backgroundColor: colour.goldBright },
  btnGoldText: { ...type.button, fontSize: 18, lineHeight: 21.6, color: colour.forest700 },

  pill: {
    alignSelf: "flex-start",
    alignItems: "center",
    gap: space.hair,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pillLine: { borderWidth: 1, borderColor: colour.line, backgroundColor: colour.surface },

  rail: { height: 6, borderRadius: radius.pill, backgroundColor: colour.line, overflow: "hidden" },
  railFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colour.leaf, alignSelf: "flex-end" },
});
