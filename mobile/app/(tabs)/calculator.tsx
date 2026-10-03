import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import { formatMessage, moduleOpen, optionsFor, settingInt, t, type OptionItem } from "../../src/config";
import { siteFormat } from "../../src/format";
import { InterestForm } from "../../src/InterestForm";
import {
  buildSummary,
  leadKeyOf,
  treeQuote,
  type PaymentMode,
  type SummaryRow,
  type TreeQuote,
} from "../../src/quote";
import { colour, estimate, frame, panel, radius, sans, shadow, space, type } from "../../src/theme";
import {
  BackArrow,
  Btn,
  Choice,
  ComingSoon,
  EstimateIcon,
  Failure,
  Hairline,
  Hint,
  LockIcon,
  OliveMark,
  ProgressRail,
  Tick,
} from "../../src/ui";
import { useConfig } from "../../src/use-config";

/**
 * احسب مشروعك — the website's /start, on a phone, with every figure answered by Postgres.
 *
 * ── WHAT THIS REPLACES, AND WHY THE OLD ARGUMENT NO LONGER HOLDS ─────────────────────────────────────────
 *
 * The tab here was a chip row times a number: `perTree * wanted` in a component, labelled a تقدير. Its
 * docstring argued that the offer has already answered four of /start's five questions, that no financing
 * figure may be invented on a phone, and that the app has no business copying a markup table. Every one of
 * those sentences is right, and the conclusion drawn from them was wrong, because `public_tree_quote` is
 * granted to `anon` (0034) and answers all of it:
 *
 *     the price per tree · the total · the yearly care, per tree and in all · the down payment in dinars for
 *     a chosen percentage · the financed total · what remains after the down payment · the monthly
 *     instalment · the last instalment when rounding up ends the plan early · how many instalments that is
 *
 * Verified against the live project with the anon key, 25 trees at 7×5 (35 m² each): the cash total is
 * 9,975,000 millimes and the yearly care 300,000 — which the old screen never showed at all, so a project
 * looked cheaper on the phone than on the site. On instalments at 30 % over four years it answers a monthly
 * of 204,000 against a financed total of 12,768,000 and a last instalment of 187,000. That financed total is
 * not the cash total times anything a component could guess: it carries a markup per duration (report v3
 * §12, `app.financed_quote`). So the old screen was inventing a figure the database would have given it, and
 * offering no instalment at all while `installments` has been public the whole time — and the owner's own
 * positioning leads with instalments as the easy start.
 *
 * NOTHING ON THIS SCREEN MULTIPLIES, ADDS A MARKUP OR ROUNDS. `src/quote.ts` asks and this file lays out.
 *
 * ── THE COMPOSITION IS start-chooser.tsx's PHONE LAYOUT ──────────────────────────────────────────────────
 *
 * One question per screen, and answering it carries the visitor to the next (owner, 2026-09-16), with the
 * figures following every answer rather than waiting for the end (owner, 2026-09-18: «التسعيرة في نفس
 * الصفحة»). In order: the tree count, the area per tree, the kind of project, cash or instalments, then — for
 * instalments only — the down payment and the duration, then the figures. A step whose Back Office list is
 * empty drops out, and switching back to cash removes its own two screens.
 *
 * Four things keep the screen honest about what it is (owner, 2026-09-18: «الـMain Form موش عرض … هذا مثال
 * تقديري لمشروع يناسب اختياراتك، موش عرض عقاري نهائي»), and all four are carried over: the figures sit on the
 * dashed `.card-estimate` surface and never on an elevated one, the disclaimer is stamped across the HEAD of
 * that card rather than left as a footnote, every amount is prefixed «ابتداءً من», and what is real — the
 * registration — sits on its own raised `.panel` at the end.
 *
 * THE QUESTION IS SANS AT THIS WIDTH, not Markazi. `h1` is `text-xl font-bold text-forest` with
 * `sm:section-title` only from 640px up, so the phone's question is the interface face at 20/700. Stated
 * because it is the one heading on the site that is NOT the display face by default and it would be
 * «corrected» otherwise.
 *
 * ── WHERE NATIVE WINS, NAMED ────────────────────────────────────────────────────────────────────────────
 *
 *  · THE STICKY BAR. The site pins the first screen's bar with `sticky bottom-[var(--tabbar-h)]`, a token
 *    that exists only because a fixed element is outside the flow and nothing below it knows it is there.
 *    Here the navigator owns the tab bar and its safe-area inset, so the bar is an absolutely positioned view
 *    INSIDE this screen with the scroll padded by its height — no 76px constant, and it stays right when the
 *    bar's height changes with the device.
 *
 *  · THE ADDRESS. /start keeps every answer in the URL so a reload, a shared link or the browser's back
 *    button restore it, and so the answers can travel to /register. An app has no address bar and no shared
 *    link; the answers live in this component, and the back gesture belongs to the navigator.
 *
 *  · WHERE «سجّل اهتمامك» LEADS. The site navigates to /register, because a web page must. The app has its
 *    one write path in hand, so the form opens on this screen under the panel. One scroll, no navigation.
 */

/** start-chooser.tsx:160 — one question per screen, in this order. */
type StepKey = "trees" | "spacing" | "type" | "payment" | "down" | "duration" | "summary";

export default function CalculatorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { config, ready, failed, reload } = useConfig();
  const scroll = useRef<ScrollView | null>(null);

  const fmt = useMemo(() => siteFormat(config), [config]);

  /* ---------------------------------------------------------------- the lists */

  // LEAD-01: every choice is a Back Office row, in the order that screen puts it in.
  const treeCounts = useMemo(() => optionsFor(config, "tree_count"), [config]);
  const downPercents = useMemo(() => optionsFor(config, "down_payment_percent"), [config]);
  const durations = useMemo(() => optionsFor(config, "duration"), [config]);
  const spacingClasses = config.spacingClasses;
  const scenarios = config.scenarios;
  const customMin = settingInt(config, "million.custom_trees_min", 1);
  const customMax = settingInt(config, "million.custom_trees_max", 5000);

  /* -------------------------------------------------------------- the answers */

  const [treeId, setTreeId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [spacingId, setSpacingId] = useState<string | null>(null);
  const [spacingAnswered, setSpacingAnswered] = useState(false);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [downId, setDownId] = useState<string | null>(null);
  const [durationId, setDurationId] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("trees");
  const [registering, setRegistering] = useState(false);

  const customNumber = custom === "" ? null : Number(custom);
  const customValid =
    customNumber !== null && Number.isInteger(customNumber) && customNumber >= customMin && customNumber <= customMax;
  const customSelected = treeId === null && customValid;
  const customInvalid = custom !== "" && !customValid;

  const chosenTree = treeId ? treeCounts.find((option) => option.id === treeId) : undefined;
  const chosenSpacing = spacingId ? spacingClasses.find((option) => option.id === spacingId) : undefined;
  const chosenScenario = scenarioId ? scenarios.find((option) => option.id === scenarioId) : undefined;
  const chosenDown = downId ? downPercents.find((option) => option.id === downId) : undefined;
  const chosenDuration = durationId ? durations.find((option) => option.id === durationId) : undefined;
  const hasTrees = Boolean(chosenTree) || customSelected;
  const installments = paymentMode === "installments";

  /**
   * Only the questions this site actually asks: an empty Back Office list removes its screen, and the two
   * instalment screens exist only while instalments are chosen.
   *
   * IT IS A FUNCTION OF THE PAYMENT MODE, not of the current state, and that matters more than it looks.
   * Choosing an answer can ADD screens — picking instalments brings its own two — so the move that follows
   * that tap has to read the list the answer CREATES, not the one that was on screen when it was tapped. The
   * website solves this by pausing ~250ms so its effect has run and a ref has caught up; a ref read in the
   * same tick as `setState` is exactly the bug that pause is hiding, and here the list is simply derived for
   * the mode being chosen and handed to the move.
   */
  const stepsFor = useCallback(
    (mode: PaymentMode | null): StepKey[] => {
      const list: StepKey[] = ["trees"];
      if (spacingClasses.length > 0) list.push("spacing");
      if (scenarios.length > 0) list.push("type");
      list.push("payment");
      if (mode === "installments" && downPercents.length > 0) list.push("down");
      if (mode === "installments" && durations.length > 0) list.push("duration");
      list.push("summary");
      return list;
    },
    [spacingClasses.length, scenarios.length, downPercents.length, durations.length],
  );

  const steps = useMemo(() => stepsFor(paymentMode), [stepsFor, paymentMode]);

  // Switching back to cash removes the two instalment screens, so a screen that no longer exists reads as
  // the summary — start-chooser.tsx's own rule.
  const activeStep: StepKey = steps.includes(step) ? step : "summary";
  const index = Math.max(steps.indexOf(activeStep), 0);
  const isSummary = activeStep === "summary";

  /** True while one answer is being changed from the figures card, so it returns there. */
  const editing = useRef(false);

  const advance = useCallback(
    (list: StepKey[] = steps) => {
      const wasEditing = editing.current;
      editing.current = false;
      setStep((current) => {
        if (wasEditing) return "summary";
        const at = list.indexOf(list.includes(current) ? current : "summary");
        return at >= 0 && at + 1 < list.length ? list[at + 1] : current;
      });
    },
    [steps],
  );

  /**
   * The site pauses ~250ms before moving on, so the chosen card shows its tick first. Here the tick and the
   * fill are both immediate and the next screen replaces the question under the same finger, so the pause is
   * dropped: on a phone a quarter-second of nothing after a tap reads as a tap that did not register.
   */
  const pick = useCallback(
    (set: () => void, list?: StepKey[]) => {
      set();
      Keyboard.dismiss();
      advance(list);
    },
    [advance],
  );

  /** Going back to «بالحاضر» drops the two instalment answers, so nothing travels that was not chosen. */
  const pickPayment = useCallback(
    (mode: PaymentMode) => {
      setPaymentMode(mode);
      if (mode === "cash") {
        setDownId(null);
        setDurationId(null);
      }
      Keyboard.dismiss();
      advance(stepsFor(mode));
    },
    [advance, stepsFor],
  );

  const goBack = () => {
    editing.current = false;
    setStep(steps[Math.max(index - 1, 0)]);
  };

  /** «تبديل» on a row: that one answer carries the visitor straight back to the figures. */
  const goEdit = (next: StepKey) => {
    editing.current = true;
    setStep(next);
  };

  // Each screen is a new question: bring the reader to its title, as /start does with scrollTo.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: true });
  }, [activeStep]);

  /* ---------------------------------------------------------------- the quote */

  const [quote, setQuote] = useState<TreeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const sequence = useRef(0);

  const trees = chosenTree ? chosenTree.min_number : customSelected ? customNumber : null;

  useEffect(() => {
    if (!spacingId) {
      setQuote(null);
      return;
    }
    const mine = ++sequence.current;
    setQuoting(true);
    void treeQuote({
      spacingClassId: spacingId,
      trees,
      paymentMode,
      downPercentOptionId: installments ? downId : null,
      durationOptionId: installments ? durationId : null,
    })
      .then((answer) => {
        // A slower earlier request must not overwrite a newer answer.
        if (mine !== sequence.current) return;
        setQuote(answer);
      })
      .finally(() => {
        if (mine === sequence.current) setQuoting(false);
      });
  }, [spacingId, trees, paymentMode, downId, durationId, installments]);

  const summary = useMemo(
    () =>
      buildSummary(
        config,
        {
          tree: chosenTree ?? null,
          treesCustom: customSelected ? customNumber : null,
          scenario: chosenScenario ?? null,
          spacing: chosenSpacing ?? null,
          withSpacing: spacingClasses.length > 0,
          paymentMode,
          downPercent: chosenDown ?? null,
          duration: chosenDuration ?? null,
        },
        spacingId ? quote : null,
      ),
    [
      config,
      chosenTree,
      customSelected,
      customNumber,
      chosenScenario,
      chosenSpacing,
      spacingClasses.length,
      paymentMode,
      chosenDown,
      chosenDuration,
      spacingId,
      quote,
    ],
  );

  const showFigures = summary.rows.some((row) => row.value !== null) || summary.notice !== null;
  const leadKey = leadKeyOf(summary);
  const leadRow = leadKey ? (summary.rows.find((r) => r.key === leadKey) ?? null) : null;
  const listRows = summary.rows.filter((r) => r.key !== leadKey);
  const busy = quoting && spacingId !== null;

  /**
   * What is still missing before an interest can be registered — `calculatorGap`'s three answers, and each
   * one has the owner's own sentence against the question that is missing it.
   */
  const gap: "trees" | "payment" | "plan" | null = !hasTrees
    ? "trees"
    : paymentMode === null
      ? "payment"
      : installments && ((downPercents.length > 0 && !downId) || (durations.length > 0 && !durationId))
        ? "plan"
        : null;
  // The site writes a sentence for the payment gaps and none for a missing tree count, because the way
  // forward on the first screen is disabled until one is chosen and that gap is therefore unreachable.
  const gapHint: string | null =
    gap === "payment"
      ? t(config, "start.continue_hint_payment")
      : gap === "plan"
        ? t(config, "start.continue_hint_installments")
        : null;

  /* ------------------------------------------------------------------- render */

  // FLAG-02: the website replaces this whole page with «قريباً» while `interest_form` is closed, and the tab
  // itself is gone from the bar. A reader who arrives here anyway — a deep link, a stale screen — is told the
  // same thing rather than shown a calculator whose way forward opens nothing.
  const open = !ready || moduleOpen(config, "interest_form");

  const title = t(config, "start.estimate_cta");
  const questionTitle: Record<StepKey, string> = {
    trees: t(config, "site.trees_question"),
    spacing: t(config, "start.spacing_title"),
    type: t(config, "site.style_question"),
    payment: t(config, "start.payment_title"),
    down: t(config, "start.down_percent_title"),
    duration: t(config, "start.row_duration"),
    summary: t(config, "start.summary_title"),
  };

  // The first screen keeps a bar pinned to the bottom, because a typed number is not a tap and needs a way
  // forward of its own. Every other screen's way forward is the answer itself, so there the bar just follows
  // the page — the site's own rule, and the reason it does not pin «رجوع» alone on five screens.
  const pinned = activeStep === "trees";
  const BAR = 48 + space.snug * 2 + 1;

  return (
    <View style={{ flex: 1, backgroundColor: colour.paper }}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.page,
          { paddingTop: space.cozy + insets.top, paddingBottom: space.cozy + (pinned ? BAR : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          {/*
            THE PHONE'S OWN BAR (owner, 2026-09-22: «a full redesign, better saving space»). The screen used
            to open with a lockup, a breadcrumb, a badge, a step line and a progress rail — five stacked rows,
            about 150px, before the question, all five saying one of two things: what this is, and how far in
            you are. So it is one row that says both, with the way back where a thumb expects it.
          */}
          <View style={styles.bar}>
            <Pressable
              onPress={() => (index > 0 ? goBack() : router.push("/"))}
              accessibilityRole="button"
              accessibilityLabel={index > 0 ? t(config, "ui.start.back") : t(config, "start.home_label")}
              android_ripple={null}
              style={styles.barBack}
            >
              <BackArrow />
            </Pressable>
            <Text style={[type.cardTitle, styles.barTitle]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.barStep}>
              {index + 1}/{steps.length}
            </Text>
          </View>

          {open ? (
            <>
              <ProgressRail
                step={index + 1}
                total={steps.length}
                label={t(config, "ui.start.progress_label")}
              />

              {/* `mt-3 text-xl font-bold leading-tight text-forest` — SANS at this width. See the note above. */}
              <Text style={styles.question}>{questionTitle[activeStep]}</Text>

              {activeStep === "trees" ? <Text style={styles.subtitle}>{t(config, "site.trees_subtitle")}</Text> : null}
              {activeStep === "spacing" ? (
                <Hint style={{ marginTop: space.tight }}>{t(config, "start.spacing_hint")}</Hint>
              ) : null}
              {activeStep === "payment" ? (
                <Hint style={{ marginTop: space.tight }}>{t(config, "start.payment_hint")}</Hint>
              ) : null}
              {activeStep === "down" ? (
                <Hint style={{ marginTop: space.tight }}>{t(config, "start.down_percent_hint")}</Hint>
              ) : null}

              {/* On the last screen the figures are read FIRST on a phone, which is the site's own order. */}
              {isSummary && showFigures ? (
                <FiguresCard
                  note={t(config, "start.estimate_note")}
                  lead={leadRow}
                  rows={listRows}
                  notice={summary.notice}
                  busy={busy}
                  editLabel={t(config, "ui.start.edit")}
                  onEdit={(key) => {
                    const target = rowStep(key, steps);
                    if (target) goEdit(target);
                  }}
                />
              ) : null}

              <View style={{ marginTop: space.snug }}>
                {activeStep === "trees" ? (
                  <TreesStep
                    options={treeCounts}
                    treeId={treeId}
                    onPickTier={(id) =>
                      pick(() => {
                        setTreeId(id);
                        setCustom("");
                      })
                    }
                    custom={custom}
                    onCustom={(value) => {
                      setCustom(value.replace(/[^0-9]/g, ""));
                      setTreeId(null);
                    }}
                    customSelected={customSelected}
                    customInvalid={customInvalid}
                    customNumber={customNumber}
                    label={t(config, "start.custom_label")}
                    placeholder={t(config, "start.custom_placeholder")}
                    hint={formatMessage(t(config, "start.custom_hint"), { min: customMin, max: customMax })}
                  />
                ) : null}

                {activeStep === "spacing" ? (
                  <SpacingStep
                    classes={spacingClasses}
                    spacingId={spacingId}
                    answered={spacingAnswered}
                    anyLabel={t(config, "start.spacing_any")}
                    spacingOf={(row) => fmt.spacing(row.row_spacing_m, row.tree_spacing_m)}
                    areaOf={(row) => fmt.area(row.area_m2)}
                    onPick={(id) =>
                      pick(() => {
                        setSpacingId(id);
                        setSpacingAnswered(true);
                      })
                    }
                  />
                ) : null}

                {activeStep === "type" ? (
                  <View style={{ gap: space.tight }}>
                    {scenarios.map((option) => (
                      <Choice
                        key={option.id}
                        picked={scenarioId === option.id}
                        onPress={() => pick(() => setScenarioId(option.id))}
                        style={{ alignItems: "flex-start" }}
                        accessibilityLabel={option.label}
                      >
                        <GrowthIcon code={option.icon_code} picked={scenarioId === option.id} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={[
                              type.label,
                              scenarioId === option.id ? { color: colour.surface } : { color: colour.ink },
                            ]}
                          >
                            {option.label}
                          </Text>
                          {option.description ? (
                            <Text
                              style={[
                                styles.scenarioNote,
                                scenarioId === option.id ? { color: "rgba(255,255,255,0.82)" } : null,
                              ]}
                            >
                              {option.description}
                            </Text>
                          ) : null}
                        </View>
                      </Choice>
                    ))}
                  </View>
                ) : null}

                {activeStep === "payment" ? (
                  <TileGrid
                    columns={2}
                    options={[
                      { id: "cash", label: t(config, "start.payment_cash") },
                      { id: "installments", label: t(config, "start.payment_installments") },
                    ]}
                    value={paymentMode}
                    onPick={(id) => pickPayment(id === "cash" ? "cash" : "installments")}
                  />
                ) : null}

                {activeStep === "down" ? (
                  <TileGrid
                    columns={3}
                    options={downPercents.map((o) => ({ id: o.id, label: o.label }))}
                    value={downId}
                    onPick={(id) => pick(() => setDownId(id))}
                  />
                ) : null}

                {activeStep === "duration" ? (
                  <TileGrid
                    columns={3}
                    options={durations.map((o) => ({ id: o.id, label: o.label }))}
                    value={durationId}
                    onPick={(id) => pick(() => setDurationId(id))}
                  />
                ) : null}

                {/*
                  WHAT IS REAL, on its own raised surface — the opposite of the dashed estimate above it. The
                  site's panel carries the registration and the lock line and nothing else (owner,
                  2026-09-23): «عروضنا الحالية» and its button used to sit under a rule here and they turned
                  the one thing this screen is for into a choice between two.
                */}
                {isSummary ? (
                  <View style={styles.panel}>
                    {gap === null ? (
                      registering ? (
                        <InterestForm trees={trees ?? undefined} />
                      ) : (
                        <Btn
                          label={t(config, "start.continue")}
                          onPress={() => setRegistering(true)}
                          tone="gold"
                          style={{ width: "100%" }}
                        />
                      )
                    ) : (
                      <>
                        <Btn
                          label={t(config, "start.continue")}
                          onPress={() => {}}
                          disabled
                          tone="mute"
                          style={{ width: "100%" }}
                        />
                        {gapHint ? <Text style={styles.gapHint}>{gapHint}</Text> : null}
                      </>
                    )}

                    {/* `mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted` */}
                    <View style={styles.secure}>
                      <View style={{ marginTop: 2 }}>
                        <LockIcon />
                      </View>
                      <Text style={styles.secureText}>{t(config, "start.secure_note")}</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/*
                The running estimate, as a phone can afford it: one line, the figure that moves. The full card
                is `max-lg:hidden` during the questions on the site, for the same reason — eleven rows beside
                a three-chip question is the card reading the visitor their own answers back.
              */}
              {showFigures && !isSummary && leadRow?.value ? (
                <View style={styles.runningLine}>
                  <Text style={styles.runningLabel} numberOfLines={1}>
                    {leadRow.label}
                  </Text>
                  <Text style={styles.runningValue}>{leadRow.value}</Text>
                </View>
              ) : null}

              {/* On every screen but the first, the way back follows the page. */}
              {!pinned && index > 0 ? (
                <View style={{ marginTop: space.card, alignSelf: "flex-end" }}>
                  <Btn label={t(config, "ui.start.back")} tone="secondary" onPress={goBack} />
                </View>
              ) : null}
            </>
          ) : (
            /* FLAG-02: the same screen the website answers with, in the owner's own words. */
            <ComingSoon
              title={title}
              eyebrow={t(config, "ui.pages.coming_soon_eyebrow")}
              text={t(config, "ui.pages.coming_soon_text")}
              backLabel={t(config, "ui.pages.back_home")}
              onBack={() => router.push("/")}
            />
          )}

          {failed ? (
            <Failure
              text={t(config, "ui.offer.form_error_network")}
              retryLabel={t(config, "ui.pages.error_retry")}
              onRetry={reload}
            />
          ) : null}
        </View>
      </ScrollView>

      {/*
        THE PINNED BAR — absolutely positioned INSIDE the screen and OUTSIDE the scroll, with the scroll's own
        bottom padding reserving its height. The site writes `sticky bottom-[var(--tabbar-h)]`; here the
        navigator already owns the tab bar's strip and its safe-area inset, so adding the website's 76 on top
        would be the usual double gap.
      */}
      {open && pinned ? (
        <View style={styles.pinned}>
          <Hairline />
          <View style={styles.pinnedInner}>
            <Btn
              label={t(config, "ui.start.next")}
              onPress={() => advance()}
              disabled={!hasTrees}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The screen that answers a summary row, when the visitor may still change it. A question owns one «تبديل»
 * and no more: the total area is read from the same spacing screen as the area per tree, and repeating the
 * link on both rows put the same control twice on one card.
 */
function rowStep(key: SummaryRow["key"], steps: StepKey[]): StepKey | null {
  const target: Partial<Record<SummaryRow["key"], StepKey>> = {
    trees: "trees",
    type: "type",
    area_per_tree: "spacing",
    payment: "payment",
    down: "down",
    duration: "duration",
  };
  const step = target[key];
  return step && steps.includes(step) ? step : null;
}

/* ------------------------------------------------------------------- step 1 */

/**
 * The tiers, as the Back Office wrote them, plus a free number.
 *
 * `treeCardClass(selected, "light")` and not `.choice`: this one grid has its own card, and a chosen tier is
 * `border-forest bg-leaf-soft` rather than the solid forest fill. It is the site's own exception and it is
 * kept — the grid is four across at this width and a solid fill at 56px tall swallows the number.
 *
 * The olive mark and the tagline are `hidden sm:block` on the site («a lovely idea on a wide card and 20px of
 * noise on a 56px chip where the number is already the whole message»), so the phone grid draws neither.
 */
function TreesStep({
  options,
  treeId,
  onPickTier,
  custom,
  onCustom,
  customSelected,
  customInvalid,
  customNumber,
  label,
  placeholder,
  hint,
}: {
  options: OptionItem[];
  treeId: string | null;
  onPickTier: (id: string) => void;
  custom: string;
  onCustom: (value: string) => void;
  customSelected: boolean;
  customInvalid: boolean;
  customNumber: number | null;
  label: string;
  placeholder: string;
  hint: string;
}) {
  const field = useRef<TextInput | null>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.tierGrid}>
        {options.map((option) => {
          const picked = treeId === option.id;
          return (
            <View key={option.id} style={styles.tierCell}>
              <Pressable
                onPress={() => onPickTier(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: picked }}
                android_ripple={null}
                style={[styles.tier, picked ? styles.tierPicked : styles.tierPlain]}
              >
                <Text style={[styles.tierLabel, option.min_number ? null : { fontSize: 13 }]} numberOfLines={2}>
                  {option.label}
                </Text>
                {picked ? <Tick /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      {/*
        A TYPED NUMBER IS NOT A CLICK, so this card does not move the visitor on — the pinned bar does. On a
        phone the site lays it out as a row: `max-sm:flex-row max-sm:flex-wrap max-sm:justify-between`, the
        label at one end and a 112×40 centred field at the other, with the hint on its own full-width line.

        The site wraps the whole card in a `<label htmlFor>`, so tapping anywhere on it puts the cursor in the
        field. That is what the pressable label does here: on a phone the field is 112px of a 343px card, and
        a card that looks tappable and is not is the sort of thing a reader tries twice and then gives up on.
      */}
      <View style={[styles.customCard, customSelected ? styles.tierPicked : styles.tierPlain]}>
        {customSelected ? <Tick /> : null}
        {customSelected && customNumber !== null ? <OliveMark trees={customNumber} /> : null}
        <Text
          accessibilityRole="button"
          onPress={() => field.current?.focus()}
          style={styles.customLabel}
        >
          {label}
        </Text>
        <View
          style={[
            styles.customField,
            focused ? { borderColor: colour.forest } : null,
            customInvalid ? { borderColor: colour.danger } : null,
          ]}
        >
          <TextInput
            ref={field}
            value={custom}
            onChangeText={onCustom}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            // `.field::placeholder`, through theme.ts's token rather than retyped as a hex here.
            placeholderTextColor={colour.placeholder}
            keyboardType="number-pad"
            maxLength={9}
            accessibilityLabel={label}
            style={styles.customInput}
          />
        </View>
        <Text style={[styles.customHint, customInvalid ? { color: colour.danger } : null]}>{hint}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- step 2 */

/** The area that goes with each tree: three across, the figure pushed to the foot of the card. */
function SpacingStep({
  classes,
  spacingId,
  answered,
  anyLabel,
  spacingOf,
  areaOf,
  onPick,
}: {
  classes: { id: string; label: string; row_spacing_m: number; tree_spacing_m: number; area_m2: number }[];
  spacingId: string | null;
  answered: boolean;
  anyLabel: string;
  spacingOf: (row: { row_spacing_m: number; tree_spacing_m: number }) => string;
  areaOf: (row: { area_m2: number }) => string;
  onPick: (id: string | null) => void;
}) {
  const anyPicked = answered && spacingId === null;
  return (
    <View style={styles.spacingGrid}>
      {classes.map((option) => {
        const picked = spacingId === option.id;
        const on = picked ? { color: colour.surface } : null;
        return (
          <View key={option.id} style={styles.spacingCell}>
            <Choice
              picked={picked}
              onPress={() => onPick(option.id)}
              accessibilityLabel={option.label}
              // `h-full flex-col items-start justify-start gap-0.5 pe-7` — the 28px end padding is
              // unconditional so the tick never reflows the card when it appears.
              style={styles.spacingCard}
            >
              <View style={{ width: "100%", gap: 2 }}>
                <Text style={[styles.spacingName, on]} numberOfLines={2}>
                  {option.label}
                </Text>
                <Text style={[styles.spacingSize, picked ? { color: "rgba(255,255,255,0.82)" } : null]}>
                  {spacingOf(option)}
                </Text>
                <Text style={[styles.spacingArea, on]}>{areaOf(option)}</Text>
              </View>
            </Choice>
          </View>
        );
      })}
      <View style={styles.spacingCell}>
        <Choice
          picked={anyPicked}
          onPress={() => onPick(null)}
          accessibilityLabel={anyLabel}
          style={[styles.spacingCard, { justifyContent: "center" }]}
        >
          <Text
            style={[styles.spacingName, { textAlign: "center", width: "100%" }, anyPicked ? { color: colour.surface } : null]}
          >
            {anyLabel}
          </Text>
        </Choice>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- steps 4 · 5 · 6 */

/**
 * ChoiceGrid — the payment question two across, the percentages and the durations three across.
 *
 * «The chosen chip is filled, not outlined: on a row of five amounts a coloured edge reads as decoration.»
 * The label is `text-lg font-semibold tabular-nums` — 18/600, with fixed-width digits so «10%» and «50%» do
 * not jog the row.
 */
function TileGrid({
  columns,
  options,
  value,
  onPick,
}: {
  columns: 2 | 3;
  options: { id: string; label: string }[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <View style={styles.tileGrid}>
      {options.map((option) => {
        const picked = value === option.id;
        return (
          <View key={option.id} style={{ width: columns === 2 ? "50%" : "33.3333%", padding: space.hair }}>
            <Choice
              picked={picked}
              onPress={() => onPick(option.id)}
              accessibilityLabel={option.label}
              style={{ justifyContent: "center", minHeight: 52 }}
            >
              <Text style={[styles.tileLabel, picked ? { color: colour.surface } : null]} numberOfLines={2}>
                {option.label}
              </Text>
            </Choice>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ figures */

/**
 * The figures card: `.card .card-estimate overflow-hidden` with the disclaimer stamped across its head.
 *
 * It reports what the answers cost and stops there. What to do about it is the panel below, on a surface that
 * is not an estimate — the site's own division, and the reason the material means one thing.
 */
function FiguresCard({
  note,
  lead,
  rows,
  notice,
  busy,
  editLabel,
  onEdit,
}: {
  note: string;
  lead: SummaryRow | null;
  rows: SummaryRow[];
  notice: string | null;
  busy: boolean;
  editLabel: string;
  onEdit: (key: SummaryRow["key"]) => void;
}) {
  const shown = rows.filter((row) => row.value !== null);
  return (
    <View style={styles.estimateCard}>
      {note ? (
        <View style={styles.estimateHead}>
          <View style={{ marginTop: 1 }}>
            <EstimateIcon />
          </View>
          <Text style={styles.estimateNote}>{note}</Text>
        </View>
      ) : null}

      {/* Figures stay on screen while a newer quote loads, dimmed, so the card does not jump. */}
      <View style={[styles.estimateBody, busy ? { opacity: 0.6 } : null]}>
        {lead?.value ? (
          <View style={styles.lead}>
            <Text style={type.figure}>{lead.value}</Text>
            <Text style={type.statLabel}>{lead.label}</Text>
            {lead.notes.map((line) => (
              <Text key={line} style={styles.rowNote}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {shown.map((row, position) => (
          <View key={row.key}>
            {position > 0 ? <Hairline /> : null}
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                {row.notes.map((line) => (
                  <Text key={line} style={styles.rowNote}>
                    {line}
                  </Text>
                ))}
              </View>
              <View style={styles.rowValueCell}>
                <Text style={styles.rowValue}>{row.value}</Text>
                {rowEditable(row.key) ? (
                  <Text
                    accessibilityRole="button"
                    onPress={() => onEdit(row.key)}
                    style={styles.rowEdit}
                  >
                    {editLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ))}

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>
    </View>
  );
}

function rowEditable(key: SummaryRow["key"]): boolean {
  return key === "trees" || key === "type" || key === "area_per_tree" || key === "payment" || key === "down" || key === "duration";
}

/* -------------------------------------------------------------------- icons */

/** src/components/site/growth-icon.tsx, path for path, on its own 32px grid. */
function GrowthIcon({ code, picked }: { code: string | null; picked: boolean }) {
  const colourOf = picked ? colour.surface : colour.leaf;
  const s = {
    stroke: colourOf,
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg viewBox="0 0 32 32" width={32} height={32} fill="none">
      {code === "bare_land" ? (
        <>
          <Path d="M4 25h24M8 29h16" {...s} />
          <Path d="M16 25v-5" {...s} />
          <Path d="M16 20c0-3 2-5 5-5 0 3-2 5-5 5z" {...s} />
        </>
      ) : code === "young_olive" ? (
        <>
          <Path d="M4 28h24" {...s} />
          <Path d="M16 28V13" {...s} />
          <Path d="M16 19c-4 0-6-2-6-5 4 0 6 2 6 5z" {...s} />
          <Path d="M16 15c0-3.5 2.5-5.5 6-5.5 0 3.5-2.5 5.5-6 5.5z" {...s} />
        </>
      ) : code === "near_production" ? (
        <>
          <Path d="M4 29h24" {...s} />
          <Path d="M16 29v-8" {...s} />
          <Ellipse cx={16} cy={14} rx={8.5} ry={6.5} {...s} />
        </>
      ) : code === "productive" ? (
        <>
          <Path d="M4 29h24" {...s} />
          <Path d="M16 29v-8" {...s} />
          <Ellipse cx={16} cy={14} rx={8.5} ry={6.5} {...s} />
          <Circle cx={12.5} cy={14.5} r={1.5} fill={colourOf} />
          <Circle cx={17.5} cy={11.5} r={1.5} fill={colourOf} />
          <Circle cx={19} cy={16.5} r={1.5} fill={colourOf} />
        </>
      ) : (
        <>
          <Path d="M6 26C10 14 18 8 26 6c-2 8-8 16-20 20z" {...s} />
          <Path d="M6 26l9-9" {...s} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  // `px-4 py-4` on a phone, with the status bar's inset added to the top.
  page: { paddingHorizontal: frame.gutter },
  column: { width: "100%", maxWidth: frame.maxWidth, alignSelf: "center" },

  // `mb-3 flex items-center gap-2`
  bar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: space.tight,
    marginBottom: space.snug,
  },
  // `size-9 rounded-xl text-forest` — 36, a 12px corner, the hit area the whole square.
  barBack: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  // `min-w-0 flex-1 truncate font-display text-base font-bold text-forest` — Markazi 16, one line.
  barTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20 },
  // `flex-none text-[0.6875rem] text-muted`. No writingDirection: «2/5» reads left to right.
  barStep: { fontSize: 11, lineHeight: 14, color: colour.muted, flexShrink: 0 },

  // `mt-3 text-xl font-bold leading-tight text-forest` — the interface face, not Markazi. See the header.
  question: {
    ...type.label,
    marginTop: space.snug,
    ...sans(700),
    fontSize: 20,
    lineHeight: 25,
    color: colour.forest,
  },
  // `mt-1.5 text-[0.8125rem] leading-5 text-muted`
  subtitle: {
    ...type.caption,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
  },

  /* ---- the tiers ---- */
  // `grid grid-cols-4 gap-1.5` — four across, 6 apart, expressed as a wrap of quarter-width cells.
  tierGrid: { flexDirection: "row-reverse", flexWrap: "wrap", marginHorizontal: -3 },
  tierCell: { width: "25%", paddingHorizontal: 3, paddingBottom: 6 },
  // `min-h-14 flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center`
  tier: {
    minHeight: 56,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: space.tight,
    alignItems: "center",
    justifyContent: "center",
  },
  tierPlain: { borderColor: colour.lineStrong, backgroundColor: colour.surface },
  // `border-forest bg-leaf-soft shadow-[var(--shadow-raise)]` — this grid's own chosen state.
  tierPicked: { borderColor: colour.forest, backgroundColor: colour.leafSoft, ...shadow.raise },
  // `font-display text-[0.9375rem] font-bold leading-none text-forest`
  tierLabel: {
    ...type.cardTitle,
    fontSize: 15,
    lineHeight: 17,
    textAlign: "center",
    writingDirection: "rtl",
  },

  // `col-span-4 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3`
  customCard: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space.snug,
    rowGap: space.hair,
    minHeight: 56,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space.snug,
    paddingVertical: space.tight,
  },
  // `font-display text-base font-bold leading-tight text-forest`
  customLabel: { ...type.cardTitle, fontSize: 16, lineHeight: 20 },
  customField: {
    width: 112,
    height: 40,
    borderRadius: radius.control,
    borderWidth: 1.5,
    borderColor: colour.lineStrong,
    backgroundColor: colour.surface,
    justifyContent: "center",
  },
  customInput: {
    fontSize: 16,
    color: colour.ink,
    textAlign: "center",
    paddingHorizontal: space.tight,
    paddingVertical: 0,
    height: 40,
    fontVariant: ["tabular-nums"],
  },
  // `w-full text-[0.6875rem] leading-4`
  customHint: { ...type.caption, width: "100%", fontSize: 11, lineHeight: 16 },

  /* ---- the spacing classes ---- */
  spacingGrid: { flexDirection: "row-reverse", flexWrap: "wrap", marginHorizontal: -3 },
  spacingCell: { width: "33.3333%", paddingHorizontal: 3, paddingBottom: 6 },
  spacingCard: { alignItems: "flex-start", minHeight: 96, paddingEnd: 28 },
  // `text-[0.8125rem] font-semibold leading-tight text-ink`
  spacingName: { ...type.label, fontSize: 13, lineHeight: 16.25 },
  // `text-[0.6875rem] leading-tight text-muted tabular-nums`
  spacingSize: { ...type.caption, fontSize: 11, lineHeight: 13.75, writingDirection: "ltr", fontVariant: ["tabular-nums"] },
  // `mt-auto pt-0.5 font-display text-base font-bold text-forest tabular-nums`
  spacingArea: { ...type.cardTitle, fontSize: 16, lineHeight: 20, paddingTop: 2, writingDirection: "ltr", fontVariant: ["tabular-nums"] },

  /* ---- the scenario cards ---- */
  // `mt-1 text-sm leading-6 text-muted`
  scenarioNote: { ...type.caption, marginTop: space.hair, fontSize: 14, lineHeight: 24 },

  /* ---- the amount tiles ---- */
  tileGrid: { flexDirection: "row-reverse", flexWrap: "wrap", margin: -space.hair },
  // `text-lg font-semibold tabular-nums`
  tileLabel: {
    ...type.label,
    fontSize: 18,
    lineHeight: 22,
    textAlign: "center",
    width: "100%",
    writingDirection: "ltr",
    fontVariant: ["tabular-nums"],
  },

  /* ---- the figures card ---- */
  estimateCard: { ...estimate, marginTop: space.snug, overflow: "hidden" },
  // `border-b border-dashed border-gold/50 bg-gold-soft/70 px-4 py-3`
  estimateHead: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: space.tight,
    /*
     * `border-b border-dashed border-gold/50`, and this one is SOLID on purpose.
     *
     * React Native applies `borderStyle` only when every side has the same width, so a dashed border on one
     * edge renders solid anyway — on both platforms. Rather than ship a style that lies about what it draws,
     * the rule is a solid gold hairline and the DASHED signal is carried where it works: the card's own
     * uniform 1.5px edge, which is the thing that says «this is an estimate» in the first place.
     */
    borderBottomWidth: 1,
    borderBottomColor: "rgba(168,124,34,0.5)",
    backgroundColor: "rgba(244,232,201,0.7)",
    paddingHorizontal: space.cozy,
    paddingVertical: space.snug,
  },
  // `text-xs font-semibold leading-5 text-forest`
  estimateNote: {
    ...type.caption,
    flex: 1,
    ...sans(600),
    fontSize: 12,
    lineHeight: 20,
    color: colour.forest,
  },
  estimateBody: { padding: space.cozy },
  // `.stat border-b border-dashed border-gold/40 pb-4`
  lead: {
    gap: 6,
    paddingBottom: space.cozy,
    // Solid, for the reason given on `estimateHead`.
    borderBottomWidth: 1,
    borderBottomColor: "rgba(168,124,34,0.4)",
    marginBottom: space.hair,
  },
  // A `dl` row: `flex items-baseline justify-between gap-6 py-3`
  row: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.roomy,
    paddingVertical: space.snug,
  },
  rowLabel: { ...type.caption, fontSize: 14, lineHeight: 22, color: colour.muted },
  rowValueCell: { alignItems: "flex-start", flexShrink: 0 },
  // `type.label` is already the semibold face; the weight is not asked for twice.
  rowValue: { ...type.label, writingDirection: "ltr", fontVariant: ["tabular-nums"] },
  // «تبديل» — `text-caption font-semibold text-forest underline`
  rowEdit: {
    ...type.caption,
    ...sans(600),
    marginTop: 2,
    color: colour.forest,
    textDecorationLine: "underline",
  },
  rowNote: { ...type.caption, fontSize: 12, lineHeight: 20 },
  // `mt-3 rounded-xl bg-leaf-soft px-3 py-2 text-sm leading-6 text-forest`
  notice: {
    ...type.caption,
    marginTop: space.snug,
    borderRadius: radius.control,
    backgroundColor: colour.leafSoft,
    paddingHorizontal: space.snug,
    paddingVertical: space.tight,
    fontSize: 14,
    lineHeight: 24,
    color: colour.forest,
  },

  /* ---- what is real ---- */
  // `.panel p-5`
  panel: { ...panel, marginTop: space.snug, padding: space.card },
  gapHint: { ...type.caption, marginTop: space.tight, fontSize: 14, lineHeight: 24 },
  secure: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 6,
    marginTop: space.snug,
  },
  secureText: { ...type.caption, flex: 1, fontSize: 12, lineHeight: 20 },

  /* ---- the running line ---- */
  // `mt-3 flex items-baseline justify-between gap-3 rounded-xl border border-dashed border-gold/50
  //  bg-gold-soft/60 px-3 py-2`
  runningLine: {
    flexDirection: "row-reverse",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.snug,
    marginTop: space.snug,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(168,124,34,0.5)",
    backgroundColor: "rgba(244,232,201,0.6)",
    paddingHorizontal: space.snug,
    paddingVertical: space.tight,
  },
  // `text-[0.6875rem] leading-tight text-forest/80`
  runningLabel: { ...type.caption, flexShrink: 1, fontSize: 11, lineHeight: 14, color: "rgba(31,74,44,0.8)" },
  // `font-display text-base font-bold leading-none tabular-nums text-forest`
  runningValue: { ...type.barFigure, fontSize: 16, lineHeight: 16 },

  /* ---- the pinned bar ---- */
  pinned: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // `bg-paper/95 backdrop-blur` — opaque paper rather than a BlurView: at 95 % the blur behind it is a few
    // pixels of noise, and a BlurView here is a dependency plus an Android approximation for nothing.
    backgroundColor: colour.paper,
  },
  pinnedInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: space.snug,
    paddingHorizontal: frame.gutter,
    paddingVertical: space.snug,
  },
});

