"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { Bi } from "@/components/site/bilingual";
import { GrowthIcon } from "@/components/site/growth-icon";
import { OliveMark, TreeCardBody, treeCardClass } from "@/components/site/tree-card";
import { toWesternDigits } from "@/lib/digits";
import { formatArea, formatCount, formatSpacing } from "@/lib/format";
import type { PaymentMode, SpacingClass, TreeQuote } from "@/lib/tree-pricing";

import { quoteStart } from "./actions";
import {
  calculatorGap,
  calculatorQuery,
  calculatorSummary,
  type CalculatorChoices,
  type Line,
  type SummaryCopy,
  type SummaryRowKey,
} from "./calculator-summary";

type TreeOption = {
  id: string;
  code: string | null;
  label_ar: string;
  label_fr: string | null;
  min_number: number | null;
  max_number: number | null;
};
type Scenario = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string | null;
  description_ar: string | null;
  description_fr: string | null;
  is_any: boolean;
  icon_code: string | null;
  image_url: string | null;
  image_alt_ar: string | null;
  image_alt_fr: string | null;
};
type ChoiceOption = { id: string; label_ar: string; label_fr: string | null };

/** `start.tier_taglines`: one line per tree_count code, plus "custom" for the free-number card. */
export type Tagline = { ar: string; fr?: string };
export type Taglines = Record<string, Tagline>;
/** `start.values`: the reassurance strip under the chooser. */
export type ValueIconKey = "people" | "leaf" | "hand" | "chart";
export type ValueItem = { icon: ValueIconKey; ar: string; fr?: string };

/** Every text on the page, resolved from `settings` on the server (MIL-02, PRN-02). */
export type StartCopy = SummaryCopy & {
  title: string;
  titleFr: string;
  subtitle: string;
  subtitleFr: string;
  styleQuestion: string;
  styleQuestionFr: string;
  summaryTitle: string;
  summaryTitleFr: string;
  continue: string;
  continueFr: string;
  continueHint: string;
  continueHintFr: string;
  continueHintPayment: string;
  continueHintPaymentFr: string;
  continueHintInstallments: string;
  continueHintInstallmentsFr: string;
  secureNote: string;
  secureNoteFr: string;
  customLabel: string;
  customLabelFr: string;
  customPlaceholder: string;
  customPlaceholderFr: string;
  /** Contains `{min}` and `{max}`. */
  customHint: string;
  customHintFr: string;
  spacingTitle: string;
  spacingTitleFr: string;
  spacingHint: string;
  spacingHintFr: string;
  spacingAny: string;
  spacingAnyFr: string;
  paymentTitle: string;
  paymentTitleFr: string;
  downPercentTitle: string;
  downPercentTitleFr: string;
  downPercentHint: string;
  downPercentHintFr: string;
  estimateNote: string;
  estimateNoteFr: string;
};

export type StartChooserProps = {
  treeCounts: TreeOption[];
  /** Offer types (ownership scenarios): one optional question (Q-6). */
  scenarios: Scenario[];
  /** Back Office spacing classes (docs/tree-area-and-cost.md); the question hides while there are none. */
  spacingClasses: SpacingClass[];
  /** Q-1: the down payment as a percentage of the cash total. */
  downPercents: ChoiceOption[];
  /** Report v3 §8: payment durations; the visitor never picks a monthly amount (§6). */
  durations: ChoiceOption[];
  copy: StartCopy;
  taglines: Taglines;
  values: ValueItem[];
  customMin: number;
  customMax: number;
  /** Answers already in the URL: a home card, or «بدّل اختياراتك» on /register. */
  initial: CalculatorChoices;
  /** `visit=1` travels on to /register. */
  wantsVisit: boolean;
  /** Server-rendered nodes (next/image, breadcrumb links) kept out of the client bundle. */
  breadcrumb: ReactNode;
  photo: ReactNode;
};

const QUOTE_DEBOUNCE_MS = 250;
/** Long enough to see the card tick, short enough not to feel like waiting (owner: one question, then the next). */
const ADVANCE_MS = 220;

/** One question per screen, in this order; the ones without data or without installments drop out. */
type StepKey = "trees" | "spacing" | "type" | "payment" | "down" | "duration" | "summary";

/** Rows read out in the status announcement; the rest stay visual so it remains short. */
const ANNOUNCED: Partial<Record<SummaryRowKey, "value" | "labelled">> = {
  trees: "value",
  area_per_tree: "labelled",
  type: "value",
  total_price: "labelled",
  payment: "value",
  down: "value",
  duration: "value",
  monthly: "labelled",
};

/** §8: a card shows its picture, or its drawing when the Back Office has not uploaded one. */
function ScenarioVisual({ scenario, framed }: { scenario: Scenario; framed: boolean }) {
  // A thumbnail beside the text on a phone, a banner above it once the cards sit two per row.
  const box = "size-20 flex-none rounded-xl sm:aspect-video sm:h-auto sm:w-full";
  if (scenario.image_url) {
    const alt = [scenario.image_alt_ar, scenario.image_alt_fr].filter(Boolean).join(" · ");
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the address is set in the Back Office, its host is not known at build time
      <img src={scenario.image_url} alt={alt} loading="lazy" decoding="async" className={`${box} object-cover`} />
    );
  }
  if (framed) {
    // Keeps the rows aligned when only some cards have a picture.
    return (
      <span className={`${box} grid place-items-center bg-paper`}>
        <GrowthIcon code={scenario.icon_code} className="size-10 text-leaf" />
      </span>
    );
  }
  return <GrowthIcon code={scenario.icon_code} className="size-8 flex-none text-leaf" />;
}

function fillLimits(text: string, min: number, max: number): string {
  return text.replace(/\{min\}/g, formatCount(min)).replace(/\{max\}/g, formatCount(max));
}

/**
 * The calculator (MIL-01, P2-6): tree count, area per tree, offer type, then cash or installments with a
 * down payment percentage and a duration. Owner, 2026-09-16: one question per screen, and answering it carries
 * the visitor to the next one; the figures wait on the last screen. The answers continue to /register in the
 * URL, so nothing is asked twice. Choices come from the Back Office lists (LEAD-01); areas and prices come
 * from the database quote.
 */
export function StartChooser({
  treeCounts,
  scenarios,
  spacingClasses,
  downPercents,
  durations,
  copy,
  taglines,
  values,
  customMin,
  customMax,
  initial,
  wantsVisit,
  breadcrumb,
  photo,
}: StartChooserProps) {
  const [treeId, setTreeId] = useState<string | null>(initial.treeId);
  const [custom, setCustom] = useState(initial.treesCustom !== null ? String(initial.treesCustom) : "");
  const [spacingId, setSpacingId] = useState<string | null>(initial.spacingId);
  const [spacingAnswered, setSpacingAnswered] = useState(initial.spacingId !== null);
  const [scenarioId, setScenarioId] = useState<string | null>(initial.scenarioId);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(initial.paymentMode);
  const [downId, setDownId] = useState<string | null>(initial.downPercentId);
  const [durationId, setDurationId] = useState<string | null>(initial.durationId);
  const [quote, setQuote] = useState<TreeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteSeq = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  const groupId = useId();
  const customInputId = `${groupId}-custom`;
  const spacingHintId = `${groupId}-spacing-hint`;
  const continueHintId = `${groupId}-continue-hint`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customNumber = custom === "" ? null : Number(custom);
  const customValid =
    customNumber !== null && Number.isInteger(customNumber) && customNumber >= customMin && customNumber <= customMax;
  const customSelected = treeId === null && customValid;
  const customInvalid = custom !== "" && !customValid;

  const chosenTree = treeId ? treeCounts.find((option) => option.id === treeId) : undefined;
  const chosenScenario = scenarioId ? scenarios.find((option) => option.id === scenarioId) : undefined;
  const withPictures = scenarios.some((option) => Boolean(option.image_url));
  const chosenSpacing = spacingId ? spacingClasses.find((option) => option.id === spacingId) : undefined;
  const chosenDown = downId ? downPercents.find((option) => option.id === downId) : undefined;
  const chosenDuration = durationId ? durations.find((option) => option.id === durationId) : undefined;
  const hasTrees = Boolean(chosenTree) || customSelected;
  const installments = paymentMode === "installments";

  // Only the questions this site actually asks: an empty Back Office list removes its screen.
  const steps = useMemo<StepKey[]>(() => {
    const list: StepKey[] = ["trees"];
    if (spacingClasses.length > 0) list.push("spacing");
    if (scenarios.length > 0) list.push("type");
    list.push("payment");
    if (installments && downPercents.length > 0) list.push("down");
    if (installments && durations.length > 0) list.push("duration");
    list.push("summary");
    return list;
  }, [spacingClasses.length, scenarios.length, installments, downPercents.length, durations.length]);

  // Coming back from /register with every answer in the URL lands on the figures, not on question one.
  const [step, setStep] = useState<StepKey>(() => {
    const answered = calculatorGap(
      {
        treeId: initial.treeId,
        treesCustom: initial.treesCustom,
        scenarioId: initial.scenarioId,
        spacingId: initial.spacingId,
        paymentMode: initial.paymentMode,
        downPercentId: initial.downPercentId,
        durationId: initial.durationId,
      },
      { downPercents: downPercents.length, durations: durations.length },
    );
    if (answered === null) return "summary";
    if (initial.treeId === null && initial.treesCustom === null) return "trees";
    if (initial.paymentMode === null) return spacingClasses.length > 0 && initial.spacingId === null ? "spacing" : "payment";
    return answered === "duration_required" ? "duration" : "down";
  });

  // Switching back to cash removes the two installment screens, so a screen that no longer exists reads as the summary.
  const activeStep: StepKey = steps.includes(step) ? step : "summary";
  const index = Math.max(steps.indexOf(activeStep), 0);
  const isSummary = activeStep === "summary";

  // An answer can add screens: choosing installments brings its own two questions. The move therefore reads the
  // list as it is when it happens, not as it was while the question was on screen.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  const go = useCallback((next: StepKey) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setStep(next);
  }, []);

  /** Answering carries the visitor on; the pause lets the chosen card show its tick first. */
  const advance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setStep((current) => {
        const list = stepsRef.current;
        const position = list.indexOf(list.includes(current) ? current : "summary");
        return position >= 0 && position + 1 < list.length ? list[position + 1] : current;
      });
    }, ADVANCE_MS);
  }, []);

  useEffect(() => () => (advanceTimer.current ? clearTimeout(advanceTimer.current) : undefined), []);

  const goBack = () => go(steps[Math.max(index - 1, 0)]);

  const pickTier = (id: string) => {
    setTreeId(id);
    setCustom("");
    advance();
  };

  const typeCustom = (raw: string) => {
    const digits = toWesternDigits(raw).replace(/\D/g, "");
    setCustom(digits);
    if (digits !== "") setTreeId(null);
  };

  const pickSpacing = (id: string | null) => {
    setSpacingId(id);
    setSpacingAnswered(true);
    if (id === null) setQuote(null);
    advance();
  };

  const pickPayment = (mode: PaymentMode) => {
    setPaymentMode(mode);
    // Cash skips the two installment questions; the step list above rebuilds before the move.
    advance();
  };

  // «اقترحولي» has no lower bound, so the quote then carries per-tree figures only.
  const quoteTrees = chosenTree ? chosenTree.min_number : customSelected ? customNumber : null;
  const quoteDown = installments ? downId : null;
  const quoteDuration = installments ? durationId : null;

  useEffect(() => {
    const seq = ++quoteSeq.current;
    if (!spacingId) return;
    const timer = setTimeout(() => {
      setQuoting(true);
      quoteStart({
        spacingClassId: spacingId,
        trees: quoteTrees,
        paymentMode,
        downPercentOptionId: quoteDown,
        durationOptionId: quoteDuration,
      })
        .catch(() => null)
        .then((result) => {
          // Server Actions run one after another; only the answer to the latest choice may land.
          if (seq !== quoteSeq.current) return;
          setQuote(result);
          setQuoting(false);
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [spacingId, quoteTrees, paymentMode, quoteDown, quoteDuration]);

  // Only what was actually chosen travels; /register checks each id against the same lists.
  const choices: CalculatorChoices = {
    treeId: chosenTree?.id ?? null,
    treesCustom: customSelected ? customNumber : null,
    scenarioId: chosenScenario?.id ?? null,
    spacingId: chosenSpacing?.id ?? null,
    paymentMode,
    downPercentId: chosenDown?.id ?? null,
    durationId: chosenDuration?.id ?? null,
  };
  // /register cannot ask these again, so the button waits until the database would accept the answers.
  const gap = calculatorGap(choices, { downPercents: downPercents.length, durations: durations.length });
  const query = calculatorQuery(choices, wantsVisit);
  const href = `/register?${query}`;
  const gapHint: Line | null =
    gap === "invalid_payment_mode"
      ? { ar: copy.continueHintPayment, fr: copy.continueHintPaymentFr || null }
      : gap === "down_payment_percent_required" || gap === "duration_required"
        ? { ar: copy.continueHintInstallments, fr: copy.continueHintInstallmentsFr || null }
        : null;

  // A reload, a shared link or the browser's back button keep the answers: they live in the address.
  useEffect(() => {
    window.history.replaceState(null, "", query ? `/start?${query}` : "/start");
  }, [query, activeStep]);

  // Each screen is a new question: bring the visitor to its title.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

  const customHintAr = fillLimits(copy.customHint, customMin, customMax);
  const customHintFr = fillLimits(copy.customHintFr, customMin, customMax);
  const customPlaceholder = copy.customPlaceholderFr
    ? `${copy.customPlaceholder} · ${copy.customPlaceholderFr}`
    : copy.customPlaceholder;

  const paymentOptions: ChoiceOption[] = [
    { id: "cash", label_ar: copy.paymentCash, label_fr: copy.paymentCashFr || null },
    { id: "installments", label_ar: copy.paymentInstallments, label_fr: copy.paymentInstallmentsFr || null },
  ];

  // Figures stay on screen while a newer quote loads, dimmed, so the card does not jump.
  const shownQuote = spacingId ? quote : null;
  const busy = quoting && spacingId !== null;
  const summary = calculatorSummary({
    copy,
    tree: chosenTree ?? null,
    treesCustom: choices.treesCustom,
    scenario: chosenScenario ?? null,
    withSpacing: spacingClasses.length > 0,
    areaPerTreeM2: chosenSpacing?.area_m2 ?? null,
    paymentMode,
    downPercent: chosenDown ?? null,
    duration: chosenDuration ?? null,
    quote: shownQuote,
  });

  // Read the summary out once the visitor reaches it, not on every question.
  const summaryText = [
    ...summary.rows.map((row) => {
      const mode = ANNOUNCED[row.key];
      if (!mode || !row.value) return null;
      return mode === "labelled" ? `${row.label.ar}: ${row.value.ar}` : row.value.ar;
    }),
    summary.notice?.ar,
  ]
    .filter(Boolean)
    .join("، ");
  useEffect(() => {
    if (!isSummary) return;
    const timer = setTimeout(() => setAnnouncement(summaryText ? `${copy.summaryTitle}: ${summaryText}` : ""), 900);
    return () => clearTimeout(timer);
  }, [summaryText, copy.summaryTitle, isSummary]);

  // The answers so far, each one a way back to its question.
  const trail: { key: StepKey; value: Line }[] = [];
  const treesLine = summary.rows.find((row) => row.key === "trees")?.value ?? null;
  if (treesLine) trail.push({ key: "trees", value: treesLine });
  if (chosenSpacing) {
    trail.push({
      key: "spacing",
      value: { ar: formatArea(chosenSpacing.area_m2), fr: formatArea(chosenSpacing.area_m2, "m²") },
    });
  } else if (spacingAnswered && spacingClasses.length > 0) {
    trail.push({ key: "spacing", value: { ar: copy.spacingAny, fr: copy.spacingAnyFr || null } });
  }
  if (chosenScenario) trail.push({ key: "type", value: { ar: chosenScenario.label_ar, fr: chosenScenario.label_fr } });
  if (paymentMode) {
    const option = paymentOptions.find((item) => item.id === paymentMode);
    if (option) trail.push({ key: "payment", value: { ar: option.label_ar, fr: option.label_fr } });
  }
  if (installments && chosenDown) trail.push({ key: "down", value: { ar: chosenDown.label_ar, fr: chosenDown.label_fr } });
  if (installments && chosenDuration) {
    trail.push({ key: "duration", value: { ar: chosenDuration.label_ar, fr: chosenDuration.label_fr } });
  }

  const questionTitle: Record<StepKey, Line> = {
    trees: { ar: copy.title, fr: copy.titleFr || null },
    spacing: { ar: copy.spacingTitle, fr: copy.spacingTitleFr || null },
    type: { ar: copy.styleQuestion, fr: copy.styleQuestionFr || null },
    payment: { ar: copy.paymentTitle, fr: copy.paymentTitleFr || null },
    down: { ar: copy.downPercentTitle, fr: copy.downPercentTitleFr || null },
    duration: { ar: copy.rowDuration, fr: copy.rowDurationFr || null },
    summary: { ar: copy.summaryTitle, fr: copy.summaryTitleFr || null },
  };

  return (
    <div className={`mx-auto px-4 py-8 sm:px-6 ${isSummary ? "max-w-6xl" : "max-w-3xl"}`}>
      <div className="mb-6">{breadcrumb}</div>

      <Progress step={index + 1} total={steps.length} />

      {trail.length > 0 && !isSummary ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {trail
            .filter((item) => item.key !== activeStep)
            .map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => go(item.key)}
                  className="choice min-h-9 w-auto px-3 py-1.5 text-sm font-semibold text-ink"
                >
                  <Bi ar={item.value.ar} fr={item.value.fr} frClassName="text-[0.8em] text-muted" />
                </button>
              </li>
            ))}
        </ul>
      ) : null}

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 font-display text-3xl font-bold text-balance text-forest outline-none sm:text-4xl"
      >
        <Bi ar={questionTitle[activeStep].ar} fr={questionTitle[activeStep].fr} frClassName="mt-1 text-[0.6em] text-muted" />
      </h1>

      {activeStep === "trees" && copy.subtitle ? (
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          <Bi ar={copy.subtitle} fr={copy.subtitleFr} frClassName="text-[0.85em] leading-6 opacity-85" />
        </p>
      ) : null}
      {activeStep === "spacing" && copy.spacingHint ? (
        <p id={spacingHintId} className="hint mt-2">
          <Bi ar={copy.spacingHint} fr={copy.spacingHintFr} frClassName="text-[0.9em] opacity-85" />
        </p>
      ) : null}
      {activeStep === "down" && copy.downPercentHint ? (
        <p className="hint mt-2">
          <Bi ar={copy.downPercentHint} fr={copy.downPercentHintFr} frClassName="text-[0.9em] opacity-85" />
        </p>
      ) : null}

      {/* A question with two chips is short: the screen keeps its height so answering does not leave an empty page. */}
      <div className={`mt-8 ${isSummary ? "" : "min-h-[52vh]"}`}>
        {/* 1 · The tiers, as the Back Office wrote them (LEAD-01), plus a free number. */}
        {activeStep === "trees" ? (
          <fieldset>
            <legend className="sr-only">{copy.title}</legend>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {treeCounts.map((option) => {
                const tagline = option.code ? taglines[option.code] : undefined;
                return (
                  <li key={option.id}>
                    <label className={treeCardClass(treeId === option.id, "light")}>
                      <input
                        type="radio"
                        name={`${groupId}-trees`}
                        value={option.id}
                        checked={treeId === option.id}
                        onChange={() => pickTier(option.id)}
                        className="sr-only"
                      />
                      <TreeCardBody
                        labelAr={option.label_ar}
                        labelFr={option.label_fr}
                        trees={option.min_number}
                        taglineAr={tagline?.ar}
                        taglineFr={tagline?.fr}
                        tone="light"
                      />
                    </label>
                  </li>
                );
              })}

              <li>
                {/* A typed number is not a click, so this card moves on with the button below. */}
                <label htmlFor={customInputId} id="custom" className={`${treeCardClass(customSelected, "light")} scroll-mt-24`}>
                  <OliveMark trees={customValid && customNumber !== null ? customNumber : 1} className="text-leaf" />
                  <span id={`${customInputId}-label`} className="font-display text-2xl font-bold leading-tight text-forest">
                    <Bi ar={copy.customLabel} fr={copy.customLabelFr} />
                  </span>
                  <input
                    id={customInputId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    dir="ltr"
                    maxLength={9}
                    value={custom}
                    onChange={(event) => typeCustom(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && customValid) {
                        event.preventDefault();
                        advance();
                      }
                    }}
                    placeholder={customPlaceholder}
                    aria-labelledby={`${customInputId}-label`}
                    aria-describedby={`${customInputId}-hint`}
                    aria-invalid={customInvalid || undefined}
                    className="field mt-3 text-center tabular-nums"
                  />
                  <span id={`${customInputId}-hint`} className={`block ${customInvalid ? "error-text" : "hint mt-1.5"}`}>
                    <Bi ar={customHintAr} fr={customHintFr} frClassName="text-[0.9em] opacity-85" />
                  </span>
                  {taglines.custom ? (
                    <>
                      <span aria-hidden="true" className="my-2 h-px w-10 bg-line-strong" />
                      <span className="text-sm leading-5 text-muted">
                        <Bi ar={taglines.custom.ar} fr={taglines.custom.fr} frClassName="text-[0.85em] opacity-80" />
                      </span>
                    </>
                  ) : null}
                </label>
              </li>
            </ul>
          </fieldset>
        ) : null}

        {/* 2 · The area that goes with each tree. */}
        {activeStep === "spacing" ? (
          <fieldset aria-describedby={copy.spacingHint ? spacingHintId : undefined}>
            <legend className="sr-only">{copy.spacingTitle}</legend>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {spacingClasses.map((option) => (
                <li key={option.id}>
                  <label className="choice h-full flex-col items-start justify-start gap-1">
                    <input
                      type="radio"
                      name={`${groupId}-spacing`}
                      value={option.id}
                      checked={spacingId === option.id}
                      onChange={() => pickSpacing(option.id)}
                      className="sr-only"
                    />
                    <span className="block font-semibold leading-snug text-ink">
                      <Bi ar={option.label_ar} fr={option.label_fr} frClassName="text-[0.85em] text-muted" />
                    </span>
                    <span className="block text-sm text-muted tabular-nums">
                      <Bi
                        ar={formatSpacing(option.row_spacing_m, option.tree_spacing_m)}
                        fr={formatSpacing(option.row_spacing_m, option.tree_spacing_m, "m")}
                        frClassName="text-[0.95em] opacity-85"
                      />
                    </span>
                    <span className="mt-auto block pt-1 font-display text-xl font-bold text-forest tabular-nums">
                      <Bi ar={formatArea(option.area_m2)} fr={formatArea(option.area_m2, "m²")} frClassName="text-[0.7em] text-muted" />
                    </span>
                  </label>
                </li>
              ))}
              <li>
                <label className="choice h-full justify-center text-center">
                  <input
                    type="radio"
                    name={`${groupId}-spacing`}
                    value=""
                    checked={spacingAnswered && spacingId === null}
                    onChange={() => pickSpacing(null)}
                    className="sr-only"
                  />
                  <span className="font-semibold text-ink">
                    <Bi ar={copy.spacingAny} fr={copy.spacingAnyFr} frClassName="text-[0.85em] text-muted" />
                  </span>
                </label>
              </li>
            </ul>
          </fieldset>
        ) : null}

        {/* 3 · The offer type, optional (Q-6): «اقترحولي الأنسب» is one of the cards. */}
        {activeStep === "type" ? (
          <fieldset>
            <legend className="sr-only">{copy.styleQuestion}</legend>
            <ul className="grid gap-3 sm:grid-cols-2">
              {scenarios.map((option) => (
                <li key={option.id}>
                  <label className={`choice h-full items-start ${withPictures ? "sm:flex-col sm:items-stretch" : ""}`}>
                    <input
                      type="radio"
                      name={`${groupId}-scenario`}
                      value={option.id}
                      checked={scenarioId === option.id}
                      onChange={() => {
                        setScenarioId(option.id);
                        advance();
                      }}
                      className="sr-only"
                    />
                    <ScenarioVisual scenario={option} framed={withPictures} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">
                        <Bi ar={option.label_ar} fr={option.label_fr} />
                      </span>
                      {option.description_ar ? (
                        <span className="mt-1 block text-sm leading-6 text-muted">
                          <Bi ar={option.description_ar} fr={option.description_fr} frClassName="text-[0.9em] opacity-85" />
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}

        {/* 4 · Cash or installments; installments add their own two screens (report v3 §12). */}
        {activeStep === "payment" ? (
          <ChoiceGrid
            name={`${groupId}-payment`}
            legend={copy.paymentTitle}
            options={paymentOptions}
            value={paymentMode}
            onChange={(id) => pickPayment(id === "cash" ? "cash" : "installments")}
            twoColumns
          />
        ) : null}

        {activeStep === "down" ? (
          <ChoiceGrid
            name={`${groupId}-down`}
            legend={copy.downPercentTitle}
            options={downPercents}
            value={downId}
            onChange={(id) => {
              setDownId(id);
              advance();
            }}
          />
        ) : null}

        {activeStep === "duration" ? (
          <ChoiceGrid
            name={`${groupId}-duration`}
            legend={copy.rowDuration}
            options={durations}
            value={durationId}
            onChange={(id) => {
              setDurationId(id);
              advance();
            }}
          />
        ) : null}

        {/* 5 · The figures, once every question is answered. */}
        {isSummary ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <p role="status" className="sr-only">
                {announcement}
              </p>
              {/* What the visitor picked, plus the areas and prices the database quoted for it (docs/tree-area-and-cost.md). */}
              <dl aria-busy={busy || undefined} className={`divide-y divide-line transition-opacity ${busy ? "opacity-60" : ""}`}>
                {summary.rows.map((row) => (
                  <SummaryItem key={row.key} label={row.label} value={row.value} notes={row.notes} onEdit={rowStep(row.key, steps) ? () => go(rowStep(row.key, steps) as StepKey) : undefined} />
                ))}
              </dl>

              {summary.notice?.ar ? (
                <p className="mt-3 rounded-xl bg-leaf-soft px-3 py-2 text-sm leading-6 text-forest">
                  <Bi ar={summary.notice.ar} fr={summary.notice.fr} frClassName="text-[0.9em] opacity-85" />
                </p>
              ) : null}
              {summary.priced && copy.estimateNote ? (
                <p className="mt-3 text-xs leading-5 text-muted">
                  <Bi ar={copy.estimateNote} fr={copy.estimateNoteFr} frClassName="text-[0.95em] opacity-85" />
                </p>
              ) : null}

              {gap === null ? (
                <Link href={href} className="btn mt-6 min-h-14 w-full bg-gold-bright text-lg text-forest-700 hover:bg-gold-soft">
                  <span>
                    <Bi ar={copy.continue} fr={copy.continueFr} frClassName="text-[0.7em] text-forest-700/80" />
                  </span>
                </Link>
              ) : (
                <>
                  <span
                    aria-disabled="true"
                    aria-describedby={gapHint?.ar ? continueHintId : undefined}
                    className="btn mt-6 min-h-14 w-full cursor-not-allowed bg-line text-lg text-muted"
                  >
                    <span>
                      <Bi ar={copy.continue} fr={copy.continueFr} frClassName="text-[0.7em] text-muted" />
                    </span>
                  </span>
                  {gapHint?.ar ? (
                    <p id={continueHintId} className="mt-2 text-sm leading-6 text-muted">
                      <Bi ar={gapHint.ar} fr={gapHint.fr} frClassName="text-[0.9em] opacity-85" />
                    </p>
                  ) : null}
                </>
              )}

              {copy.secureNote ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted">
                  <LockIcon />
                  <span>
                    <Bi ar={copy.secureNote} fr={copy.secureNoteFr} frClassName="text-[0.95em] opacity-85" />
                  </span>
                </p>
              ) : null}
            </section>

            <div className="hidden lg:block">{photo}</div>
          </div>
        ) : null}
      </div>

      {/* Back is always there; forward belongs to the answer itself, except for a typed number. On the last screen the
          bar holds nothing but «رجوع», and pinned to the bottom of a phone it swallowed the taps meant for
          «سجّل اهتمامك» underneath it, so there it scrolls with the page. */}
      <div
        className={`-mx-4 mt-8 flex gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 ${
          isSummary ? "" : "sticky bottom-0"
        }`}
      >
        {index > 0 ? (
          <button type="button" onClick={goBack} className="btn btn-secondary">
            رجوع
          </button>
        ) : null}
        {activeStep === "trees" ? (
          <button
            type="button"
            onClick={() => advance()}
            disabled={!hasTrees}
            className="btn btn-primary flex-1 sm:min-w-48 sm:flex-none"
          >
            التالي
          </button>
        ) : null}
      </div>

      {activeStep === "trees" && !hasTrees && copy.continueHint ? (
        <p className="mt-3 text-muted">
          <Bi ar={copy.continueHint} fr={copy.continueHintFr} frClassName="text-[0.85em] opacity-85" />
        </p>
      ) : null}

      {isSummary && values.length > 0 ? (
        <ul className="mt-12 grid gap-6 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((item, itemIndex) => (
            <li key={`${itemIndex}-${item.ar}`} className="flex items-start gap-3">
              <ValueIcon icon={item.icon} />
              <p className="text-sm leading-6 text-ink">
                <Bi ar={item.ar} fr={item.fr} frClassName="text-[0.9em] text-muted" />
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The screen that answers a summary row, when the visitor may still change it. */
function rowStep(key: SummaryRowKey, steps: StepKey[]): StepKey | null {
  const target: Partial<Record<SummaryRowKey, StepKey>> = {
    trees: "trees",
    type: "type",
    area_per_tree: "spacing",
    total_area: "spacing",
    payment: "payment",
    down: "down",
    duration: "duration",
  };
  const step = target[key];
  return step && steps.includes(step) ? step : null;
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted">
        الخطوة <span className="tabular-nums">{step}</span> من <span className="tabular-nums">{total}</span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label="التقدم في الحاسبة"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-leaf transition-[width] duration-300" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  notes,
  onEdit,
}: {
  label: Line;
  value: Line | null;
  notes: Line[];
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-muted">
        <Bi ar={label.ar} fr={label.fr} frClassName="text-[0.85em]" />
      </dt>
      {/* The French line is an LTR block, so "start" there is the same edge as "end" of the RTL cell. */}
      <dd className="text-end font-semibold text-ink tabular-nums">
        {value ? <Bi ar={value.ar} fr={value.fr} frClassName="text-[0.78em] text-start text-muted" /> : "—"}
        {notes.map((note) => (
          <span key={note.ar} className="mt-1 block text-xs font-normal text-muted">
            <Bi ar={note.ar} fr={note.fr} frClassName="text-[0.95em] text-start" />
          </span>
        ))}
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="mt-0.5 block w-full text-end text-xs font-semibold text-forest underline-offset-4 hover:underline"
          >
            تبديل
          </button>
        ) : null}
      </dd>
    </div>
  );
}

function ChoiceGrid({
  name,
  legend,
  options,
  value,
  onChange,
  twoColumns = false,
}: {
  name: string;
  legend: string;
  options: ChoiceOption[];
  value: string | null;
  onChange: (id: string) => void;
  twoColumns?: boolean;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className={`grid gap-3 ${twoColumns ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {options.map((option) => (
          <label key={option.id} className="choice min-h-16 justify-center">
            <input
              type="radio"
              name={name}
              value={option.id}
              className="sr-only"
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="text-center">
              <span className="block text-lg font-semibold tabular-nums">
                <Bi ar={option.label_ar} fr={option.label_fr} frClassName="text-[0.7em] text-muted tabular-nums" />
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-3.5 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ValueIcon({ icon }: { icon: ValueIconKey }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "size-6 flex-none text-leaf",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (icon) {
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.5c2.8 0 5 2.2 5 5.5" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common}>
          <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6" />
          <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V13" />
          <path d="M17 13v-1.5a1.5 1.5 0 0 1 3 0V15c0 3.9-3.1 7-7 7h-1.2c-2.2 0-4.2-1.1-5.4-2.9L4 15a1.6 1.6 0 0 1 2.6-1.9L8 15" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M6 16l4.5-5 3 3L19 7" />
          <path d="M15 7h4v4" />
        </svg>
      );
    default:
      // "leaf", and any key the Back Office JSON might carry that this build does not know yet.
      return (
        <svg {...common}>
          <path d="M4 20C6 10 12 5 21 4c-1 9-6 15-16 16z" />
          <path d="M4 20l8-8" />
        </svg>
      );
  }
}
