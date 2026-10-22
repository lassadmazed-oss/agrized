"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { AccountInvite } from "@/components/site/account-invite";
import { PrefillNote, SignInHint } from "@/components/site/prefill-note";
import type { IntakePrefill } from "@/lib/intake-prefill";

import Link from "@/components/site/link";
import { readVisitSource } from "@/components/site/source-capture";
import { FormField } from "@/components/ui";
import { toWesternDigits } from "@/lib/digits";
import { focusFirstError } from "@/lib/focus-first-error";
import { useDir, useT } from "@/lib/i18n/client";

import type { CalculatorChoices, SummaryRowKey } from "../start/calculator-summary";
import { submitInterest } from "./actions";

/** An option row from the Back Office lists, its label already in the page's language. */
type Option = { id: string; code: string | null; label: string };

type Translate = ReturnType<typeof useT>;

/** One line of «اختياراتك في الحاسبة», formatted on the server in the page's language. */
export type RecapRow = { key: SummaryRowKey; label: string; value: string; notes: string[] };

/** The calculator answers, shown read-only above the form (P2-6). */
export type CalculatorRecap = {
  title: string;
  rows: RecapRow[];
  /** Why a figure is missing, e.g. no price set yet. */
  notice: string | null;
  /** PRN-01: set only when an amount is shown. */
  estimateNote: string | null;
  /** The calculator answer is incomplete; only /start can fix it. */
  error: string | null;
  editLabel: string;
  /** /start with every choice kept in the URL. */
  editHref: string;
};

export type RegisterWizardProps = {
  /**
   * The buyer's own details when he is signed in, null otherwise — which is most readers (0147). It only
   * ever fills fields in: every question is still asked, still editable, and still answerable by someone
   * with no account at all.
   */
  prefill: IntakePrefill | null;
  governorates: { id: number; name: string }[];
  goals: Option[];
  contactTimes: Option[];
  allowInternationalPhone: boolean;
  notice: string;
  consentText: string;
  /** `visit=1` in the link pre-answers «تحب تزور الأرض؟» with yes. */
  initialWantsVisit: boolean;
  /** Sent with the request exactly as /start passed them. */
  choices: CalculatorChoices;
  recap: CalculatorRecap;
  /** Closing line of the success screen. */
  successNote: string;
  /** Owner 2026-09-16 «اعمل ترحيب و تحفيز»: the welcome, what happens next and one encouraging line. */
  successWelcomeTitle: string;
  successWelcomeText: string;
  successMotivation: string;
  successProgressLabel: string;
  /** Owner 2026-09-18: «in the end show the current offers after the send». Empty while the module is closed. */
  offers: SuccessOffer[];
  offersTitle: string;
  offersText: string;
};

/** One offer on the confirmation screen: everything already formatted on the server, in the page's language. */
export type SuccessOffer = {
  code: string;
  name: string;
  place: string;
  href: string;
  coverUrl: string | null;
  coverAlt: string | null;
  trees: string | null;
  areaPerTree: string | null;
  pricePerTree: string | null;
};

type ContactChannel = "phone" | "whatsapp" | "both";

type FormState = {
  fullName: string;
  phone: string;
  whatsappSame: boolean;
  whatsapp: string;
  email: string;
  governorateId: number | null;
  /** «من المواطنين بالخارج» (0121): changes what the governorate question is asking. */
  livesAbroad: boolean;
  investAnywhere: boolean;
  investGovernorateIds: number[];
  goalOptionId: string | null;
  wantsVisit: boolean | null;
  wantsBankFinancing: boolean | null;
  contactChannel: ContactChannel | null;
  contactTimeOptionId: string | null;
  consent: boolean;
};

type Errors = Partial<Record<keyof FormState, string>>;

type SubmitError = { message: string; /** Only /start can fix it. */ calculator: boolean };

/** The title of each step, by settings key (the heading, and the legend of the step's question). */
const STEPS = [
  "ui.register.step_identity",
  "ui.register.step_location",
  "ui.register.step_goal",
  "ui.register.step_visit",
  "ui.register.step_contact",
  "ui.register.step_review",
] as const;

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "ui.register.channel_phone",
  whatsapp: "ui.register.channel_whatsapp",
  both: "ui.register.channel_both",
};

/** `label` is a settings key. */
type YesNoChoice = { value: boolean; label: string };
const VISIT_CHOICES: YesNoChoice[] = [
  { value: true, label: "ui.register.answer_yes" },
  { value: false, label: "ui.register.visit_no" },
];
const BANK_CHOICES: YesNoChoice[] = [
  { value: true, label: "ui.register.answer_yes" },
  { value: false, label: "ui.register.bank_no" },
];
const NO_ANSWER = "ui.register.no_answer";

/** Owner, 2026-09-18: answering carries the visitor on, like the calculator. Long enough to see the tick. */
const AUTO_NEXT_MS = 220;

/** What the success screen recaps, in this order. */
const SUCCESS_ROWS: SummaryRowKey[] = ["trees", "area_per_tree", "total_area", "payment", "total_price"];

/** Stands for the price inside its sentence while the sentence is cut around it (Success). */
const PRICE_SLOT = "\u0001";

// The calculator answers moved to the URL (P2-6); an older draft still gives back the identity and contact answers.
/** A saved draft: the answers, plus whose they are — see the restore below for why that second part. */
type Draft = Partial<FormState> & { personId?: string | null };

const DRAFT_KEY = "agrized:register-draft-v4";
const PREVIOUS_DRAFT_KEY = "agrized:register-draft-v3";
const OLD_DRAFT_KEYS = ["agrized:register-draft", PREVIOUS_DRAFT_KEY];

/**
 * The form a reader starts from — blank, or carrying what his account already told us (0147).
 *
 * Seeding HERE and not at the call site is what makes the prefill safe: everything this returns goes
 * through sanitize(), which drops any id that is no longer in the Back Office lists. A governorate the
 * owner has since removed is cleared by the same code that clears it out of a stale draft.
 *
 * whatsappSame stays true unless the account actually holds a DIFFERENT second number: the question is
 * «same number for WhatsApp?», and answering it «no» on a buyer's behalf would make him correct us.
 */
function emptyForm(props: RegisterWizardProps): FormState {
  const known = props.prefill;
  const apart = known?.whatsappApart ?? false;
  return {
    fullName: known?.fullName ?? "",
    phone: known?.phone ?? "",
    whatsappSame: !apart,
    whatsapp: apart ? (known?.whatsapp ?? "") : "",
    email: known?.email ?? "",
    governorateId: known?.governorateId ?? null,
    livesAbroad: known?.livesAbroad ?? false,
    investAnywhere: false,
    investGovernorateIds: [],
    goalOptionId: null,
    wantsVisit: props.initialWantsVisit ? true : null,
    wantsBankFinancing: null,
    contactChannel: channelOf(known?.contactChannel),
    contactTimeOptionId: known?.contactTimeOptionId ?? null,
    consent: false,
  };
}

/** The stored channel, only if it is still one of the three this form offers. */
function channelOf(value: string | null | undefined): ContactChannel | null {
  return value === "phone" || value === "whatsapp" || value === "both" ? value : null;
}

/**
 * Rebuilds the form field by field, so keys of questions the form no longer asks are dropped, and
 * clears values that no longer exist in the Back Office lists.
 */
function sanitize(form: FormState, props: RegisterWizardProps): FormState {
  const has = (list: { id: string }[], id: unknown) => (typeof id === "string" && list.some((o) => o.id === id) ? id : null);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const yesNo = (value: unknown) => (typeof value === "boolean" ? value : null);
  const governorateIds = new Set(props.governorates.map((g) => g.id));
  return {
    fullName: text(form.fullName),
    phone: text(form.phone),
    whatsappSame: form.whatsappSame !== false,
    whatsapp: text(form.whatsapp),
    email: text(form.email),
    governorateId: form.governorateId && governorateIds.has(form.governorateId) ? form.governorateId : null,
    livesAbroad: form.livesAbroad === true,
    investAnywhere: form.investAnywhere === true,
    investGovernorateIds: Array.isArray(form.investGovernorateIds) ? form.investGovernorateIds.filter((id) => governorateIds.has(id)) : [],
    goalOptionId: has(props.goals, form.goalOptionId),
    wantsVisit: yesNo(form.wantsVisit),
    wantsBankFinancing: yesNo(form.wantsBankFinancing),
    contactChannel: form.contactChannel && form.contactChannel in CHANNEL_LABELS ? form.contactChannel : null,
    contactTimeOptionId: has(props.contactTimes, form.contactTimeOptionId),
    consent: false,
  };
}

function yesNoLabel(t: Translate, choices: YesNoChoice[], value: boolean | null): string {
  return t(choices.find((choice) => choice.value === value)?.label ?? NO_ANSWER);
}

/** The settings key of what is wrong with a phone number, or null. */
function phoneError(value: string, allowInternational: boolean): string | null {
  const compact = toWesternDigits(value).replace(/[\s.\-()]/g, "");
  if (!compact) return "ui.register.error_phone_required";
  const local = compact.replace(/^(\+216|00216)/, "");
  if (/^[2-9]\d{7}$/.test(local)) return null;
  const international = /^(\+|00)/.test(compact);
  if (international && !allowInternational) return "ui.register.error_phone_not_tunisian";
  if (international && /^(\+|00)[1-9]\d{6,14}$/.test(compact)) return null;
  return "ui.errors.invalid_phone";
}

function validateStep(step: number, form: FormState, props: RegisterWizardProps, t: Translate): Errors {
  const errors: Errors = {};
  if (step === 1) {
    if (form.fullName.trim().length < 3) errors.fullName = t("ui.errors.invalid_full_name");
    const phone = phoneError(form.phone, props.allowInternationalPhone);
    if (phone) errors.phone = t(phone);
    if (!form.whatsappSame) {
      const whatsapp = phoneError(form.whatsapp, true);
      if (whatsapp) errors.whatsapp = t(form.whatsapp.trim() ? whatsapp : "ui.register.error_whatsapp_required");
    }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      errors.email = t("ui.errors.invalid_email");
    }
    if (!form.governorateId) errors.governorateId = t("ui.register.error_governorate");
  }
  if (step === 2 && !form.investAnywhere && form.investGovernorateIds.length === 0) {
    errors.investGovernorateIds = t("ui.errors.invest_location_required");
  }
  if (step === 3 && !form.goalOptionId) errors.goalOptionId = t("ui.register.error_goal");
  if (step === 5 && !form.contactChannel) errors.contactChannel = t("ui.register.error_contact_channel");
  if (step === 6 && !form.consent) errors.consent = t("ui.errors.consent_required");
  return errors;
}

export function RegisterWizard(props: RegisterWizardProps) {
  const { recap, choices } = props;
  const t = useT();
  const [step, setStep] = useState(1);
  /** Set while the visitor fixes one answer from the review screen, so the next move returns there. */
  const [returnStep, setReturnStep] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(props));
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [requestNo, setRequestNo] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoaded = useRef(false);
  const firstRender = useRef(true);

  // LEAD-07: keep answers in this browser so a reload does not lose them. Nothing is sent before submit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY) ?? localStorage.getItem(PREVIOUS_DRAFT_KEY);
      for (const key of OLD_DRAFT_KEYS) localStorage.removeItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        // A DRAFT LEFT BY SOMEBODY ELSE IS DROPPED, NOT MERGED (0147). This is one browser on one phone,
        // and families share phones: restoring an abandoned draft over a signed-in buyer's own details
        // would put another person's name and number on his request. The draft carries whose it is, and a
        // draft from before this was recorded has no owner at all — which, once someone is signed in, is
        // exactly the case that cannot be trusted. Only the person's own draft, or any draft at all when
        // nobody is signed in, survives.
        const mine = props.prefill ? draft.personId === props.prefill.personId : true;
        if (mine) {
          // `visit=1` in the link wins over an older draft.
          const fromLink: Partial<FormState> = props.initialWantsVisit ? { wantsVisit: true } : {};
          // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after hydration
          setForm((current) => sanitize({ ...current, ...draft, ...fromLink }, props));
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // Ignore unreadable drafts.
    }
    draftLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (!draftLoaded.current || requestNo) return;
    try {
      const draft: Draft = { ...form, personId: props.prefill?.personId ?? null };
      delete draft.consent;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the form still works.
    }
  }, [form, requestNo, props.prefill]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step, requestNo]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function goNext() {
    const stepErrors = validateStep(step, form, props, t);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      focusFirstError();
      return;
    }
    setErrors({});
    if (returnStep !== null) {
      setReturnStep(null);
      setStep(returnStep);
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length));
  }

  function goBack() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setReturnStep(null);
    setErrors({});
    setStep((current) => Math.max(current - 1, 1));
  }

  /**
   * A screen that one click completes moves on by itself (owner, 2026-09-18). A list the visitor may pick several
   * from still waits for «التالي». The answer travels with the call, so the move never validates a state React has
   * not committed yet.
   */
  function advanceWith(patch: Partial<FormState>) {
    const next = { ...form, ...patch };
    setForm(next);
    setErrors({});
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      if (Object.keys(validateStep(step, next, props, t)).length === 0) {
        if (returnStep !== null) {
          setReturnStep(null);
          setStep(returnStep);
          return;
        }
        setStep((current) => Math.min(current + 1, STEPS.length));
      }
    }, AUTO_NEXT_MS);
  }

  function submit() {
    for (let s = 1; s <= STEPS.length; s += 1) {
      const stepErrors = validateStep(s, form, props, t);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setStep(s);
        focusFirstError();
        return;
      }
    }
    if (recap.error) {
      setSubmitError({ message: recap.error, calculator: true });
      return;
    }

    setSubmitError(null);
    const installments = choices.paymentMode === "installments";
    startTransition(async () => {
      try {
        const result = await submitInterest({
          fullName: form.fullName,
          phone: form.phone,
          whatsappSame: form.whatsappSame,
          whatsapp: form.whatsapp,
          email: form.email,
          governorateId: form.governorateId ?? 0,
          livesAbroad: form.livesAbroad,
          investAnywhere: form.investAnywhere,
          investGovernorateIds: form.investGovernorateIds,
          treeCountOptionId: choices.treeId,
          treeCountCustom: choices.treeId ? null : choices.treesCustom,
          scenarioId: choices.scenarioId,
          spacingClassId: choices.spacingId,
          paymentMode: choices.paymentMode,
          downPercentOptionId: installments ? choices.downPercentId : null,
          durationOptionId: installments ? choices.durationId : null,
          goalOptionId: form.goalOptionId ?? "",
          wantsVisit: form.wantsVisit,
          wantsBankFinancing: form.wantsBankFinancing,
          contactChannel: form.contactChannel ?? "phone",
          contactTimeOptionId: form.contactTimeOptionId,
          consent: true,
          website: honeypot,
          source: readVisitSource() as Record<string, string>,
        });
        if (result.ok) {
          setRequestNo(result.requestNo);
          try {
            localStorage.removeItem(DRAFT_KEY);
          } catch {
            // Nothing to clean.
          }
        } else {
          setSubmitError({ message: result.message, calculator: result.calculator === true });
          if (result.step) setStep(result.step);
        }
      } catch {
        setSubmitError({ message: t("ui.register.error_network"), calculator: false });
      }
    });
  }

  if (requestNo) {
    return (
      <Success
        requestNo={requestNo}
        // The account is offered only to someone who does not already have one (0149, the owner's answer «2»).
        invite={!props.prefill}
        form={form}
        contactTimes={props.contactTimes}
        rows={recap.rows}
        note={props.successNote}
        welcomeTitle={props.successWelcomeTitle}
        welcomeText={props.successWelcomeText}
        motivation={props.successMotivation}
        progressLabel={props.successProgressLabel}
        offers={props.offers}
        offersTitle={props.offersTitle}
        offersText={props.offersText}
        headingRef={headingRef}
      />
    );
  }

  const lastStep = step === STEPS.length;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6 pt-6 sm:px-6 sm:pt-10">
      {/* The answers live on the calculator, one screen back. From here the visitor needs the way back to them,
          and the reason when they block the request (owner, 2026-09-18: «remove the table ... keep the thing
          editable the step before»). */}
      {recap.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium leading-6 text-danger">
          {recap.error}{" "}
          <Link href={recap.editHref} className="font-semibold underline underline-offset-4 hover:no-underline">
            {recap.editLabel}
          </Link>
        </p>
      ) : step === 1 ? (
        <p className="text-sm text-muted">
          <Link href={recap.editHref} className="font-semibold text-forest underline underline-offset-4 hover:no-underline">
            {recap.editLabel}
          </Link>
        </p>
      ) : null}

      <div className="mt-6">
        <Progress step={step} total={STEPS.length} />
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (lastStep) submit();
          else goNext();
        }}
        className="mt-6"
      >
        <h1 ref={headingRef} tabIndex={-1} className="section-title outline-none">
          {t(STEPS[step - 1])}
        </h1>

        {(step === 1 || lastStep) && props.notice ? (
          <p className="mt-2 text-sm font-medium text-leaf">{props.notice}</p>
        ) : null}

        {submitError ? (
          <div role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {submitError.message}
            {submitError.calculator ? (
              <>
                {" "}
                <Link href={recap.editHref} className="font-semibold underline underline-offset-4 hover:no-underline">
                  {recap.editLabel}
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Said once, on the step that asks who the reader is — not on every step, and never in the way. */}
        {step === 1 ? (
          <div className="mt-4">
            {props.prefill ? (
              <PrefillNote name={props.prefill.fullName} returning={props.prefill.requests > 0} />
            ) : (
              <SignInHint />
            )}
          </div>
        ) : null}

        <div className="mt-6">
          {step === 1 ? <IdentityStep form={form} errors={errors} update={update} governorates={props.governorates} /> : null}
          {step === 2 ? (
            <LocationStep
              form={form}
              errors={errors}
              update={update}
              advanceWith={advanceWith}
              governorates={props.governorates}
            />
          ) : null}
          {step === 3 ? (
            <SingleChoice
              name="goal"
              legend={t(STEPS[2])}
              options={props.goals}
              value={form.goalOptionId}
              onChange={(id) => advanceWith({ goalOptionId: id })}
              error={errors.goalOptionId}
            />
          ) : null}
          {step === 4 ? <VisitStep form={form} errors={errors} update={update} /> : null}
          {step === 5 ? <ContactStep form={form} errors={errors} update={update} contactTimes={props.contactTimes} /> : null}
          {step === 6 ? (
            <ReviewStep
              form={form}
              errors={errors}
              update={update}
              editStep={(target) => {
                setReturnStep(STEPS.length);
                setStep(target);
              }}
              {...props}
            />
          ) : null}
        </div>

        {/* Honeypot for bots; hidden from people and assistive technology */}
        <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 }}>
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
          </label>
        </div>

        <div className="sticky bottom-[var(--tabbar-h)] -mx-4 mt-8 flex gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          {step > 1 ? (
            <button type="button" onClick={goBack} className="btn btn-secondary">
              {t("ui.register.back")}
            </button>
          ) : null}
          <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:min-w-48 sm:flex-none">
            {t(lastStep ? (pending ? "ui.register.sending" : "ui.register.submit") : "ui.register.next")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type StepProps = {
  form: FormState;
  errors: Errors;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
};

function IdentityStep({ form, errors, update, governorates }: StepProps & { governorates: RegisterWizardProps["governorates"] }) {
  const t = useT();
  return (
    <div className="space-y-5">
      <FormField id="fullName" label={t("ui.register.full_name_label")} error={errors.fullName}>
        <input
          id="fullName"
          className="field"
          autoComplete="name"
          value={form.fullName}
          onChange={(event) => update("fullName", event.target.value)}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
      </FormField>

      <FormField id="phone" label={t("ui.register.phone_label")} hint={t("ui.register.phone_hint")} error={errors.phone}>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          className="field text-left"
          autoComplete="tel"
          placeholder="98 123 456"
          value={form.phone}
          onChange={(event) => update("phone", event.target.value)}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
        />
      </FormField>

      <div className="space-y-3">
        <label className="flex items-center gap-3 text-label">
          <input
            type="checkbox"
            className="size-5 accent-forest"
            checked={form.whatsappSame}
            onChange={(event) => update("whatsappSame", event.target.checked)}
          />
          {t("ui.register.whatsapp_same")}
        </label>
        {!form.whatsappSame ? (
          <FormField id="whatsapp" label={t("ui.register.whatsapp_label")} error={errors.whatsapp}>
            <input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              dir="ltr"
              className="field text-left"
              placeholder="98 123 456"
              value={form.whatsapp}
              onChange={(event) => update("whatsapp", event.target.value)}
              aria-invalid={Boolean(errors.whatsapp)}
              aria-describedby={errors.whatsapp ? "whatsapp-error" : undefined}
            />
          </FormField>
        ) : null}
      </div>

      <FormField id="email" label={t("ui.register.email_label")} error={errors.email}>
        <input
          id="email"
          type="email"
          inputMode="email"
          dir="ltr"
          className="field text-left"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
      </FormField>

      {/* Asked BEFORE the governorate, because it changes what that question means: a Tunisian in Lyon has no
          governorate of residence, he has one he is from. The box rewrites the label rather than hiding the
          question — the matching and the CRM both read that column. */}
      <label className="choice items-start">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.livesAbroad}
          onChange={(event) => update("livesAbroad", event.target.checked)}
        />
        <span>
          <span className="font-semibold">{t("ui.register.abroad_label")}</span>
          <span className="mt-0.5 block text-caption text-muted">{t("ui.register.abroad_hint")}</span>
        </span>
      </label>

      <FormField
        id="governorate"
        label={form.livesAbroad ? t("ui.register.abroad_governorate_label") : t("ui.register.governorate_label")}
        hint={t("ui.register.governorate_hint")}
        error={errors.governorateId}
      >
        <select
          id="governorate"
          className="field"
          value={form.governorateId ?? ""}
          onChange={(event) => update("governorateId", event.target.value ? Number(event.target.value) : null)}
          aria-invalid={Boolean(errors.governorateId)}
          aria-describedby={errors.governorateId ? "governorate-error" : "governorate-hint"}
        >
          <option value="">{t("ui.register.governorate_placeholder")}</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}

function LocationStep({
  form,
  errors,
  update,
  advanceWith,
  governorates,
}: StepProps & { advanceWith: (patch: Partial<FormState>) => void; governorates: RegisterWizardProps["governorates"] }) {
  const t = useT();
  function toggle(id: number, checked: boolean) {
    const next = checked ? [...form.investGovernorateIds, id] : form.investGovernorateIds.filter((g) => g !== id);
    update("investGovernorateIds", next);
    if (checked) update("investAnywhere", false);
  }

  return (
    <fieldset>
      <legend className="sr-only">{t(STEPS[1])}</legend>
      <label className="choice">
        <input
          type="checkbox"
          checked={form.investAnywhere}
          onChange={(event) => {
            // One click answers the whole screen, so it carries on; picking governorates does not.
            if (event.target.checked) advanceWith({ investAnywhere: true, investGovernorateIds: [] });
            else update("investAnywhere", false);
          }}
        />
        <span className="font-semibold">{t("ui.register.anywhere")}</span>
      </label>

      <p className="mb-3 mt-6 text-sm font-semibold text-muted">{t("ui.register.or_pick_governorates")}</p>
      {/* Twenty-four names as full rows filled a phone screen on their own (owner, 2026-09-18: «takes too much
          space»). As chips they read at a glance: the tick lives in the border and the background, like the
          calculator's answers, so three fit on a line. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {governorates.map((g) => (
          <label key={g.id} className="choice min-h-11 justify-center px-2 py-2 text-center text-sm font-semibold">
            <input
              type="checkbox"
              className="sr-only"
              checked={form.investGovernorateIds.includes(g.id)}
              onChange={(event) => toggle(g.id, event.target.checked)}
            />
            <span>{g.name}</span>
          </label>
        ))}
      </div>
      <GroupError message={errors.investGovernorateIds} />
    </fieldset>
  );
}

/** Report v3 §40 asks whether the client wants a visit; §14 (decision N-9) records the wish for bank financing. */
function VisitStep({ form, update }: StepProps) {
  const t = useT();
  return (
    <div className="space-y-8">
      <p className="hint -mt-2">{t("ui.register.visit_intro")}</p>
      <YesNoGroup
        name="wantsVisit"
        legend={t("ui.register.visit_question")}
        hint={t("ui.register.visit_hint")}
        choices={VISIT_CHOICES}
        value={form.wantsVisit}
        onChange={(value) => update("wantsVisit", value)}
      />
      <YesNoGroup
        name="wantsBankFinancing"
        legend={t("ui.register.bank_question")}
        hint={t("ui.register.bank_hint")}
        choices={BANK_CHOICES}
        value={form.wantsBankFinancing}
        onChange={(value) => update("wantsBankFinancing", value)}
      />
    </div>
  );
}

function ContactStep({ form, errors, update, contactTimes }: StepProps & { contactTimes: Option[] }) {
  const t = useT();
  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="label text-base">{t("ui.register.contact_channel_legend")}</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((channel) => (
            <label key={channel} className="choice">
              <input
                type="radio"
                name="contactChannel"
                checked={form.contactChannel === channel}
                onChange={() => update("contactChannel", channel)}
              />
              <span className="font-semibold">{t(CHANNEL_LABELS[channel])}</span>
            </label>
          ))}
        </div>
        <GroupError message={errors.contactChannel} />
      </fieldset>

      {contactTimes.length > 0 ? (
        <fieldset>
          <legend className="label text-base">{t("ui.register.contact_time_legend")}</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {contactTimes.map((time) => (
              <label key={time.id} className="choice">
                <input
                  type="radio"
                  name="contactTime"
                  checked={form.contactTimeOptionId === time.id}
                  onChange={() => update("contactTimeOptionId", time.id)}
                />
                <span className="font-semibold">{time.label}</span>
              </label>
            ))}
            <label className="choice">
              <input
                type="radio"
                name="contactTime"
                checked={form.contactTimeOptionId === null}
                onChange={() => update("contactTimeOptionId", null)}
              />
              <span className="font-semibold">{t("ui.register.contact_time_any")}</span>
            </label>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function ReviewStep({
  form,
  errors,
  update,
  editStep,
  governorates,
  goals,
  contactTimes,
  consentText,
}: StepProps & RegisterWizardProps & { editStep: (step: number) => void }) {
  const t = useT();
  // Between place names: the Arabic comma (U+060C) on the Arabic page, the Latin one elsewhere. Punctuation, not
  // words, so it follows the script rather than a setting.
  const separator = useDir() === "rtl" ? "\u060C " : ", ";
  const label = (list: Option[], id: string | null) => list.find((o) => o.id === id)?.label ?? "—";
  const governorate = governorates.find((g) => g.id === form.governorateId)?.name;

  const rows: { step: number; label: string; value: ReactNode }[] = [
    { step: 1, label: t("ui.register.review_name"), value: form.fullName },
    { step: 1, label: t("ui.register.review_phone"), value: <span dir="ltr">{form.phone}</span> },
    ...(!form.whatsappSame
      ? [{ step: 1, label: t("ui.register.review_whatsapp"), value: <span dir="ltr">{form.whatsapp}</span> }]
      : []),
    ...(form.email.trim() ? [{ step: 1, label: t("ui.register.review_email"), value: <span dir="ltr">{form.email}</span> }] : []),
    { step: 1, label: t("ui.register.review_residence"), value: governorate ?? "—" },
    {
      step: 2,
      label: t("ui.register.review_invest_place"),
      value: form.investAnywhere
        ? t("ui.register.anywhere")
        : governorates.filter((g) => form.investGovernorateIds.includes(g.id)).map((g) => g.name).join(separator),
    },
    { step: 3, label: t("ui.register.review_goal"), value: label(goals, form.goalOptionId) },
    { step: 4, label: t("ui.register.review_visit"), value: yesNoLabel(t, VISIT_CHOICES, form.wantsVisit) },
    { step: 4, label: t("ui.register.review_bank"), value: yesNoLabel(t, BANK_CHOICES, form.wantsBankFinancing) },
    {
      step: 5,
      label: t("ui.register.review_contact"),
      value: [
        form.contactChannel ? t(CHANNEL_LABELS[form.contactChannel]) : null,
        form.contactTimeOptionId ? label(contactTimes, form.contactTimeOptionId) : t("ui.register.contact_time_any"),
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  return (
    <div className="space-y-6">
      <dl className="panel divide-y divide-line px-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="mt-0.5 font-semibold break-words text-ink">{row.value}</dd>
            </div>
            <button type="button" onClick={() => editStep(row.step)} className="flex-none text-sm font-semibold text-forest underline-offset-4 hover:underline">
              {t("ui.register.review_edit")}
            </button>
          </div>
        ))}
      </dl>

      <label className="choice items-start">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.consent}
          onChange={(event) => update("consent", event.target.checked)}
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={errors.consent ? "consent-error" : undefined}
        />
        <span className="text-label leading-7">{consentText}</span>
      </label>
      {errors.consent ? (
        <p id="consent-error" className="error-text -mt-4">
          {errors.consent}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Progress({ step, total }: { step: number; total: number }) {
  const t = useT();
  return (
    <div>
      <p className="text-sm font-medium text-muted tabular-nums">{t("ui.register.progress", { step, total })}</p>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={t("ui.register.progress_label")}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-leaf transition-[width] duration-300" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  );
}
function GroupError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" tabIndex={-1} data-error-anchor className="error-text mt-3 outline-none">
      {message}
    </p>
  );
}

function SingleChoice({
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label key={option.id} className="choice">
          <input type="radio" name={name} checked={value === option.id} onChange={() => onChange(option.id)} />
          <span className="font-semibold">{option.label}</span>
        </label>
      ))}
      <GroupError message={error} />
    </fieldset>
  );
}

function YesNoGroup({
  name,
  legend,
  hint,
  choices,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  hint: string;
  choices: YesNoChoice[];
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  const t = useT();
  return (
    <fieldset>
      <legend className="label text-base">{legend}</legend>
      <p className="hint mb-3">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <label key={String(choice.value)} className="choice">
            <input type="radio" name={name} checked={value === choice.value} onChange={() => onChange(choice.value)} />
            <span className="font-semibold">{t(choice.label)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Success({
  requestNo,
  invite,
  form,
  contactTimes,
  rows,
  note,
  welcomeTitle,
  welcomeText,
  motivation,
  progressLabel,
  offers,
  offersTitle,
  offersText,
  headingRef,
}: {
  requestNo: string;
  /** Offer the reader an account: true only when nobody is signed in. */
  invite: boolean;
  form: FormState;
  contactTimes: Option[];
  rows: RecapRow[];
  note: string;
  welcomeTitle: string;
  welcomeText: string;
  motivation: string;
  progressLabel: string;
  offers: SuccessOffer[];
  offersTitle: string;
  offersText: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  /** The confirmation is a popup over this page; closing it leaves the page standing. */
  const [open, setOpen] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The channel the request was sent with (submit() falls back to the phone, and step 5 requires one anyway).
  const channel: ContactChannel = form.contactChannel ?? "phone";
  const time = contactTimes.find((option) => option.id === form.contactTimeOptionId)?.label;
  /** «ابتداءً من {price} للزيتونة»: the words around the figure, so the figure keeps its own size. */
  const [priceBefore, priceAfter] = t("ui.register.offer_price_per_tree", { price: PRICE_SLOT }).split(PRICE_SLOT);
  // The total price appears only when it was shown in the recap, i.e. while prices were open to this visitor.
  const recap = SUCCESS_ROWS.flatMap((key) => rows.filter((row) => row.key === key));
  const contactLine = time
    ? t("ui.register.success_contact_at_time", { channel, time })
    : t("ui.register.success_contact", { channel });

  /*
   * OPEN IS STATE AND THE DIALOG FOLLOWS IT — admin/v2/popup.tsx's rule, for its reasons: nothing reads
   * `ref.current` while rendering, and `onClose` keeps the boolean honest when the browser shuts the dialog
   * itself, which Esc does.
   *
   * THE HEADING TAKES THE FOCUS IN THE SAME BREATH AS THE CLOSE, and it belongs here rather than in the
   * button's handler. Everything behind a modal dialog is inert, so a focus() that runs before close() has
   * is a no-op and the reader is dropped on <body> — which is exactly what the first version did, measured
   * in the browser. One line after close() the page is live again and the heading can take it.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      headingRef.current?.focus();
    }
  }, [open, headingRef]);

  const close = () => setOpen(false);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(requestNo);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  /** The same button in the popup and on the page, because the number must be copyable from either. */
  const copyButton = (
    <button type="button" className="btn btn-ghost min-h-10 shrink-0 text-sm" onClick={() => void copyNumber()}>
      {t(copied ? "ui.register.number_copied" : "ui.register.copy_number")}
    </button>
  );

  const tick = (
    <svg viewBox="0 0 24 24" className="size-6 text-forest" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <>
      {/*
        WHAT IS LEFT WHEN THE POPUP GOES, and it is deliberately not the celebration.

        The owner: «after submitting a form I don't like the page of ‹we got your thing›, make it a simple
        popup with an X». The page under it is not a second confirmation — it is the request number, kept
        where closing a dialog cannot lose it, his own words of welcome, and the offers he asked to appear
        after the send (2026-09-18). The interruption is the popup; this is the record.
      */}
      <div className="mx-auto max-w-xl px-4 pb-14 pt-10 sm:px-6">
        <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf-soft">{tick}</div>
          <div className="min-w-0 flex-1">
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-lg font-bold text-forest outline-none">
              {t("ui.register.success_title")}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {t("ui.register.request_number_label")}{" "}
              {/* AGZ-2026-000045 is Latin letters and digits: read left to right on an Arabic page too. */}
              <span dir="ltr" className="font-semibold text-ink tabular-nums">
                {requestNo}
              </span>
            </p>
          </div>
          {copyButton}
        </div>

        {welcomeText ? <p className="mt-6 leading-7 text-ink/80">{welcomeText}</p> : null}

        {recap.length > 0 ? (
          <dl className="panel mt-6 divide-y divide-line px-4">
            {recap.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="text-end font-semibold text-ink tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {motivation ? (
          <p className="mt-6 rounded-2xl bg-leaf-soft/70 px-5 py-4 font-medium leading-7 text-forest">{motivation}</p>
        ) : null}

        {/* After the request is in, never before it: the offer must not stand between the reader and sending. */}
        {invite ? <AccountInvite phone={form.phone} /> : null}

        <div className="mt-8 flex flex-wrap gap-3">
          {progressLabel ? (
            <Link href="/#million" className="btn btn-primary">
              {progressLabel}
            </Link>
          ) : null}
          <Link href="/" className="btn btn-secondary">
            {t("ui.register.home_link")}
          </Link>
        </div>

        {/* Owner 2026-09-18: «in the end show the current offers after the send». Each one opens its own page,
            where it has its own form; this screen never mixes the two flows. */}
        {offers.length > 0 && offersTitle ? (
          <section className="mt-12">
            <h2 className="text-center font-display text-2xl font-bold text-forest">{offersTitle}</h2>
            {offersText ? <p className="mx-auto mt-2 max-w-md text-center leading-7 text-muted">{offersText}</p> : null}
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {offers.map((offer) => (
                <li key={offer.code} className="card overflow-hidden">
                  <Link href={offer.href} className="block h-full focus-visible:outline-offset-[-2px]">
                    {offer.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote cover, sized by its box
                      <img src={offer.coverUrl} alt={offer.coverAlt ?? ""} className="aspect-3/2 w-full object-cover" />
                    ) : null}
                    <div className="p-4">
                      <h3 className="font-semibold text-ink">{offer.name}</h3>
                      <p className="mt-0.5 text-sm text-muted">{offer.place}</p>
                      <dl className="mt-3 space-y-1.5 text-sm">
                        {offer.trees ? (
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">{t("ui.register.offer_trees")}</dt>
                            <dd className="font-semibold text-ink tabular-nums">{offer.trees}</dd>
                          </div>
                        ) : null}
                        {offer.areaPerTree ? (
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted">{t("ui.register.offer_area_per_tree")}</dt>
                            <dd className="font-semibold text-ink tabular-nums">{offer.areaPerTree}</dd>
                          </div>
                        ) : null}
                      </dl>
                      {offer.pricePerTree ? (
                        <p className="mt-3 border-t border-line pt-3 text-sm">
                          {priceBefore ? <span className="text-muted">{priceBefore}</span> : null}
                          <span className="font-display text-xl font-bold text-forest tabular-nums">{offer.pricePerTree}</span>
                          {priceAfter ? <span className="text-muted">{priceAfter}</span> : null}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/*
        THE CONFIRMATION, AS A NATIVE <dialog>. showModal() gives the top layer, a real backdrop, Esc, focus
        trapping and inertness on everything behind — every one of which a div with a z-index has to
        reimplement, and the version everyone writes forgets the last three. It holds only what a visitor
        needs in the first ten seconds: that it arrived, the number, and who rings them. Everything longer
        is on the page behind, which is still there when this closes.
      */}
      <dialog
        ref={dialogRef}
        className="popup"
        aria-labelledby="register-success-title"
        onClose={close}
        onClick={(event) => {
          // The panel is a child, so a press that landed on it is not a press on the backdrop.
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className="popup-panel">
          <div className="flex items-start gap-3 px-4 pt-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-leaf-soft">{tick}</div>
            <div className="min-w-0 flex-1">
              <h2 id="register-success-title" className="font-display text-xl font-bold text-forest">
                {t("ui.register.success_title")}
              </h2>
              {welcomeTitle ? <p className="mt-0.5 font-semibold text-gold">{welcomeTitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("ui.common.close")}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-paper hover:text-forest"
            >
              ✕
            </button>
          </div>

          <div className="px-4 pb-5 pt-4">
            <p className="text-sm text-muted">{t("ui.register.request_number_label")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p dir="ltr" className="font-display text-3xl font-bold tracking-wide text-ink tabular-nums">
                {requestNo}
              </p>
              {copyButton}
            </div>
            <p className="mt-3 leading-7 text-muted">{contactLine}</p>
            {note ? <p className="mt-2 text-sm font-medium text-leaf">{note}</p> : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
