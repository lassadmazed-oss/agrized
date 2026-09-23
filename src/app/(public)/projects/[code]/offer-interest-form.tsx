"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { readVisitSource } from "@/components/site/source-capture";
import { DataRow, FormField } from "@/components/ui";
import { toWesternDigits } from "@/lib/digits";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";
import type { ProjectQuote } from "@/lib/public-projects";
import type { PaymentMode } from "@/lib/tree-pricing";

import { quoteOffer, submitOfferInterest } from "./offer-actions";

type Option = { id: string; code: string | null; label_ar: string };
type ContactChannel = "phone" | "whatsapp" | "both";

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "مكالمة",
  whatsapp: "WhatsApp",
  both: "الزوز",
};

/** One answer this offer allows, exactly as `public_project_quote` published it. */
export type OfferChoice = { id: string; label_ar: string };

/** The payment question, in the calculator's own words (every one of them a Back Office key). */
export type OfferPaymentCopy = {
  title: string;
  hint: string;
  cash: string;
  installments: string;
  downTitle: string;
  downHint: string;
  durationTitle: string;
  /** Said instead of the question when this offer does not sell on instalments. */
  cashOnly: string;
  /** What to do when the question is left unanswered — `start.continue_hint_payment` / `_installments`. */
  requiredHint: string;
  installmentsRequiredHint: string;
  /** The offer refused this percentage or this duration; the visitor picks another. */
  planUnavailable: string;
  /**
   * `projects.payment_text` — how paying works on this offer. It used to be a prose card two screens BELOW
   * this question, read (if at all) by someone who had already answered it. Same setting, read where it
   * answers something.
   */
  note: string;
};

/** Row labels of the figures block, and the three notices the quote can raise. Same keys as /start. */
export type OfferSummaryCopy = {
  pricePerTree: string;
  areaPerTree: string;
  totalArea: string;
  totalPrice: string;
  annualFee: string;
  /** Contains `{amount}`: what one tree costs every year. */
  annualFeePerTree: string;
  down: string;
  duration: string;
  totalFinanced: string;
  remaining: string;
  monthly: string;
  /** Contains `{amount}`. */
  lastInstallment: string;
  /** Contains `{count}`. */
  installmentsCount: string;
  priceUnavailable: string;
  durationNotPriced: string;
  downCoversTotal: string;
};

export type OfferInterestFormProps = {
  projectId: string;
  projectName: string;
  /** The offer's own trees: the visitor may ask for the smallest basket, for all of them, or anything between. */
  maxTrees: number;
  /**
   * The smallest basket this offer sells — `projects.min_trees_per_order`, else `offers.min_trees_default`
   * (owner: «there is a minimum of trees to buy, it depends on the offer»). It used to be the literal 1 here,
   * so a visitor could send a basket the database then refused with `below_min_trees` after the form was
   * filled. The floor is the database's; this only stops the visitor before the refusal.
   */
  minTrees: number;
  /**
   * This offer's figures for the opening basket, quoted on the server for the first paint. Every later answer
   * re-quotes `public_project_quote` through `quoteOffer`, so nothing on this form is ever computed here.
   */
  quote: ProjectQuote | null;
  /**
   * THIS offer's own payment plan (owner, 2026-09-19: «each offer has its own stuff»), as the quote published
   * it: the percentages it allows and the durations it prices. Either list empty ⇒ the offer is cash only and
   * the instalment door is not opened at all — offering it would strand the visitor, because the quote answers
   * `incomplete` for ever without both ids.
   */
  downPercents: OfferChoice[];
  durations: OfferChoice[];
  payment: OfferPaymentCopy;
  summary: OfferSummaryCopy;
  governorates: { id: number; name_ar: string }[];
  contactTimes: Option[];
  title: string;
  intro: string;
  treesLabel: string;
  treesHint: string;
  /** `offers.quick_picks` as the Back Office holds it — «1,5,10,25,50». Parsed here, never in the page. */
  treesQuickPicks: string;
  submitLabel: string;
  successTitle: string;
  successText: string;
  /** The visit line, from projects.visit_cta / projects.visit_text. Empty label = no visit door on this offer. */
  visitLabel: string;
  visitText: string;
  consentText: string;
  /** PRN-01: an amount is never shown without the note that it is an estimate. Stamped across the head of
   *  the figures card, as on /start — not left as a grey footnote under it. */
  estimateNote: string;
  /** `legal.parcel_card_note`, riding at the foot of the figures it qualifies instead of holding a band of
   *  its own between the form and the end of the page. */
  legalNote: string;
  pricePending: string;
};

type FormState = {
  trees: string;
  fullName: string;
  phone: string;
  whatsappSame: boolean;
  whatsapp: string;
  email: string;
  governorateId: string;
  contactChannel: ContactChannel | null;
  contactTimeOptionId: string | null;
  wantsVisit: boolean;
  consent: boolean;
};

/** The payment answers live beside FormState — they re-quote the offer, the identity questions do not. */
type PlanKey = "paymentMode" | "downId" | "durationId";

type Errors = Partial<Record<keyof FormState | PlanKey, string>>;

/** How long an answer waits before the offer is quoted again, as on /start. */
const QUOTE_DEBOUNCE_MS = 250;

/**
 * The baskets offered as one tap, when the offer has no list of its own. Five counts of trees is a business
 * list, so it is read from `offers.quick_picks` in the Back Office and this is only the fallback (the rule
 * the rest of the page already follows). The list is filtered against the offer's own floor and stock, so a
 * count the offer cannot sell never appears. 2026-09-19.
 */
const QUICK_PICKS = [1, 5, 10, 25, 50];

/**
 * `offers.quick_picks` read into counts — «1,5,10,25,50». A bad entry is ignored, and an empty or unusable
 * setting falls back to QUICK_PICKS rather than leaving the visitor with no one-tap basket at all.
 *
 * NOT exported: this module is "use client", and a Server Component importing a value from one receives a
 * client-reference proxy, not the function. The page passes the raw setting and the parsing happens here.
 */
function readPicks(value: string): number[] {
  const counts = value
    .split(/[\s,،]+/)
    .map((part) => Number(part.trim()))
    .filter((count) => Number.isInteger(count) && count > 0);
  return counts.length > 0 ? [...new Set(counts)].sort((a, b) => a - b) : QUICK_PICKS;
}

/**
 * How a derived basket climbs away from the floor: the floor itself, then twice it, five times it, and so on.
 * These are not counts of trees and never become a business value on their own — every one of them is the
 * floor THIS offer set, multiplied. The counts a visitor sees are still the owner's whenever the owner's list
 * can be used.
 */
const PICK_STEPS = [1, 2, 5, 10, 25];

/** Below this many usable baskets the row is a stub rather than a picker, and the offer answers for itself. */
const MIN_USABLE_PICKS = 3;

/**
 * The one-tap baskets an offer can actually sell.
 *
 * `offers.quick_picks` is one list for the whole site, and an offer carries its own floor. On TX-00215 —
 * floor twenty trees, eight thousand of them free — «1,5,10,25,50» loses three of its five entries to the
 * filter and the picker selling eight thousand trees is left showing two chips. The setting is right to
 * exist and keeps winning whenever it survives; what is wrong is that a filtered-away list leaves a stub.
 * So when it does, the offer answers with its own figures instead: its floor, and multiples of it.
 *
 * The derived ladder stops short of the whole grove on purpose. «الكل» was removed from this row in
 * September — on an offer of eight thousand trees, the basket that buys every one of them a tap away from
 * the smallest is a mis-tap, not a convenience — and deriving it back would put it there again. A visitor
 * who wants all of them still writes the number, which is a deliberate act. A configured count keeps the
 * bounds it always had: the owner naming the ceiling is not an accident.
 */
function usableCounts(configured: number[], min: number, max: number): number[] {
  const kept = configured.filter((count) => count >= min && count <= max);
  if (kept.length >= MIN_USABLE_PICKS) return kept;
  const derived = PICK_STEPS.map((step) => min * step).filter((count) => count < max);
  return derived.length > kept.length ? derived : kept;
}

/**
 * The look of an answer the visitor has already given: filled forest, white words.
 *
 * One class may mean one thing, and `.choice` was meaning two — its own `:has(input:checked)` rule in
 * globals.css tints a picked box leaf-soft, while the tiles below overrode that with a solid fill, so the
 * payment tiles and the WhatsApp tick sat on the same screen disagreeing about what «picked» looks like. The
 * fill is the one kept: a tint the size of a whole row reads as a hover, and at 375px in daylight it barely
 * reads at all, while a filled box says «this is my answer» from across the form. Written once here so this
 * form can never grow a second one.
 *
 * The right home for it is `.choice:has(input:checked)` itself — one rule instead of a string at every call
 * site, for the forty boxes the rest of the app writes. globals.css is out of scope for this pass.
 */
// The fill now lives in `.choice:has(input:checked)` in globals.css — one rule for the forty boxes in
// this product instead of a string repeated at the call sites, and it inverts the native tick with it.
// Kept as an empty string so the class expressions below still read as «picked or not».
const CHOSEN = "";

/** The tick inverts with the fill, from the same rule. */
const CHOSEN_BOX = "";

/** A settings sentence with its bounds filled — every `{min}` and every `{max}`, in the hint and in the error. */
function fillBounds(template: string, min: number, max: number): string {
  return template.split("{min}").join(formatCount(min)).split("{max}").join(formatCount(max));
}

/** `{amount}` in a settings note, filled with an amount the database computed. */
function fillAmount(template: string, amount: string): string {
  return template.split("{amount}").join(amount);
}

/**
 * One tappable answer, whatever the question is. The form used to ask its most important question — how many
 * olive trees — with two 36px chips and a 160px text box, while the question under it was answered with
 * full-width cards; three control shapes for the same kind of answer across one product. This is the one
 * shape: the `.choice` tile the calculator already uses, filled when picked, because on a row of four
 * percentages a coloured edge alone reads as decoration. 2.75rem tall, so every one is a tap target at 375px.
 */
function PickTile({
  name,
  label,
  picked,
  onPick,
}: {
  name?: string;
  label: string;
  picked: boolean;
  onPick: () => void;
}) {
  // A tile fills its grid cell and nothing more. It used to carry `grow basis-24`, which let flex hand the
  // row's leftover width to the last tile: five counts came out as two, two, and one stretched across the
  // whole form (owner, 2026-09-22, on a screenshot of exactly that). The groups below are grids now, so every
  // tile in a group is the same width whether the row is full or not.
  const skin = `choice min-h-11 w-full justify-center text-center ${picked ? CHOSEN : ""}`;

  // A count sets a text field, so it is a button with aria-pressed; a plan answer is one of a radio group
  // and keeps its input, so the keyboard walks the group with the arrow keys.
  if (!name) {
    return (
      <button type="button" onClick={onPick} aria-pressed={picked} className={skin}>
        <span className="font-semibold tabular-nums">{label}</span>
      </button>
    );
  }

  return (
    <label className={skin}>
      <input type="radio" name={name} className="sr-only" checked={picked} onChange={onPick} />
      <span className="font-semibold tabular-nums">{label}</span>
    </label>
  );
}

export function OfferInterestForm(props: OfferInterestFormProps) {
  // The offer's smallest basket, not the literal 1: a form that opens on a count the offer refuses greets the
  // visitor with an error they did not make. It is also what the page quoted on the server, so the figures the
  // visitor first reads belong to the basket the picker first shows.
  const openingTrees = Math.max(1, Math.min(props.minTrees, props.maxTrees));
  const [form, setForm] = useState<FormState>({
    trees: String(openingTrees),
    fullName: "",
    phone: "",
    whatsappSame: true,
    whatsapp: "",
    email: "",
    governorateId: "",
    contactChannel: null,
    contactTimeOptionId: null,
    wantsVisit: false,
    consent: false,
  });
  /**
   * How the visitor wants to pay for THIS offer. Nothing is preselected: a mode the visitor never chose, sent
   * on with their request, is exactly the blank the owner is complaining about, only worse.
   */
  const [paymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  const [downId, setDownId] = useState<string | null>(null);
  const [durationId, setDurationId] = useState<string | null>(null);
  /** The figures on screen, and the answers they were computed for. */
  const [quote, setQuote] = useState<ProjectQuote | null>(props.quote);
  const [quotedFor, setQuotedFor] = useState(`${openingTrees}|||`);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);
  /** Server Actions answer in any order; only the answer to the latest question may land (as on /start). */
  const quoteSeq = useRef(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** The send is taking longer than a send normally takes — said out loud instead of leaving the button spinning. */
  const [slow, setSlow] = useState(false);
  const [requestNo, setRequestNo] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const successRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLElement>(null);
  /**
   * The offer page is six phone screens tall and the site-wide bottom bar excludes /projects — rightly, since
   * it leads to a simulation and must not pull a visitor out of a real offer — which left the one page
   * standing in front of real, numbered, priced trees with nothing to tap. This form brings its own bar
   * instead. Once the form has been on screen it has done its job and never comes back, so it can never
   * cover the send button or the footer under it.
   */
  const [formSeen, setFormSeen] = useState(false);
  const picks = useMemo(() => readPicks(props.treesQuickPicks), [props.treesQuickPicks]);

  useEffect(() => {
    const node = formRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setFormSeen(true);
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * The confirmation replaces the form where the form stood — which, on an offer page, is far down a long
   * document, between the visit button and the legal notices. Nothing moved the page, and the heading carried a
   * ref and tabIndex that nothing ever focused, so a visitor who submitted could be left looking at whatever
   * happened to be on screen (owner, 2026-09-18: «this should be centered after it get sended, not lost»).
   *
   * So: bring it to the middle of the screen and put the keyboard on its heading, which is also what a screen
   * reader needs. Honour prefers-reduced-motion — a long instant jump is the one thing worse than a smooth one.
   */
  useEffect(() => {
    if (!requestNo) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    successRef.current?.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    headingRef.current?.focus({ preventScroll: true });
  }, [requestNo]);

  /**
   * «نحب نزور الأرض» is the second door on this offer, and it used to open onto a card that said «سجّل اهتمامك»
   * and sent the visitor back here — a round trip that wrote nothing down (owner, 2026-09-18: «the button
   * doesn't work, it shows a popup»). The door now leads into this form, landing on the visit line, which it
   * ticks on the way in. One form, one send, and the intent travels with the request.
   *
   * Both entries are covered: the hash is already set when the page is opened on it, and hashchange fires when
   * a link to it is followed on a page that is already mounted.
   */
  useEffect(() => {
    const armIfVisit = () => {
      if (window.location.hash === "#offer-visit") setForm((current) => ({ ...current, wantsVisit: true }));
    };
    armIfVisit();
    window.addEventListener("hashchange", armIfVisit);
    return () => window.removeEventListener("hashchange", armIfVisit);
  }, []);

  const trees = useMemo(() => {
    const parsed = Number.parseInt(toWesternDigits(form.trees).replace(/\D/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [form.trees]);

  // The offer's own floor, never a literal 1, and never above its ceiling: an offer whose minimum exceeds
  // what is still free would otherwise make every count invalid with nothing the visitor could type.
  const minTrees = openingTrees;
  const valid = trees >= minTrees && trees <= props.maxTrees;
  /** The one-tap baskets this offer can actually sell — the owner's list while it holds, else this offer's own. */
  const usablePicks = usableCounts(picks, minTrees, props.maxTrees);

  // PRJ-03: stock is a fact, a price is a permission. No price, no payment question — the request is still
  // taken, and `projects.price_pending` says so where the figures would be.
  const priced = quote?.pricing === "ok" && quote.price_per_tree_millimes !== null;
  /** This offer sells on instalments only while it publishes both a percentage and a priced duration. */
  const offersInstallments = props.downPercents.length > 0 && props.durations.length > 0;
  // No price, no payment answer — the question is not asked and nothing is sent. An offer that sells for cash
  // only answers itself, so the visitor is told rather than asked.
  const chosenMode: PaymentMode | null = !priced ? null : offersInstallments ? paymentMode : "cash";
  const installments = chosenMode === "installments";
  const chosenDown = installments ? props.downPercents.find((option) => option.id === downId) : undefined;
  const chosenDuration = installments ? props.durations.find((option) => option.id === durationId) : undefined;
  /** The payment question is asked (and answered) only while this offer prices instalments. */
  const asksPayment = priced && offersInstallments;

  // Cash and «no answer yet» are the same question for the quote — `public_project_quote` answers the identical
  // payload for both — so only instalments are sent, and the opening screen needs no round trip at all.
  const quoteMode: PaymentMode | null = installments ? "installments" : null;
  const quoteDown = installments ? downId : null;
  const quoteDuration = installments ? durationId : null;
  /** The answers the figures on screen belong to. While it differs from `quotedFor`, the figures are stale. */
  const answered = `${trees}|${quoteMode ?? ""}|${quoteDown ?? ""}|${quoteDuration ?? ""}`;
  const stale = answered !== quotedFor;

  /**
   * Every figure on this form is computed by Postgres, for these answers, on this offer: the cash total, and
   * — once the visitor picked one of THIS offer's percentages and durations — the down payment, the financed
   * total and the monthly instalment. A markup, a down payment and a monthly are not multiplications
   * (app.financed_quote, 0036), so they may never be worked out here.
   *
   * The figures already on screen stay there, dimmed, while a newer answer is quoted: blanking them to zero on
   * every keystroke is worse than a figure that is briefly one answer behind, and `stale` says which it is.
   */
  useEffect(() => {
    // Nothing changed since the shown figures were computed, and a count the offer refuses is not quoted at
    // all — the hint under the picker already says what to type instead.
    if (!stale || !valid) return;
    const seq = ++quoteSeq.current;
    const timer = setTimeout(() => {
      setQuoting(true);
      quoteOffer({
        projectId: props.projectId,
        trees,
        paymentMode: quoteMode,
        downPercentOptionId: quoteDown,
        durationOptionId: quoteDuration,
      })
        .catch(() => null)
        .then((result) => {
          if (seq !== quoteSeq.current) return;
          setQuoting(false);
          if (!result) {
            setQuoteFailed(true);
            return;
          }
          setQuote(result);
          setQuotedFor(answered);
          setQuoteFailed(false);
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [props.projectId, trees, quoteMode, quoteDown, quoteDuration, answered, stale, valid]);

  const plan = installments && priced && quote?.installments?.status === "ok" ? quote.installments : null;
  const planStatus = installments && priced ? (quote?.installments?.status ?? null) : null;

  /** Why a figure is missing, in the offer's own words: no price yet, an unpriced duration, a down payment
   *  larger than the total, or a choice this offer does not allow. */
  const notice =
    quote?.pricing === "unavailable"
      ? props.summary.priceUnavailable
      : planStatus === "duration_not_priced"
        ? props.summary.durationNotPriced
        : planStatus === "down_covers_total"
          ? props.summary.downCoversTotal
          : planStatus === "invalid_choice" || planStatus === "too_many_months"
            ? props.payment.planUnavailable
            : null;

  /**
   * The in-between state, and the reason the owner said the offer form «doesn't work» while the calculator does
   * (2026-09-19). The calculator is a wizard: one question per step, and the summary only at the last step, so
   * it never has a half-answered plan to show. This form asks everything on one screen, so it does — and it said
   * NOTHING about it. Choosing «بالتقسيط», then a percentage, left the card showing the same cash figures as
   * before: no down payment, no monthly, and no hint that a duration was still missing. Clicking and watching
   * nothing change is indistinguishable from a calculation that is broken.
   *
   * So the card says what it is still waiting for. Null once the plan is complete, and null while `notice`
   * already explains a real refusal — two explanations for one blank is worse than none.
   *
   * It is printed BESIDE the two questions it names. It used to sit at the foot of the figures card, 550px
   * below them, behind a «↓» that pointed further away — the one piece of guidance on the page, aimed the
   * wrong way (owner reading, 2026-09-19).
   */
  const planPending =
    installments && priced && !plan && !notice
      ? !chosenDown && !chosenDuration
        ? "باقي اختيارين: نسبة التسبقة ومدّة الدفع. اختارهم باش نحسبولك القسط الشهري."
        : !chosenDown
          ? "باقي اختيار واحد: نسبة التسبقة. اختارها باش نحسبولك القسط الشهري."
          : !chosenDuration
            ? "باقي اختيار واحد: مدّة الدفع. اختارها باش نحسبولك القسط الشهري."
            : "قاعدين نحسبولك القسط الشهري…"
      : null;

  /**
   * The one figure the visitor is deciding on, at the head of the figures card — and the only one at
   * `--text-figure`.
   *
   * It used to be «سعر الزيتونة» and «السعر الجملي للطلب», both at the same 24px, the first of them already
   * the hero figure two screens above; and the moment the visitor chose instalments — the moment the sum they
   * commit to becomes the question — the order total SHRANK to 18px while the per-tree price stayed big. The
   * figure the decision turns on is now the one that leads: the order total in cash, the monthly instalment
   * once this offer has priced the plan. Presentation only; every amount is the quote's own.
   */
  const leadFigure: { key: "monthly" | "total" | "perTree"; value: string; label: string; notes: string[] } | null =
    !priced || !quote
      ? null
      : plan && plan.monthly_millimes !== null
        ? {
            key: "monthly",
            value: formatMillimes(plan.monthly_millimes),
            label: props.summary.monthly,
            notes: [
              // Q-11: rounding the monthly up can shorten the plan and leave a smaller last instalment.
              plan.last_installment_millimes !== null &&
              plan.last_installment_millimes !== plan.monthly_millimes &&
              props.summary.lastInstallment
                ? fillAmount(props.summary.lastInstallment, formatMillimes(plan.last_installment_millimes))
                : "",
              plan.shortened && plan.installments_count !== null && props.summary.installmentsCount
                ? props.summary.installmentsCount.split("{count}").join(formatCount(plan.installments_count))
                : "",
            ].filter(Boolean),
          }
        : quote.total_price_millimes !== null
          ? { key: "total", value: formatMillimes(quote.total_price_millimes), label: props.summary.totalPrice, notes: [] }
          : quote.price_per_tree_millimes !== null
            ? {
                key: "perTree",
                value: formatMillimes(quote.price_per_tree_millimes),
                label: props.summary.pricePerTree,
                notes: [],
              }
            : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function clearError(key: PlanKey) {
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  /** Going back to «بالحاضر» drops the two instalment answers, so nothing travels that was not chosen. */
  function pickPayment(mode: PaymentMode) {
    setPaymentMode(mode);
    clearError("paymentMode");
    if (mode === "cash") {
      setDownId(null);
      setDurationId(null);
    }
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!valid) {
      // What went wrong and what to type instead: the hint already carries both bounds in the owner's words,
      // and the sentence below names them again when the setting is empty.
      next.trees =
        fillBounds(props.treesHint, minTrees, props.maxTrees) ||
        `اكتب عدد الزيتونات: من ${formatCount(minTrees)} إلى ${formatCount(props.maxTrees)}.`;
    }
    // The payment question is asked exactly where it is answered, so its error says «choose one», never «go
    // back to the calculator»: on an offer page there is no calculator to go back to.
    if (priced && offersInstallments && !paymentMode) next.paymentMode = props.payment.requiredHint;
    if (installments && !chosenDown) next.downId = props.payment.installmentsRequiredHint;
    if (installments && !chosenDuration) next.durationId = props.payment.installmentsRequiredHint;
    if (form.fullName.trim().length < 3) next.fullName = "اكتب الاسم واللقب كاملين.";
    if (toWesternDigits(form.phone).replace(/\D/g, "").length < 8) next.phone = "اكتب رقم هاتفك (8 أرقام).";
    if (!form.whatsappSame && toWesternDigits(form.whatsapp).replace(/\D/g, "").length < 8) {
      next.whatsapp = "اكتب رقم WhatsApp، أو فعّل «نفس رقم الهاتف».";
    }
    if (!form.governorateId) next.governorateId = "اختر ولايتك من القائمة.";
    if (!form.contactChannel) next.contactChannel = "اختر كيف تحب نتصلوا بيك.";
    if (!form.consent) next.consent = "لإرسال الطلب، وافق على التواصل ومعالجة معطياتك.";
    return next;
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitError(null);
    setSlow(false);
    // A send that never answers used to leave the visitor on «جارٍ الإرسال…» for as long as they were willing to
    // wait, with no result, no error and no way out — the owner sat through exactly that. A Server Action cannot
    // be cancelled from here, so these two timers do not stop the request; they stop the SILENCE. At twelve
    // seconds the form says it is taking longer than usual, and at forty-five it says what to do about it. If the
    // answer arrives after either, it still wins: the result below overwrites both.
    const slowTimer = window.setTimeout(() => setSlow(true), 12_000);
    const giveUpTimer = window.setTimeout(() => {
      setSlow(false);
      // Honest about what is and is not known: the request may well have arrived, so the visitor is told that
      // sending it again is safe rather than being left to guess. The database recognises a repeat of the same
      // demand and marks it as one (is_duplicate) instead of creating a second file.
      setSubmitError(
        "الإرسال طوّل برشة وما جانا حتى جواب. يمكن طلبك وصل: عاود إرسالو بلا خوف — كان وصل مرّتين نعرفوه ونحسبوه طلب واحد.",
      );
    }, 45_000);

    startTransition(async () => {
      try {
        const result = await submitOfferInterest({
          projectId: props.projectId,
          trees,
          fullName: form.fullName.trim(),
          phone: toWesternDigits(form.phone).trim(),
          whatsappSame: form.whatsappSame,
          whatsapp: toWesternDigits(form.whatsapp).trim(),
          email: form.email.trim(),
          governorateId: Number(form.governorateId),
          contactChannel: form.contactChannel ?? "phone",
          contactTimeOptionId: form.contactTimeOptionId,
          // What the commercial calling back needs to know before they dial. The two ids belong to instalments
          // only; the database is what decides whether this offer allows them.
          paymentMode: chosenMode,
          downPercentOptionId: installments ? (chosenDown?.id ?? null) : null,
          durationOptionId: installments ? (chosenDuration?.id ?? null) : null,
          wantsVisit: form.wantsVisit,
          consent: true,
          website: honeypot,
          source: readVisitSource() as Record<string, string>,
        });
        if (result.ok) setRequestNo(result.requestNo);
        else setSubmitError(result.message);
      } catch {
        setSubmitError("تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      } finally {
        window.clearTimeout(slowTimer);
        window.clearTimeout(giveUpTimer);
        setSlow(false);
      }
    });
  }

  if (requestNo) {
    return (
      <section
        id="offer-form"
        ref={successRef}
        role="status"
        className="scroll-mt-24 rounded-2xl border border-leaf bg-leaf-soft/60 p-6 text-center sm:p-8"
      >
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-surface">
          <svg viewBox="0 0 24 24" className="size-7 text-forest" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-3xl font-bold text-forest outline-none">
          {props.successTitle}
        </h2>
        {props.successText ? <p className="mx-auto mt-3 max-w-md leading-7 text-ink/80">{props.successText}</p> : null}
        <p className="mt-5 text-sm text-muted">رقم مطلبك</p>
        <p dir="ltr" className="mt-1 font-display text-4xl font-bold tracking-wide text-ink tabular-nums">
          {requestNo}
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted">
          طلبك على «{props.projectName}» بـ<span className="tabular-nums"> {formatCount(trees)} </span>زيتونة.
          {form.wantsVisit ? " ونتصلو بيك باش نرتّبو معاك موعد زيارة الأرض." : null}
        </p>
      </section>
    );
  }

  return (
    <>
      <section id="offer-form" ref={formRef} className="card scroll-mt-24 p-4 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6">
        <h2 className="font-display text-xl font-bold text-forest sm:text-2xl">{props.title}</h2>
        {props.intro ? <p className="mt-1.5 text-[0.8125rem] leading-5 text-muted sm:mt-2 sm:text-base sm:leading-7">{props.intro}</p> : null}

        {/* A rhythm a phone can walk: the questions this offer asks, the figures they change, then who to
            call back — three blocks a hairline apart instead of one column of eleven equal fields. */}
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-5 sm:mt-6 sm:space-y-7">
          <div className="space-y-4 sm:space-y-6">
            {/* The offer's own question: how many of its trees. Everything else is who to call back. */}
            <div>
              <label htmlFor="offer-trees" className="label">
                {props.treesLabel}
              </label>
              {usablePicks.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {usablePicks.map((count) => (
                    <PickTile
                      key={count}
                      label={formatCount(count)}
                      picked={trees === count}
                      onPick={() => update("trees", String(count))}
                    />
                  ))}
                </div>
              ) : null}
              {/* The escape hatch under the one-tap baskets, not the main event. */}
              <input
                id="offer-trees"
                name="trees"
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={form.trees}
                onChange={(event) => update("trees", event.target.value)}
                aria-invalid={Boolean(errors.trees)}
                aria-describedby={errors.trees ? "offer-trees-error" : "offer-trees-hint"}
                className="field mt-2 h-11 max-w-32 text-center tabular-nums sm:mt-3 sm:h-12 sm:max-w-40"
              />
              {errors.trees ? (
                <p id="offer-trees-error" className="error-text">
                  {errors.trees}
                </p>
              ) : props.treesHint ? (
                // Both bounds, exactly as the error above fills them. The hint used to replace {max} only, so the
                // day the setting mentions {min} the visitor would read the placeholder itself.
                <p id="offer-trees-hint" className="hint mt-1.5">
                  {fillBounds(props.treesHint, minTrees, props.maxTrees)}
                </p>
              ) : null}
            </div>

            {/* Owner, 2026-09-19: «in the form it's missing the payment method like the main form». Asked here, in
                the calculator's order and with the calculator's words — and with THIS offer's own answers. */}
            <div className="space-y-4">
              {asksPayment ? (
                <fieldset>
                  <legend className="label">{props.payment.title}</legend>
                  {props.payment.hint ? <p className="hint mt-1.5">{props.payment.hint}</p> : null}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <PickTile
                      name="offerPaymentMode"
                      label={props.payment.cash}
                      picked={paymentMode === "cash"}
                      onPick={() => pickPayment("cash")}
                    />
                    <PickTile
                      name="offerPaymentMode"
                      label={props.payment.installments}
                      picked={paymentMode === "installments"}
                      onPick={() => pickPayment("installments")}
                    />
                  </div>
                  {errors.paymentMode ? (
                    <p role="alert" className="error-text mt-2">
                      {errors.paymentMode}
                    </p>
                  ) : null}
                </fieldset>
              ) : priced && props.payment.cashOnly ? (
                // This offer publishes no percentage or no priced duration, so it sells for cash and says so once.
                <p className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold leading-6 text-forest">
                  {props.payment.cashOnly}
                </p>
              ) : null}

              {/* How paying works on this offer, read where it is being decided. */}
              {props.payment.note ? <p className="text-sm leading-7 text-muted">{props.payment.note}</p> : null}

              {asksPayment && installments ? (
                <>
                  <fieldset>
                    <legend className="label">{props.payment.downTitle}</legend>
                    {props.payment.downHint ? <p className="hint mt-1.5">{props.payment.downHint}</p> : null}
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {props.downPercents.map((option) => (
                        <PickTile
                          key={option.id}
                          name="offerDownPercent"
                          label={option.label_ar}
                          picked={downId === option.id}
                          onPick={() => {
                            setDownId(option.id);
                            clearError("downId");
                          }}
                        />
                      ))}
                    </div>
                    {errors.downId ? (
                      <p role="alert" className="error-text mt-2">
                        {errors.downId}
                      </p>
                    ) : null}
                  </fieldset>

                  <fieldset>
                    <legend className="label">{props.payment.durationTitle}</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {props.durations.map((option) => (
                        <PickTile
                          key={option.id}
                          name="offerDuration"
                          label={option.label_ar}
                          picked={durationId === option.id}
                          onPick={() => {
                            setDurationId(option.id);
                            clearError("durationId");
                          }}
                        />
                      ))}
                    </div>
                    {errors.durationId ? (
                      <p role="alert" className="error-text mt-2">
                        {errors.durationId}
                      </p>
                    ) : null}
                  </fieldset>

                  {/* What is still missing, said against the questions that are missing it. */}
                  {planPending ? (
                    <p role="status" className="rounded-xl bg-leaf-soft px-3 py-2.5 text-sm font-medium leading-6 text-forest">
                      {planPending}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {/* What those trees cost, and what the plan does to it. Every figure below is `public_project_quote`'s
              own, for these answers, on this offer — nothing here multiplies, adds a markup or rounds.

              It is the one place on the page where a number changes under the reader, so it is the one place
              that looks alive: the warm dashed `.card-estimate` surface, with the estimate note stamped across
              its head exactly as the calculator does it. The material is back to meaning one thing — dashed
              gold is an estimate, everywhere in the product. This block used to sit on bare `bg-paper` with no
              edge at all while the offer's starting price wore the elevated `.panel`: the surface grammar was
              the wrong way round. */}
          <section className="card card-estimate overflow-hidden">
            {priced && props.estimateNote ? (
              <p className="border-b border-dashed border-gold/50 bg-gold-soft/70 px-4 py-3 text-xs font-semibold leading-5 text-forest sm:px-5">
                {props.estimateNote}
              </p>
            ) : null}

            <div
              aria-busy={quoting || stale || undefined}
              className={`p-4 transition-opacity sm:p-5 ${quoting || stale ? "opacity-60" : ""}`}
            >
              {priced && quote ? (
                <>
                  {leadFigure ? (
                    <div className="stat border-b border-dashed border-gold/40 pb-4">
                      <span className="stat-figure">{leadFigure.value}</span>
                      <span className="stat-label">{leadFigure.label}</span>
                      {leadFigure.notes.map((note) => (
                        <span key={note} className="text-xs leading-5 text-muted">
                          {note}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <dl className="divide-y divide-line">
                    {quote.total_price_millimes !== null && leadFigure?.key !== "total" ? (
                      <DataRow label={props.summary.totalPrice}>{formatMillimes(quote.total_price_millimes)}</DataRow>
                    ) : null}
                    {quote.price_per_tree_millimes !== null && leadFigure?.key !== "perTree" ? (
                      <DataRow label={props.summary.pricePerTree}>{formatMillimes(quote.price_per_tree_millimes)}</DataRow>
                    ) : null}
                    {/* Two rows, not one. This said «المساحة لكل زيتونة · 500 م²» for a basket of 20 trees at 25 m²
                        each: the figure was the whole basket's area under the per-tree label, contradicting the
                        offer's own facts two screens up. The area of one tree is the quote's `area_per_tree_m2`
                        and does not move with the count; the basket's is `total_area_m2`, which the same quote
                        already returns. */}
                    <DataRow label={props.summary.areaPerTree}>{formatArea(quote.area_per_tree_m2)}</DataRow>
                    {quote.total_area_m2 !== null ? (
                      <DataRow label={props.summary.totalArea}>{formatArea(quote.total_area_m2)}</DataRow>
                    ) : null}
                    {quote.annual_fee_total_millimes !== null ? (
                      <DataRow label={props.summary.annualFee}>
                        <span className="block">{formatMillimes(quote.annual_fee_total_millimes)}</span>
                        {quote.annual_fee_per_tree_millimes !== null && props.summary.annualFeePerTree ? (
                          <span className="mt-0.5 block text-xs font-normal text-muted">
                            {fillAmount(props.summary.annualFeePerTree, formatMillimes(quote.annual_fee_per_tree_millimes))}
                          </span>
                        ) : null}
                      </DataRow>
                    ) : null}

                    {/* The plan, once this offer priced the percentage and the duration the visitor picked. */}
                    {plan ? (
                      <>
                        <DataRow label={props.summary.down}>
                          {plan.down_payment_millimes !== null && chosenDown
                            ? `${chosenDown.label_ar} · ${formatMillimes(plan.down_payment_millimes)}`
                            : (chosenDown?.label_ar ?? "")}
                        </DataRow>
                        {chosenDuration ? <DataRow label={props.summary.duration}>{chosenDuration.label_ar}</DataRow> : null}
                        {plan.total_financed_millimes !== null ? (
                          <DataRow label={props.summary.totalFinanced}>{formatMillimes(plan.total_financed_millimes)}</DataRow>
                        ) : null}
                        {plan.remaining_millimes !== null ? (
                          <DataRow label={props.summary.remaining}>{formatMillimes(plan.remaining_millimes)}</DataRow>
                        ) : null}
                        {plan.monthly_millimes !== null && leadFigure?.key !== "monthly" ? (
                          <DataRow label={props.summary.monthly}>{formatMillimes(plan.monthly_millimes)}</DataRow>
                        ) : null}
                      </>
                    ) : null}
                  </dl>
                </>
              ) : (
                <p className="font-semibold text-forest">{props.pricePending}</p>
              )}

              {notice ? <p className="mt-3 rounded-xl bg-leaf-soft px-3 py-2 text-sm leading-6 text-forest">{notice}</p> : null}
              {/* A quote that never answered: the figures above are the last ones that did, so say which. */}
              {quoteFailed ? (
                <p role="status" className="mt-3 text-xs leading-6 text-muted">
                  ما نجّمناش نحدّثو التقدير توّا. بدّل اختيارك ولا عاود بعد شويّة — الأرقام الفوق مازالت على الاختيار السابق.
                </p>
              ) : null}
              {/* PRN-01: the note that travels with the figures, at the foot of the figures. */}
              {props.legalNote ? <p className="mt-3 text-xs leading-6 text-muted">{props.legalNote}</p> : null}
            </div>
          </section>

          {/* Who to call back. */}
          <div className="space-y-5 border-t border-line pt-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="offer-name" label="الاسم واللقب" error={errors.fullName}>
                <input
                  id="offer-name"
                  name="fullName"
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                  aria-invalid={Boolean(errors.fullName)}
                  className="field"
                />
              </FormField>
              <FormField id="offer-phone" label="رقم الهاتف" hint="8 أرقام، مثال: 98 123 456" error={errors.phone}>
                <input
                  id="offer-phone"
                  name="phone"
                  type="tel"
                  dir="ltr"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  aria-invalid={Boolean(errors.phone)}
                  className="field"
                />
              </FormField>
            </div>

            <div className="space-y-4">
              <label className={`choice ${form.whatsappSame ? CHOSEN : ""}`}>
                <input
                  type="checkbox"
                  className={form.whatsappSame ? CHOSEN_BOX : undefined}
                  checked={form.whatsappSame}
                  onChange={(event) => update("whatsappSame", event.target.checked)}
                />
                <span>رقم WhatsApp هو نفس رقم الهاتف</span>
              </label>
              {!form.whatsappSame ? (
                <FormField id="offer-whatsapp" label="رقم WhatsApp" error={errors.whatsapp}>
                  <input
                    id="offer-whatsapp"
                    name="whatsapp"
                    type="tel"
                    dir="ltr"
                    value={form.whatsapp}
                    onChange={(event) => update("whatsapp", event.target.value)}
                    aria-invalid={Boolean(errors.whatsapp)}
                    className="field"
                  />
                </FormField>
              ) : null}
            </div>

            <FormField id="offer-governorate" label="ولاية إقامتك" error={errors.governorateId}>
              <select
                id="offer-governorate"
                name="governorateId"
                value={form.governorateId}
                onChange={(event) => update("governorateId", event.target.value)}
                aria-invalid={Boolean(errors.governorateId)}
                className="field"
              >
                <option value="">اختر ولايتك</option>
                {props.governorates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name_ar}
                  </option>
                ))}
              </select>
            </FormField>

            <fieldset>
              <legend className="label">كيفاش تحب نتصلوا بيك؟</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((channel) => (
                  <label
                    key={channel}
                    className={`choice min-h-11 justify-center text-center font-semibold ${
                      form.contactChannel === channel ? CHOSEN : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="offerContactChannel"
                      className="sr-only"
                      checked={form.contactChannel === channel}
                      onChange={() => update("contactChannel", channel)}
                    />
                    <span>{CHANNEL_LABELS[channel]}</span>
                  </label>
                ))}
              </div>
              {errors.contactChannel ? (
                <p role="alert" className="error-text mt-2">
                  {errors.contactChannel}
                </p>
              ) : null}
            </fieldset>

            {props.contactTimes.length > 0 ? (
              <FormField id="offer-time" label="الوقت المفضّل للمكالمة (اختياري)">
                <select
                  id="offer-time"
                  name="contactTime"
                  value={form.contactTimeOptionId ?? ""}
                  onChange={(event) => update("contactTimeOptionId", event.target.value || null)}
                  className="field"
                >
                  <option value="">أي وقت</option>
                  {props.contactTimes.map((time) => (
                    <option key={time.id} value={time.id}>
                      {time.label_ar}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
          </div>

          <div className="space-y-5 border-t border-line pt-7">
            {/* The offer's second door, landed on and ticked by a link to #offer-visit. scroll-mt clears the
                sticky header so the visitor arrives looking at this line, not under it. */}
            {props.visitLabel ? (
              <div id="offer-visit" className="scroll-mt-28 rounded-xl bg-leaf-soft/50 p-4">
                <label className="choice items-start border-0 bg-transparent p-0 [&:has(input:checked)]:bg-transparent [&:has(input:checked)]:text-inherit">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.wantsVisit}
                    onChange={(event) => update("wantsVisit", event.target.checked)}
                  />
                  <span className="font-semibold leading-7 text-forest">{props.visitLabel}</span>
                </label>
                {props.visitText ? <p className="mt-2 text-label leading-7 text-muted">{props.visitText}</p> : null}
              </div>
            ) : null}

            <div>
              <label className={`choice items-start ${form.consent ? CHOSEN : ""}`}>
                <input
                  type="checkbox"
                  className={`mt-1 ${form.consent ? CHOSEN_BOX : ""}`}
                  checked={form.consent}
                  onChange={(event) => update("consent", event.target.checked)}
                  aria-invalid={Boolean(errors.consent)}
                />
                <span className="text-label leading-7">{props.consentText}</span>
              </label>
              {errors.consent ? <p className="error-text">{errors.consent}</p> : null}
            </div>

            {/* Honeypot for bots; hidden from people and assistive technology. Never offset off-screen: on an RTL
                page a -10000px offset widens the document and leaves the visitor on a blank screen. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clipPath: "inset(50%)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            >
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              </label>
            </div>

            {submitError ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium leading-6 text-danger">
                {submitError}
              </p>
            ) : null}

            <div className="space-y-2">
              <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto sm:min-w-56">
                {pending ? "جارٍ الإرسال…" : props.submitLabel}
              </button>
              {/* A silent wait reads as a broken page. This says the send is still running, politely, and it never
                  shows at the same time as the error: the error replaces it. */}
              {slow && pending ? (
                <p role="status" className="text-caption leading-6 text-muted">
                  الإرسال طوّل شويّة أكثر من المعتاد… مازلنا نستنّاو الجواب، ما تغلقش الصفحة.
                </p>
              ) : null}
            </div>
          </div>
        </form>
      </section>

      {/* This offer's own bottom bar, on a phone, until the form has been reached — the one action that
          belongs to the page the visitor is standing on, instead of the two mid-page buttons that repeated
          the form's own title 144px above it. */}
      {!formSeen ? (
        <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <a href="#offer-form" className="btn btn-primary w-full">
            {props.submitLabel}
          </a>
        </div>
      ) : null}
    </>
  );
}
