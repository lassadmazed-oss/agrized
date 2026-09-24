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
  /** The phone bar: what this screen is, and where its way back goes. */
  screenTitle: string;
  homeLabel: string;
  /** What this page is, said on the page: «حاسبة تقديرية». Emptying `start.eyebrow` removes the badge. */
  eyebrow: string;
  eyebrowFr: string;
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
  paymentHint: string;
  paymentHintFr: string;
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

/**
 * How long the estimate card stays a placeholder when the last screen opens.
 *
 * The figures are usually already in hand by then — the quote is fetched from the spacing question onward —
 * so without this the card would arrive complete and the visitor would watch a price appear out of nothing
 * (owner, 2026-09-23). Long enough to read as «this is being worked out», short enough that nobody waits on
 * it; a quote still in flight simply holds the placeholder longer.
 */
const SUMMARY_FILL_MS = 900;

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
 * the visitor to the next one. Owner, 2026-09-18 («التسعيرة في نفس الصفحة»): the figures no longer wait for the
 * last screen — they sit beside the question and follow every answer. The answers continue to /register in the
 * URL, so nothing is asked twice. Choices come from the Back Office lists (LEAD-01); areas and prices come
 * from the database quote.
 *
 * Owner, 2026-09-18: «الـMain Form موش عرض … هذا مثال تقديري لمشروع يناسب اختياراتك، موش عرض عقاري نهائي».
 * Four things keep that true on screen: the page names itself a calculator in a badge beside the step counter
 * (`start.eyebrow`, added 2026-09-19 — until then the only word saying so was the note on the figures card,
 * while a step counter, a progress bar, «مشروعك المبدئي» and a register button all read as a purchase), the
 * estimate card carries the disclaimer at all times on the dashed .card-estimate surface (never elevated,
 * never the shape of real stock), every price is prefixed «ابتداءً من», and what is real — registering, and
 * the offers that actually exist — sits on its own raised .panel at the end.
 */
export function StartChooser({
  treeCounts,
  scenarios,
  spacingClasses,
  downPercents,
  durations,
  copy,
  taglines,
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
  // The last screen fills itself in once, on first arrival. Coming back to it after an edit keeps the
  // figures on screen and dims them, which is the behaviour a correction wants: nobody editing a number
  // wants to wait for the card to be rebuilt.
  const [summaryFilled, setSummaryFilled] = useState(false);
  const summarySince = useRef<number | null>(null);
  const groupId = useId();
  const customInputId = `${groupId}-custom`;
  const spacingHintId = `${groupId}-spacing-hint`;
  const continueHintId = `${groupId}-continue-hint`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while the visitor changes one answer from «مشروعك المبدئي», so the answer returns there. */
  const editingRef = useRef(false);

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
    editingRef.current = false;
    setStep(next);
  }, []);

  /**
   * «تبديل» on a row of the figures (owner, 2026-09-18: «if i want to change something i need to go pass
   * everything again»): that one answer carries the visitor straight back to the figures.
   */
  const goEdit = useCallback((next: StepKey) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    editingRef.current = true;
    setStep(next);
  }, []);

  /** Answering carries the visitor on; the pause lets the chosen card show its tick first. */
  const advance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      const editing = editingRef.current;
      editingRef.current = false;
      setStep((current) => {
        if (editing) return "summary";
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

  /**
   * Hold the last screen as a placeholder for a beat, then fill it.
   *
   * The wait is measured from the moment the screen opened, not from now, so a quote that took 700ms of it
   * only costs the remaining 200 — the visitor never pays for the same wait twice. A quote still in flight
   * is waited for outright: filling the card with figures that are about to be replaced is the jump this
   * exists to remove.
   *
   * `setState` happens in the timer, never in the body of the effect: a synchronous one here would render
   * the card twice on the way to showing nothing new.
   */
  useEffect(() => {
    if (!isSummary || summaryFilled) return;
    if (summarySince.current === null) summarySince.current = Date.now();
    if (quoting || (spacingId !== null && quote === null)) return;

    const waited = Date.now() - summarySince.current;
    const timer = setTimeout(() => setSummaryFilled(true), Math.max(0, SUMMARY_FILL_MS - waited));
    return () => clearTimeout(timer);
  }, [isSummary, summaryFilled, quoting, quote, spacingId]);

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

  // A reload, a shared link or the browser's back button keep the answers: they live in the address. The router's own
  // history state travels along: replacing it with null loses what the App Router keeps there, and the next click on a
  // link («سجّل اهتمامك») lands on a blank screen.
  useEffect(() => {
    window.history.replaceState(window.history.state, "", query ? `/start?${query}` : "/start");
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

  // The card carries the figures beside the questions, so it appears as soon as one answer fills a row; before
  // that the photo keeps the column rather than leaving an empty box next to question one.
  const showFigures = summary.rows.some((row) => row.value !== null) || summary.notice !== null;

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

  /**
   * The figure the card leads with, because a number is read before its name: the monthly instalment once the
   * visitor picked instalments, the total of the request otherwise. It is the quote's own row, moved to the head
   * of the card — and taken out of the list underneath, so the same amount is never printed twice.
   */
  const leadKey: SummaryRowKey | null = summary.rows.some((row) => row.key === "monthly" && row.value)
    ? "monthly"
    : summary.rows.some((row) => row.key === "total_price" && row.value)
      ? "total_price"
      : null;
  const leadRow = leadKey ? (summary.rows.find((row) => row.key === leadKey) ?? null) : null;
  const listRows = summary.rows.filter((row) => row.key !== leadKey);

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
    /* The screen is as tall as its questions, no taller (owner, 2026-09-23: «too much spacing
       unnecessary … so it doesn't feel empty»). It used to be pinned to a full viewport height, which on
       the short screens — four tiles, six tiles — left a third of the phone blank between the last answer
       and the button, and read as a page still loading something. The bar under it is `sticky`, so it
       still sits at the bottom of a screen that IS long enough to scroll. */
    // ONE SCREEN ON A DESKTOP, AND IT DOES NOT GROW (owner, 2026-09-24: «the /start form is too annoying, too
    // big — I want the one-page design, no scroll»). From `lg` the page is exactly the viewport minus the
    // header, laid out as a column: the heading and the step line are fixed furniture at the top, and the row
    // under them is the only part that can shrink. A step with eight tiles scrolls INSIDE its own column
    // instead of pushing the button off the bottom of the window, so the way forward is always where it was
    // on the last question. Below `lg` nothing changes: a phone scrolls, as a phone should.
    <div data-phone-screen=""
      className="mx-auto flex max-w-6xl flex-col px-4 py-4 sm:block sm:px-6 sm:py-6 lg:flex lg:h-[calc(100svh-4.5rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:py-5">
      <div className="mb-4 hidden md:block lg:hidden">{breadcrumb}</div>

      {/* THE PHONE'S OWN BAR (owner, 2026-09-22: «a full redesign, better saving space»). The screen opened
          with a site lockup, a breadcrumb, a badge, a step line and a progress rail — five stacked rows,
          about 150px, before the question. All five said one of two things: what this is, and how far in you
          are. So it is one row that says both, with the way back where a thumb expects it. */}
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <Link
          href="/"
          aria-label={copy.homeLabel || "الرئيسية"}
          className="flex size-9 flex-none items-center justify-center rounded-xl text-forest hover:bg-leaf-soft"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h16m0 0-6-6m6 6-6 6" />
          </svg>
        </Link>
        <span className="min-w-0 flex-1 truncate font-display text-base font-bold text-forest">
          {copy.screenTitle || "احسب مشروعك"}
        </span>
        <span className="flex-none text-[0.6875rem] text-muted">
          {index + 1}/{steps.length}
        </span>
      </div>

      {/* Owner, 2026-09-18: «الـMain Form موش عرض». The badge says what the screen is before the visitor answers
          anything: everything else here — a step counter, a bar, a summary titled «مشروعك المبدئي» — reads like
          a purchase being prepared, and the one word that said otherwise sat far down the figures card. */}
      {copy.eyebrow ? (
        <p className="pill mb-snug hidden bg-gold-soft text-forest ring-1 ring-gold/30 sm:inline-flex">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-bright" />
          <Bi ar={copy.eyebrow} fr={copy.eyebrowFr} frClassName="text-[0.9em] font-normal opacity-80" />
        </p>
      ) : null}
      <div className="lg:-mt-2">
        <Progress step={index + 1} total={steps.length} />
      </div>

      {/*
       * Two fixes on one line. The French twin of a heading is an LTR block: left to itself it lands against the
       * opposite edge of an RTL page, a line away from the Arabic it translates, so `text-end` inside that block
       * brings it back under the Arabic. And the heading takes focus on every step so a reader hears the new
       * question — but the site's `:focus-visible` rule is unlayered, no utility can silence it, and every answer
       * therefore drew a gold box around the title. An inline style wins. Nothing is lost: the heading is not a
       * control and is only ever focused in code.
       */}
      <h1 ref={headingRef} tabIndex={-1} style={{ outline: "none" }} className="mt-3 max-w-2xl text-xl font-bold leading-tight text-forest sm:section-title sm:mt-6 lg:mt-3 lg:text-[1.75rem]">
        <Bi ar={questionTitle[activeStep].ar} fr={questionTitle[activeStep].fr} frClassName="mt-0.5 text-end text-[0.62em] font-normal text-muted" />
      </h1>

      {activeStep === "trees" && copy.subtitle ? (
        <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-5 text-muted sm:mt-3 sm:text-lg sm:leading-8 lg:mt-1.5 lg:text-sm lg:leading-6">
          <Bi ar={copy.subtitle} fr={copy.subtitleFr} frClassName="hidden text-end text-[0.85em] leading-6 opacity-85 sm:block" />
        </p>
      ) : null}
      {activeStep === "spacing" && copy.spacingHint ? (
        <p id={spacingHintId} className="hint mt-2 max-w-xl">
          <Bi ar={copy.spacingHint} fr={copy.spacingHintFr} frClassName="hidden text-end text-[0.9em] opacity-85 sm:block" />
        </p>
      ) : null}
      {activeStep === "payment" && copy.paymentHint ? (
        <p className="hint mt-2 max-w-xl">
          <Bi ar={copy.paymentHint} fr={copy.paymentHintFr} frClassName="hidden text-end text-[0.9em] opacity-85 sm:block" />
        </p>
      ) : null}
      {activeStep === "down" && copy.downPercentHint ? (
        <p className="hint mt-2 max-w-xl">
          <Bi ar={copy.downPercentHint} fr={copy.downPercentHintFr} frClassName="hidden text-end text-[0.9em] opacity-85 sm:block" />
        </p>
      ) : null}

      {/* The question and the figures, side by side from `lg` up and stacked below it. Both columns start at the
          top of the row: centring the question against the card left a screen-deep gap between a two-chip
          question and its own title, and pushed the chips below the fold on a laptop. */}
      <div
        className={`mt-3 grid gap-4 sm:mt-roomy sm:gap-roomy lg:mt-4 lg:min-h-0 lg:flex-1 lg:items-start lg:gap-8 ${
          isSummary
            ? "lg:grid-cols-[20rem_minmax(0,1fr)]"
            : showFigures
              ? "lg:grid-cols-[minmax(0,1fr)_22rem]"
              : "lg:grid-cols-1"
        }`}
      >
        {/* On the last screen this column holds what happens next instead of a question. The figures are read
            first on a phone and keep their place beside it on a wide screen, so the order flips only there. */}
        <div
          // The answers scroll inside the frame rather than lengthening the page, and the last visible row
          // fades out instead of being sliced in half: a card cut by a hard edge reads as a rendering
          // fault, while a fade is the oldest way of saying «there is more here». The rail itself is
          // hidden (rail-none), so the column carries no grey furniture beside the choices.
          className={`rail-none lg:min-h-0 lg:max-h-full lg:overflow-y-auto lg:[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)] ${
            isSummary ? "order-2 lg:order-1" : ""
          }`}
        >
        {/* 1 · The tiers, as the Back Office wrote them (LEAD-01), plus a free number. */}
        {activeStep === "trees" ? (
          <fieldset>
            <legend className="sr-only">{copy.title}</legend>
            <ul
              data-answers
              className={`grid grid-cols-4 gap-1.5 sm:grid-cols-3 sm:gap-4 lg:gap-2.5 ${
                showFigures ? "lg:grid-cols-4" : "lg:grid-cols-5"
              }`}
            >
              {treeCounts.map((option) => {
                const tagline = option.code ? taglines[option.code] : undefined;
                const picked = treeId === option.id;
                return (
                  <li key={option.id}>
                    {/* The chosen card is filled and lifted, and carries the tick: on a grid of eight, a coloured
                        edge alone was not enough to find the one that is on. */}
                    <label className={`${treeCardClass(picked, "light")} relative ${picked ? "shadow-[var(--shadow-card)]" : ""}`}>
                      <input
                        type="radio"
                        name={`${groupId}-trees`}
                        value={option.id}
                        checked={picked}
                        onChange={() => pickTier(option.id)}
                        className="sr-only"
                      />
                      {picked ? <PickedMark /> : null}
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

              <li className="col-span-4 sm:col-span-1">
                {/* A typed number is not a click, so this card moves on with the button below. */}
                <label
                  htmlFor={customInputId}
                  id="custom"
                  className={`${treeCardClass(customSelected, "light")} relative scroll-mt-24 max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-1 max-sm:px-3 max-sm:text-start ${customSelected ? "shadow-[var(--shadow-card)]" : ""}`}
                >
                  {customSelected ? <PickedMark /> : null}
                  <span className="hidden sm:contents">
                    <OliveMark trees={customValid && customNumber !== null ? customNumber : 1} className="text-leaf" />
                  </span>
                  <span id={`${customInputId}-label`} className="font-display text-base font-bold leading-tight text-forest sm:text-2xl">
                    <Bi ar={copy.customLabel} fr={copy.customLabelFr} frClassName="hidden sm:block" />
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
                    className="field text-center tabular-nums max-sm:mt-0 max-sm:h-10 max-sm:w-28 sm:mt-3"
                  />
                  <span id={`${customInputId}-hint`} className={`block max-sm:w-full max-sm:text-[0.6875rem] max-sm:leading-4 ${customInvalid ? "error-text" : "hint mt-1.5"}`}>
                    <Bi ar={customHintAr} fr={customHintFr} frClassName="hidden text-[0.9em] opacity-85 sm:block" />
                  </span>
                  {taglines.custom ? (
                    <span className="hidden sm:contents">
                      <span aria-hidden="true" className="my-2 h-px w-10 bg-line-strong" />
                      <span className="text-sm leading-5 text-muted">
                        <Bi ar={taglines.custom.ar} fr={taglines.custom.fr} frClassName="text-[0.85em] opacity-80" />
                      </span>
                    </span>
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
            <ul data-answers className="grid grid-cols-3 gap-1.5 sm:gap-3">
              {spacingClasses.map((option) => (
                <li key={option.id}>
                  {/* pe-8 is unconditional so the tick never reflows the card when it appears. */}
                  <label className="choice relative h-full flex-col items-start justify-start gap-0.5 pe-7 sm:gap-1 sm:pe-8">
                    <input
                      type="radio"
                      name={`${groupId}-spacing`}
                      value={option.id}
                      checked={spacingId === option.id}
                      onChange={() => pickSpacing(option.id)}
                      className="sr-only"
                    />
                    {spacingId === option.id ? <PickedMark /> : null}
                    <span className="block text-[0.8125rem] font-semibold leading-tight text-ink sm:text-base sm:leading-snug">
                      <Bi ar={option.label_ar} fr={option.label_fr} frClassName="text-[0.85em] text-muted" />
                    </span>
                    <span className="block text-[0.6875rem] leading-tight text-muted tabular-nums sm:text-sm">
                      <Bi
                        ar={formatSpacing(option.row_spacing_m, option.tree_spacing_m)}
                        fr={formatSpacing(option.row_spacing_m, option.tree_spacing_m, "m")}
                        frClassName="text-[0.95em] opacity-85"
                      />
                    </span>
                    <span className="mt-auto block pt-0.5 font-display text-base font-bold text-forest tabular-nums sm:pt-1 sm:text-xl">
                      <Bi ar={formatArea(option.area_m2)} fr={formatArea(option.area_m2, "m²")} frClassName="text-[0.7em] text-muted" />
                    </span>
                  </label>
                </li>
              ))}
              <li>
                <label className="choice relative h-full justify-center px-7 text-center text-[0.8125rem] sm:px-8 sm:text-base">
                  <input
                    type="radio"
                    name={`${groupId}-spacing`}
                    value=""
                    checked={spacingAnswered && spacingId === null}
                    onChange={() => pickSpacing(null)}
                    className="sr-only"
                  />
                  {spacingAnswered && spacingId === null ? <PickedMark /> : null}
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
            <ul data-answers className="grid gap-2 sm:grid-cols-2 sm:gap-3">
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

        {/* 6 · What happens next. The simulation ends on a real surface — a solid, raised panel, the opposite of
            the dashed estimate beside it — carrying the two things that do exist: registering the request, and
            the offers actually on the ground. */}
        {isSummary ? (
          <section className="panel p-5 sm:p-6">
            {gap === null ? (
              <Link href={href} className="btn w-full bg-gold-bright text-lg text-forest-700 hover:bg-gold-soft">
                <span>
                  <Bi ar={copy.continue} fr={copy.continueFr} frClassName="text-[0.7em] text-forest-700/80" />
                </span>
              </Link>
            ) : (
              <>
                <span
                  aria-disabled="true"
                  aria-describedby={gapHint?.ar ? continueHintId : undefined}
                  className="btn w-full cursor-not-allowed bg-line text-lg text-muted"
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

            {/* Owner, 2026-09-23: this panel keeps the registration and the lock line, nothing else.
                «عروضنا الحالية» and its «شوف العروض» button used to sit under a rule here, and they turned
                the one thing this screen is for into a choice between two. The way to the catalogue is
                already in the header, on the home page and in the footer; it does not need a second door at
                the exact moment someone has finished a simulation and is about to register.

                The settings behind it are untouched — register.offers_title and site.cta_offers_label are
                still read by the landing page — so nothing the owner wrote has been deleted. */}
          </section>
        ) : null}

        </div>

        {/* 5 · The figures, beside the questions on every screen, following each answer. */}
        {showFigures ? (
          <aside className={`rail-none lg:min-h-0 lg:max-h-full ${isSummary ? "order-1 lg:overflow-y-auto lg:order-2" : "max-lg:hidden"}`}>
            {/* A simulation never wears the shape of stock: the warm dashed .card-estimate surface, no elevation,
                and the disclaimer stamped across the head of the card rather than left as a footnote at the
                bottom. The wording is `start.estimate_note` (MIL-02) — blanking that setting is still the only
                way to take it off. */}
            <section className="card card-estimate overflow-hidden">
              <p role="status" className="sr-only">
                {announcement}
              </p>

              {copy.estimateNote ? (
                <p className="flex items-start gap-2 border-b border-dashed border-gold/50 bg-gold-soft/70 px-4 py-3 text-xs font-semibold leading-5 text-forest sm:px-5">
                  <EstimateIcon />
                  <span>
                    <Bi ar={copy.estimateNote} fr={copy.estimateNoteFr} frClassName="hidden text-end text-[0.95em] font-normal opacity-80 sm:block" />
                  </span>
                </p>
              ) : null}

              {/* The card being worked out. It carries the same rows as the real one so the reveal changes
                  the content and not the shape, and it is `aria-hidden` with a spoken «…» beside it: a
                  screen reader should hear that figures are coming, not eleven empty rows. */}
              {isSummary && !summaryFilled ? (
                <div className="p-4 sm:p-5" aria-hidden>
                  <div className="border-b border-dashed border-gold/40 pb-4">
                    <span className="skeleton block h-9 w-2/5" />
                    <span className="skeleton mt-2 block h-4 w-1/4" />
                  </div>
                  <div className="divide-y divide-line">
                    {listRows.map((row) => (
                      <div key={row.key} className="flex items-center justify-between gap-6 py-3">
                        <span className="skeleton block h-3.5 w-1/3" />
                        <span className="skeleton block h-3.5 w-1/4" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* What the visitor picked, plus the areas and prices the database quoted for it (docs/tree-area-and-cost.md). */}
              <div
                data-answers
                hidden={isSummary && !summaryFilled}
                aria-busy={busy || undefined}
                className={`p-4 transition-opacity sm:p-5 ${busy ? "opacity-60" : ""} ${
                  isSummary && summaryFilled ? "rise" : ""
                }`}
              >
                {leadRow?.value ? (
                  <div className="stat border-b border-dashed border-gold/40 pb-4">
                    <span className="stat-figure">
                      <Bi
                        ar={leadRow.value.ar}
                        fr={leadRow.value.fr}
                        frClassName="mt-1 text-end text-[0.45em] font-normal leading-6 text-muted"
                      />
                    </span>
                    <span className="stat-label">
                      <Bi ar={leadRow.label.ar} fr={leadRow.label.fr} frClassName="text-end text-[0.95em]" />
                    </span>
                    {leadRow.notes.map((note) => (
                      <span key={note.ar} className="text-xs leading-5 text-muted">
                        <Bi ar={note.ar} fr={note.fr} frClassName="text-end text-[0.95em]" />
                      </span>
                    ))}
                  </div>
                ) : null}

                <dl className="divide-y divide-line">
                  {listRows.map((row) => {
                    // «تبديل» under a dash offers to change an answer that was never given; the row waits instead.
                    const target = row.value ? rowStep(row.key, steps) : null;
                    return (
                      <SummaryItem
                        key={row.key}
                        label={row.label}
                        value={row.value}
                        notes={row.notes}
                        onEdit={target ? () => goEdit(target) : undefined}
                      />
                    );
                  })}
                </dl>

                {summary.notice?.ar ? (
                  <p className="mt-3 rounded-xl bg-leaf-soft px-3 py-2 text-sm leading-6 text-forest">
                    <Bi ar={summary.notice.ar} fr={summary.notice.fr} frClassName="text-end text-[0.9em] opacity-85" />
                  </p>
                ) : null}
                {/* The card reports what the answers cost, and stops there: what to do about it is the panel
                    beside it, on a surface that is not an estimate. */}
              </div>
            </section>
          </aside>
        ) : (
          // No figures yet means no second column to stand in, so the decorative photograph is not drawn at
          // all: as a full-width row under the answers it was a 110px empty band, and it was what pushed the
          // second row of tiers out of the frame. It returns the moment the estimate does, beside the
          // question where it was designed to sit.
          null
        )}
      </div>

      {/* The running estimate, as a phone can afford it: one line, the figure that moves, above the way
          forward. The card it stands in for is `max-lg:hidden` during the questions — see the note there. */}
      {showFigures && !isSummary && leadRow?.value ? (
        <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl border border-dashed border-gold/50 bg-gold-soft/60 px-3 py-2 lg:hidden">
          <span className="text-[0.6875rem] leading-tight text-forest/80">{leadRow.label.ar}</span>
          <span className="font-display text-base font-bold leading-none tabular-nums text-forest">
            {leadRow.value.ar}
          </span>
        </div>
      ) : null}

      {/* The hint belongs above the bar: pinned, the bar covered it. */}
      {activeStep === "trees" && !hasTrees && copy.continueHint ? (
        <p className="mt-3 hidden max-w-xl text-[0.75rem] leading-5 text-muted sm:mt-6 sm:block sm:text-base sm:leading-7">
          <Bi ar={copy.continueHint} fr={copy.continueHintFr} frClassName="text-end text-[0.85em] opacity-85" />
        </p>
      ) : null}

      {/* Forward belongs to the answer itself, except for a typed number — so only the first screen keeps a bar
          pinned to the bottom of a phone. On every other screen it held «رجوع» alone, and a full-width pinned bar
          for one small button covered the figures underneath it; there it simply follows the page. */}
      <div
        className={`mt-5 flex gap-3 sm:mt-8 lg:mt-4 lg:flex-none lg:justify-end lg:gap-2 ${
          activeStep === "trees"
            ? "sticky bottom-[var(--tabbar-h)] -mx-4 mt-auto border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mt-8 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
            : ""
        }`}
      >
        {index > 0 ? (
          <button type="button" onClick={goBack} className="btn btn-secondary lg:btn-sm lg:px-5">
            رجوع
          </button>
        ) : null}
        {activeStep === "trees" ? (
          <button
            type="button"
            onClick={() => advance()}
            disabled={!hasTrees}
            className="btn btn-primary flex-1 sm:min-w-48 sm:flex-none lg:btn-sm lg:min-w-40 lg:px-6"
          >
            التالي
          </button>
        ) : null}
      </div>

      {/* Owner, 2026-09-23: the six slogans from start.values used to close the summary. They are the
          site's opening argument, and someone who has walked five steps of a simulation has already been
          convinced — repeating «زيتونتك هي مشروعك» to them only pushes the registration further down the
          screen and says nothing new.

          The setting itself stays. The landing hero falls back to start.values for its promise rows (see
          heroPromises), so emptying the key in the Back Office would blank the home page instead. */}
    </div>
  );
}

/**
 * The screen that answers a summary row, when the visitor may still change it. A question owns one «تبديل» and
 * no more: the total area is read from the same spacing screen as the area per tree, and repeating the link on
 * both rows put the same control twice on one card.
 */
function rowStep(key: SummaryRowKey, steps: StepKey[]): StepKey | null {
  const target: Partial<Record<SummaryRowKey, StepKey>> = {
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

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div>
      {/* The phone's bar already carries «1/5», so the sentence would be the same fact twice, one line
          apart. It keeps its place from md up, where there is no bar. */}
      <p className="hidden text-sm font-medium text-muted md:block">
        الخطوة <span className="tabular-nums">{step}</span> من <span className="tabular-nums">{total}</span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label="التقدم في الحاسبة"
        className="h-1.5 overflow-hidden rounded-full bg-line md:mt-2"
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
    // A long label and a long amount wrap onto two lines rather than push each other off a phone; `ms-auto`
    // keeps the value against the far edge whether it shares the line or takes its own.
    <div
      className={`group relative flex flex-wrap items-start justify-between gap-x-4 gap-y-0.5 py-1.5 sm:py-2.5 ${
        onEdit ? "hover:bg-gold-soft/50" : ""
      }`}
    >
      <dt className="min-w-0 text-[0.8125rem] text-muted sm:text-sm">
        <Bi ar={label.ar} fr={label.fr} frClassName="text-[0.85em]" />
      </dt>
      {/* The French line is an LTR block, so "start" there is the same edge as "end" of the RTL cell. */}
      <dd className="ms-auto min-w-0 text-end text-[0.875rem] font-semibold text-ink tabular-nums sm:text-base">
        {value ? <Bi ar={value.ar} fr={value.fr} frClassName="text-[0.78em] text-start text-muted" /> : "—"}
        {notes.map((note) => (
          <span key={note.ar} className="mt-1 block text-xs font-normal text-muted">
            <Bi ar={note.ar} fr={note.fr} frClassName="text-[0.95em] text-start" />
          </span>
        ))}
        {/* The row itself is the control. «تبديل» printed as a twelve-pixel word was a 16px tap target, and a
            3rem button stacked under each of a dozen rows would have doubled a card meant to stay dense; the
            button covers the whole row instead, and the word stays as its label. It sits inside the <dd> so the
            list keeps its dl > div > (dt, dd) shape. */}
        {onEdit ? (
          <>
            <span
              aria-hidden="true"
              className="ms-2 inline text-[0.6875rem] font-semibold text-forest underline-offset-4 group-hover:underline sm:mt-0.5 sm:block sm:text-xs"
            >
              تبديل
            </span>
            <button type="button" onClick={onEdit} className="absolute inset-0 rounded-lg">
              <span className="sr-only">تبديل</span>
            </button>
          </>
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
      {/* The chosen chip is filled, not outlined: on a row of five amounts a coloured edge reads as decoration.
          .choice is 3.25rem tall, so every one of them is still a tap target. */}
      <div
        data-answers
        className={`grid gap-2 sm:gap-3 ${twoColumns ? "grid-cols-2 sm:grid-cols-2" : "grid-cols-3 sm:grid-cols-3"}`}
      >
        {options.map((option) => {
          const picked = value === option.id;
          return (
            <label
              key={option.id}
              className={`choice justify-center text-center text-[0.8125rem] sm:text-base ${picked ? "shadow-[var(--shadow-card)]" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                className="sr-only"
                checked={picked}
                onChange={() => onChange(option.id)}
              />
              <span className="text-center">
                <span className="block text-lg font-semibold tabular-nums">
                  <Bi
                    ar={option.label_ar}
                    fr={option.label_fr}
                    frClassName={`text-[0.7em] tabular-nums ${picked ? "text-surface/80" : "text-muted"}`}
                  />
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The tick a chosen card carries, so a selection is read from the card itself and not only from its edge. */
function PickedMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-forest text-surface shadow-[var(--shadow-raise)]"
    >
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 13 4 4 10-10" />
      </svg>
    </span>
  );
}

/** «≈»: what the figures on this card are. */
function EstimateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-4.5 flex-none text-gold"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M7.6 10.4c1.1-1.3 2.2-1.3 3.3 0s2.2 1.3 3.3 0" />
      <path d="M7.6 14.4c1.1-1.3 2.2-1.3 3.3 0s2.2 1.3 3.3 0" />
    </svg>
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

