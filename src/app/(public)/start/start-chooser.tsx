"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
 * down payment percentage and a duration. The answers continue to /register in the URL, so nothing is asked
 * twice. Choices come from the Back Office lists (LEAD-01); areas and prices come from the database quote.
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
  const hasChoice = Boolean(chosenTree) || customSelected;
  const installments = paymentMode === "installments";

  const pickTier = (id: string) => {
    setTreeId(id);
    setCustom("");
  };

  const typeCustom = (raw: string) => {
    const digits = toWesternDigits(raw).replace(/\D/g, "");
    setCustom(digits);
    if (digits !== "") setTreeId(null);
  };

  const pickSpacing = (id: string | null) => {
    setSpacingId(id);
    if (id === null) setQuote(null);
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
  const href = `/register?${calculatorQuery(choices, wantsVisit)}`;
  const gapHint: Line | null =
    gap === "invalid_payment_mode"
      ? { ar: copy.continueHintPayment, fr: copy.continueHintPaymentFr || null }
      : gap === "down_payment_percent_required" || gap === "duration_required"
        ? { ar: copy.continueHintInstallments, fr: copy.continueHintInstallmentsFr || null }
        : null;

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

  // Read the summary out once the visitor pauses, not on every digit typed.
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
    const timer = setTimeout(() => setAnnouncement(summaryText ? `${copy.summaryTitle}: ${summaryText}` : ""), 900);
    return () => clearTimeout(timer);
  }, [summaryText, copy.summaryTitle]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">{breadcrumb}</div>

      <h1 className="font-display text-4xl font-bold text-balance text-forest sm:text-5xl">
        <Bi ar={copy.title} fr={copy.titleFr} frClassName="mt-1 text-[0.6em] text-muted" />
      </h1>
      {copy.subtitle ? (
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          <Bi ar={copy.subtitle} fr={copy.subtitleFr} frClassName="text-[0.85em] leading-6 opacity-85" />
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          {/* 1 · The tiers, as the Back Office wrote them (LEAD-01), plus a free number. */}
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
                {/* The whole card focuses the field; the title alone names it for assistive tech. */}
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

          {!hasChoice && copy.continueHint ? (
            <p className="mt-4 text-muted">
              <Bi ar={copy.continueHint} fr={copy.continueHintFr} frClassName="text-[0.85em] opacity-85" />
            </p>
          ) : null}

          {/* The rest only appears once the first question is answered, so the page never looks like a form.
              It stays while a typed number is being corrected, so earlier answers do not vanish mid-edit. */}
          {hasChoice || custom !== "" ? (
            <>
              {/* 2 · The area that goes with each tree. */}
              {spacingClasses.length > 0 ? (
                <fieldset className="mt-10" aria-describedby={copy.spacingHint ? spacingHintId : undefined}>
                  <legend className="font-display text-2xl font-bold text-forest">
                    <Bi ar={copy.spacingTitle} fr={copy.spacingTitleFr} />
                  </legend>
                  {copy.spacingHint ? (
                    <p id={spacingHintId} className="hint mt-1">
                      <Bi ar={copy.spacingHint} fr={copy.spacingHintFr} frClassName="text-[0.9em] opacity-85" />
                    </p>
                  ) : null}
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                          checked={spacingId === null}
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

              {/* 3 · The offer type, optional (Q-6). */}
              {scenarios.length > 0 ? (
                <fieldset className="mt-10">
                  <legend className="font-display text-2xl font-bold text-forest">
                    <Bi ar={copy.styleQuestion} fr={copy.styleQuestionFr} />
                  </legend>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {scenarios.map((option) => (
                      <li key={option.id}>
                        <label className={`choice h-full items-start ${withPictures ? "sm:flex-col sm:items-stretch" : ""}`}>
                          <input
                            type="radio"
                            name={`${groupId}-scenario`}
                            value={option.id}
                            checked={scenarioId === option.id}
                            onChange={() => setScenarioId(option.id)}
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

              {/* 4 · Cash or installments; installments add a down payment percentage and a duration (report v3 §12). */}
              <ChipGroup
                name={`${groupId}-payment`}
                title={{ ar: copy.paymentTitle, fr: copy.paymentTitleFr || null }}
                options={paymentOptions}
                value={paymentMode}
                onChange={(id) => setPaymentMode(id === "cash" ? "cash" : "installments")}
                prominent
                twoColumns
              />
              {installments && downPercents.length > 0 ? (
                <ChipGroup
                  name={`${groupId}-down`}
                  title={{ ar: copy.downPercentTitle, fr: copy.downPercentTitleFr || null }}
                  hint={{ ar: copy.downPercentHint, fr: copy.downPercentHintFr || null }}
                  options={downPercents}
                  value={downId}
                  onChange={setDownId}
                />
              ) : null}
              {installments && durations.length > 0 ? (
                <ChipGroup
                  name={`${groupId}-duration`}
                  title={{ ar: copy.rowDuration, fr: copy.rowDurationFr || null }}
                  options={durations}
                  value={durationId}
                  onChange={setDurationId}
                />
              ) : null}
            </>
          ) : null}
        </div>

        {/* 5 · The result follows the visitor down the page. */}
        <div className="space-y-4 lg:sticky lg:top-24">
          {/* Only where the photo and the summary both fit above the fold, so the button never hides below it. */}
          <div className="hidden [@media(min-width:64rem)_and_(min-height:64rem)]:block">{photo}</div>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold text-forest">
              <Bi ar={copy.summaryTitle} fr={copy.summaryTitleFr} />
            </h2>
            <p role="status" className="sr-only">
              {announcement}
            </p>
            {/* What the visitor picked, plus the areas and prices the database quoted for it (docs/tree-area-and-cost.md). */}
            <dl aria-busy={busy || undefined} className={`mt-3 divide-y divide-line transition-opacity ${busy ? "opacity-60" : ""}`}>
              {summary.rows.map((row) => (
                <SummaryItem key={row.key} label={row.label} value={row.value} notes={row.notes} />
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
        </div>
      </div>

      {values.length > 0 ? (
        <ul className="mt-12 grid gap-6 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((item, index) => (
            <li key={`${index}-${item.ar}`} className="flex items-start gap-3">
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

function SummaryItem({ label, value, notes }: { label: Line; value: Line | null; notes: Line[] }) {
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
      </dd>
    </div>
  );
}

function ChipGroup({
  name,
  title,
  hint,
  options,
  value,
  onChange,
  prominent = false,
  twoColumns = false,
}: {
  name: string;
  title: Line;
  hint?: Line;
  options: ChoiceOption[];
  value: string | null;
  onChange: (id: string) => void;
  /** A main question of the page rather than a follow-up of the one above. */
  prominent?: boolean;
  twoColumns?: boolean;
}) {
  const hintId = `${name}-hint`;
  return (
    <fieldset className={prominent ? "mt-10" : "mt-5"} aria-describedby={hint?.ar ? hintId : undefined}>
      <legend className={prominent ? "font-display text-2xl font-bold text-forest" : "label"}>
        <Bi ar={title.ar} fr={title.fr} frClassName={prominent ? undefined : "text-[0.85em] text-muted"} />
      </legend>
      {hint?.ar ? (
        <p id={hintId} className="hint mt-1 mb-2">
          <Bi ar={hint.ar} fr={hint.fr} frClassName="text-[0.9em] opacity-85" />
        </p>
      ) : null}
      <div className={`grid grid-cols-2 gap-2 ${prominent ? "mt-4" : ""} ${twoColumns ? "" : "sm:grid-cols-3"}`}>
        {options.map((option) => (
          <label key={option.id} className="choice justify-center">
            <input
              type="radio"
              name={name}
              value={option.id}
              className="sr-only"
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="text-center">
              <span className="block font-semibold tabular-nums">
                <Bi ar={option.label_ar} fr={option.label_fr} frClassName="text-[0.78em] text-muted tabular-nums" />
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
