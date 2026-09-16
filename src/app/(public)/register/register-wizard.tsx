"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { readVisitSource } from "@/components/site/source-capture";
import { toWesternDigits } from "@/lib/digits";

import type { CalculatorChoices, SummaryRowKey } from "../start/calculator-summary";
import { submitInterest } from "./actions";

type Option = { id: string; code: string | null; label_ar: string };

/** One line of «اختياراتك في الحاسبة», formatted on the server (Arabic only on /register). */
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
  governorates: { id: number; name_ar: string }[];
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
};

type ContactChannel = "phone" | "whatsapp" | "both";

type FormState = {
  fullName: string;
  phone: string;
  whatsappSame: boolean;
  whatsapp: string;
  email: string;
  governorateId: number | null;
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

const STEPS = [
  "بياناتك",
  "أين ترغب في الاستثمار؟",
  "ما هو هدفك؟",
  "الزيارة والتمويل",
  "كيف تحب نتصلوا بيك؟",
  "راجع طلبك",
] as const;

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "مكالمة هاتفية",
  whatsapp: "WhatsApp",
  both: "الاثنين",
};

type YesNoChoice = { value: boolean; label: string };
const VISIT_CHOICES: YesNoChoice[] = [
  { value: true, label: "نعم" },
  { value: false, label: "لا، مازال" },
];
const BANK_CHOICES: YesNoChoice[] = [
  { value: true, label: "نعم" },
  { value: false, label: "لا" },
];
const NO_ANSWER = "بدون إجابة";

/** What the success screen recaps, in this order. */
const SUCCESS_ROWS: SummaryRowKey[] = ["trees", "area_per_tree", "total_area", "payment", "total_price"];

// The calculator answers moved to the URL (P2-6); an older draft still gives back the identity and contact answers.
const DRAFT_KEY = "agrized:register-draft-v4";
const PREVIOUS_DRAFT_KEY = "agrized:register-draft-v3";
const OLD_DRAFT_KEYS = ["agrized:register-draft", PREVIOUS_DRAFT_KEY];

function emptyForm(props: RegisterWizardProps): FormState {
  return {
    fullName: "",
    phone: "",
    whatsappSame: true,
    whatsapp: "",
    email: "",
    governorateId: null,
    investAnywhere: false,
    investGovernorateIds: [],
    goalOptionId: null,
    wantsVisit: props.initialWantsVisit ? true : null,
    wantsBankFinancing: null,
    contactChannel: null,
    contactTimeOptionId: null,
    consent: false,
  };
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

function yesNoLabel(choices: YesNoChoice[], value: boolean | null): string {
  return choices.find((choice) => choice.value === value)?.label ?? NO_ANSWER;
}

function phoneError(value: string, allowInternational: boolean): string | null {
  const compact = toWesternDigits(value).replace(/[\s.\-()]/g, "");
  if (!compact) return "اكتب رقم الهاتف.";
  const local = compact.replace(/^(\+216|00216)/, "");
  if (/^[2-9]\d{7}$/.test(local)) return null;
  const international = /^(\+|00)/.test(compact);
  if (international && !allowInternational) return "نقبل حالياً الأرقام التونسية فقط. اكتب رقماً من 8 أرقام.";
  if (international && /^(\+|00)[1-9]\d{6,14}$/.test(compact)) return null;
  return "رقم الهاتف غير صحيح. اكتب 8 أرقام، مثال: 98 123 456.";
}

function validateStep(step: number, form: FormState, props: RegisterWizardProps): Errors {
  const errors: Errors = {};
  if (step === 1) {
    if (form.fullName.trim().length < 3) errors.fullName = "اكتب الاسم واللقب كاملين.";
    const phone = phoneError(form.phone, props.allowInternationalPhone);
    if (phone) errors.phone = phone;
    if (!form.whatsappSame) {
      const whatsapp = phoneError(form.whatsapp, true);
      if (whatsapp) errors.whatsapp = form.whatsapp.trim() ? whatsapp : "اكتب رقم WhatsApp، أو اختر «نفس رقم الهاتف».";
    }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      errors.email = "البريد الإلكتروني غير صحيح. مثال: nom@exemple.tn";
    }
    if (!form.governorateId) errors.governorateId = "اختر ولايتك.";
  }
  if (step === 2 && !form.investAnywhere && form.investGovernorateIds.length === 0) {
    errors.investGovernorateIds = "اختر ولاية واحدة على الأقل، أو «المكان غير مهم».";
  }
  if (step === 3 && !form.goalOptionId) errors.goalOptionId = "اختر هدفك.";
  if (step === 5 && !form.contactChannel) errors.contactChannel = "اختر طريقة التواصل.";
  if (step === 6 && !form.consent) errors.consent = "لإرسال الطلب، وافق على التواصل ومعالجة معطياتك.";
  return errors;
}

function focusFirstError() {
  // setTimeout (not requestAnimationFrame) so it also runs after React commits in background tabs.
  setTimeout(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-anchor]')?.focus();
  }, 0);
}

export function RegisterWizard(props: RegisterWizardProps) {
  const { recap, choices } = props;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => emptyForm(props));
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [requestNo, setRequestNo] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftLoaded = useRef(false);
  const firstRender = useRef(true);

  // LEAD-07: keep answers in this browser so a reload does not lose them. Nothing is sent before submit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY) ?? localStorage.getItem(PREVIOUS_DRAFT_KEY);
      for (const key of OLD_DRAFT_KEYS) localStorage.removeItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormState>;
        // `visit=1` in the link wins over an older draft.
        const fromLink: Partial<FormState> = props.initialWantsVisit ? { wantsVisit: true } : {};
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after hydration
        setForm((current) => sanitize({ ...current, ...draft, ...fromLink }, props));
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
      const draft: Partial<FormState> = { ...form };
      delete draft.consent;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the form still works.
    }
  }, [form, requestNo]);

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
    const stepErrors = validateStep(step, form, props);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      focusFirstError();
      return;
    }
    setErrors({});
    setStep((current) => Math.min(current + 1, STEPS.length));
  }

  function goBack() {
    setErrors({});
    setStep((current) => Math.max(current - 1, 1));
  }

  function submit() {
    for (let s = 1; s <= STEPS.length; s += 1) {
      const stepErrors = validateStep(s, form, props);
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
        setSubmitError({ message: "تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.", calculator: false });
      }
    });
  }

  if (requestNo) {
    return (
      <Success
        requestNo={requestNo}
        form={form}
        contactTimes={props.contactTimes}
        rows={recap.rows}
        note={props.successNote}
        welcomeTitle={props.successWelcomeTitle}
        welcomeText={props.successWelcomeText}
        motivation={props.successMotivation}
        progressLabel={props.successProgressLabel}
        headingRef={headingRef}
      />
    );
  }

  const lastStep = step === STEPS.length;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6 pt-6 sm:px-6 sm:pt-10">
      <RecapCard recap={recap} />

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
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-bold text-balance text-forest outline-none sm:text-4xl">
          {STEPS[step - 1]}
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

        <div className="mt-6">
          {step === 1 ? <IdentityStep form={form} errors={errors} update={update} governorates={props.governorates} /> : null}
          {step === 2 ? <LocationStep form={form} errors={errors} update={update} governorates={props.governorates} /> : null}
          {step === 3 ? (
            <SingleChoice
              name="goal"
              legend={STEPS[2]}
              options={props.goals}
              value={form.goalOptionId}
              onChange={(id) => update("goalOptionId", id)}
              error={errors.goalOptionId}
            />
          ) : null}
          {step === 4 ? <VisitStep form={form} errors={errors} update={update} /> : null}
          {step === 5 ? <ContactStep form={form} errors={errors} update={update} contactTimes={props.contactTimes} /> : null}
          {step === 6 ? <ReviewStep form={form} errors={errors} update={update} setStep={setStep} {...props} /> : null}
        </div>

        {/* Honeypot for bots; hidden from people and assistive technology */}
        <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 }}>
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
          </label>
        </div>

        <div className="sticky bottom-0 -mx-4 mt-8 flex gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          {step > 1 ? (
            <button type="button" onClick={goBack} className="btn btn-secondary">
              رجوع
            </button>
          ) : null}
          <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:min-w-48 sm:flex-none">
            {lastStep ? (pending ? "جارٍ الإرسال…" : "أرسل الطلب") : "التالي"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculator recap
// ---------------------------------------------------------------------------

/** P2-6: what was answered on /start, read-only; changing it means going back to the calculator. */
function RecapCard({ recap }: { recap: CalculatorRecap }) {
  return (
    <section aria-labelledby="calculator-recap-title" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      {/* Not a heading: the step title below stays the page's first heading. */}
      <div className="flex items-baseline justify-between gap-3">
        <p id="calculator-recap-title" className="font-display text-lg font-bold text-forest">
          {recap.title}
        </p>
        <Link href={recap.editHref} className="flex-none text-sm font-semibold text-forest underline underline-offset-4 hover:no-underline">
          {recap.editLabel}
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {recap.rows.map((row) => (
          <div key={row.key} className="min-w-0">
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="mt-0.5 font-semibold break-words text-ink tabular-nums">
              {row.value}
              {row.notes.map((note) => (
                <span key={note} className="mt-0.5 block text-xs font-normal text-muted">
                  {note}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {recap.notice ? <p className="mt-3 rounded-xl bg-leaf-soft px-3 py-2 text-sm leading-6 text-forest">{recap.notice}</p> : null}
      {recap.error ? (
        <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium leading-6 text-danger">
          {recap.error}{" "}
          <Link href={recap.editHref} className="font-semibold underline underline-offset-4 hover:no-underline">
            {recap.editLabel}
          </Link>
        </p>
      ) : null}
      {recap.estimateNote ? <p className="mt-3 text-xs leading-5 text-muted">{recap.estimateNote}</p> : null}
    </section>
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
  return (
    <div className="space-y-5">
      <Field id="fullName" label="الاسم واللقب" error={errors.fullName}>
        <input
          id="fullName"
          className="field"
          autoComplete="name"
          value={form.fullName}
          onChange={(event) => update("fullName", event.target.value)}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
      </Field>

      <Field id="phone" label="رقم الهاتف" hint="8 أرقام، مثال: 98 123 456" error={errors.phone}>
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
      </Field>

      <div className="space-y-3">
        <label className="flex items-center gap-3 text-[0.95rem]">
          <input
            type="checkbox"
            className="size-5 accent-forest"
            checked={form.whatsappSame}
            onChange={(event) => update("whatsappSame", event.target.checked)}
          />
          رقم WhatsApp هو نفس رقم الهاتف
        </label>
        {!form.whatsappSame ? (
          <Field id="whatsapp" label="رقم WhatsApp" error={errors.whatsapp}>
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
          </Field>
        ) : null}
      </div>

      <Field id="email" label="البريد الإلكتروني (اختياري)" error={errors.email}>
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
      </Field>

      <Field id="governorate" label="الولاية" hint="ولاية إقامتك." error={errors.governorateId}>
        <select
          id="governorate"
          className="field"
          value={form.governorateId ?? ""}
          onChange={(event) => update("governorateId", event.target.value ? Number(event.target.value) : null)}
          aria-invalid={Boolean(errors.governorateId)}
          aria-describedby={errors.governorateId ? "governorate-error" : "governorate-hint"}
        >
          <option value="">اختر الولاية</option>
          {governorates.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function LocationStep({ form, errors, update, governorates }: StepProps & { governorates: RegisterWizardProps["governorates"] }) {
  function toggle(id: number, checked: boolean) {
    const next = checked ? [...form.investGovernorateIds, id] : form.investGovernorateIds.filter((g) => g !== id);
    update("investGovernorateIds", next);
    if (checked) update("investAnywhere", false);
  }

  return (
    <fieldset>
      <legend className="sr-only">أين ترغب في الاستثمار؟</legend>
      <label className="choice">
        <input
          type="checkbox"
          checked={form.investAnywhere}
          onChange={(event) => {
            update("investAnywhere", event.target.checked);
            if (event.target.checked) update("investGovernorateIds", []);
          }}
        />
        <span className="font-semibold">المكان غير مهم</span>
      </label>

      <p className="mb-3 mt-6 text-sm font-semibold text-muted">أو اختر ولاية أو أكثر</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {governorates.map((g) => (
          <label key={g.id} className="choice min-h-12 py-2">
            <input
              type="checkbox"
              checked={form.investGovernorateIds.includes(g.id)}
              onChange={(event) => toggle(g.id, event.target.checked)}
            />
            <span>{g.name_ar}</span>
          </label>
        ))}
      </div>
      <GroupError message={errors.investGovernorateIds} />
    </fieldset>
  );
}

/** Report v3 §40 asks whether the client wants a visit; §14 (decision N-9) records the wish for bank financing. */
function VisitStep({ form, update }: StepProps) {
  return (
    <div className="space-y-8">
      <p className="hint -mt-2">سؤالين اختياريين: تنجم تعدّي للخطوة الموالية بلا ما تجاوب.</p>
      <YesNoGroup
        name="wantsVisit"
        legend="تحب تزور الأرض؟"
        hint="جوابك يعاونّا نحضّرولك زيارة للأرض."
        choices={VISIT_CHOICES}
        value={form.wantsVisit}
        onChange={(value) => update("wantsVisit", value)}
      />
      <YesNoGroup
        name="wantsBankFinancing"
        legend="تحب حل تمويل بنكي؟"
        hint="التمويل البنكي خيار مستقل على التقسيط مع AgriZed. جوابك ما يلزمك بشيء."
        choices={BANK_CHOICES}
        value={form.wantsBankFinancing}
        onChange={(value) => update("wantsBankFinancing", value)}
      />
    </div>
  );
}

function ContactStep({ form, errors, update, contactTimes }: StepProps & { contactTimes: Option[] }) {
  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="label text-base">طريقة التواصل</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((channel) => (
            <label key={channel} className="choice">
              <input
                type="radio"
                name="contactChannel"
                checked={form.contactChannel === channel}
                onChange={() => update("contactChannel", channel)}
              />
              <span className="font-semibold">{CHANNEL_LABELS[channel]}</span>
            </label>
          ))}
        </div>
        <GroupError message={errors.contactChannel} />
      </fieldset>

      {contactTimes.length > 0 ? (
        <fieldset>
          <legend className="label text-base">الوقت المفضل (اختياري)</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {contactTimes.map((time) => (
              <label key={time.id} className="choice">
                <input
                  type="radio"
                  name="contactTime"
                  checked={form.contactTimeOptionId === time.id}
                  onChange={() => update("contactTimeOptionId", time.id)}
                />
                <span className="font-semibold">{time.label_ar}</span>
              </label>
            ))}
            <label className="choice">
              <input
                type="radio"
                name="contactTime"
                checked={form.contactTimeOptionId === null}
                onChange={() => update("contactTimeOptionId", null)}
              />
              <span className="font-semibold">أي وقت</span>
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
  setStep,
  governorates,
  goals,
  contactTimes,
  consentText,
}: StepProps & RegisterWizardProps & { setStep: (step: number) => void }) {
  const label = (list: Option[], id: string | null) => list.find((o) => o.id === id)?.label_ar ?? "—";
  const governorate = governorates.find((g) => g.id === form.governorateId)?.name_ar;

  const rows: { step: number; label: string; value: ReactNode }[] = [
    { step: 1, label: "الاسم", value: form.fullName },
    { step: 1, label: "الهاتف", value: <span dir="ltr">{form.phone}</span> },
    ...(!form.whatsappSame ? [{ step: 1, label: "WhatsApp", value: <span dir="ltr">{form.whatsapp}</span> }] : []),
    ...(form.email.trim() ? [{ step: 1, label: "البريد", value: <span dir="ltr">{form.email}</span> }] : []),
    { step: 1, label: "ولاية الإقامة", value: governorate ?? "—" },
    {
      step: 2,
      label: "مكان الاستثمار",
      value: form.investAnywhere
        ? "المكان غير مهم"
        : governorates.filter((g) => form.investGovernorateIds.includes(g.id)).map((g) => g.name_ar).join("، "),
    },
    { step: 3, label: "الهدف", value: label(goals, form.goalOptionId) },
    { step: 4, label: "زيارة الأرض", value: yesNoLabel(VISIT_CHOICES, form.wantsVisit) },
    { step: 4, label: "تمويل بنكي", value: yesNoLabel(BANK_CHOICES, form.wantsBankFinancing) },
    {
      step: 5,
      label: "التواصل",
      value: [
        form.contactChannel ? CHANNEL_LABELS[form.contactChannel] : null,
        form.contactTimeOptionId ? label(contactTimes, form.contactTimeOptionId) : "أي وقت",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  return (
    <div className="space-y-6">
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="mt-0.5 font-semibold break-words text-ink">{row.value}</dd>
            </div>
            <button type="button" onClick={() => setStep(row.step)} className="flex-none text-sm font-semibold text-forest underline-offset-4 hover:underline">
              تعديل
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
        <span className="text-[0.95rem] leading-7">{consentText}</span>
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
        aria-label="التقدم في الطلب"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-leaf transition-[width] duration-300" style={{ width: `${(step / total) * 100}%` }} />
      </div>
    </div>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="hint mt-1.5">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="error-text">
          {error}
        </p>
      ) : null}
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
          <span className="font-semibold">{option.label_ar}</span>
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
  return (
    <fieldset>
      <legend className="label text-base">{legend}</legend>
      <p className="hint mb-3">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <label key={String(choice.value)} className="choice">
            <input type="radio" name={name} checked={value === choice.value} onChange={() => onChange(choice.value)} />
            <span className="font-semibold">{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Success({
  requestNo,
  form,
  contactTimes,
  rows,
  note,
  welcomeTitle,
  welcomeText,
  motivation,
  progressLabel,
  headingRef,
}: {
  requestNo: string;
  form: FormState;
  contactTimes: Option[];
  rows: RecapRow[];
  note: string;
  welcomeTitle: string;
  welcomeText: string;
  motivation: string;
  progressLabel: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const channel = form.contactChannel ? CHANNEL_LABELS[form.contactChannel] : null;
  const time = contactTimes.find((t) => t.id === form.contactTimeOptionId)?.label_ar;
  // The total price appears only when it was shown in the recap, i.e. while prices were open to this visitor.
  const recap = SUCCESS_ROWS.flatMap((key) => rows.filter((row) => row.key === key));

  return (
    <div className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-leaf-soft">
        <svg viewBox="0 0 24 24" className="size-8 text-forest" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {/* The site-wide «سجّل اهتمامك» bar has no place here: this visitor just registered. */}
      <style>{`[data-sticky-cta]{display:none !important}`}</style>

      <h1 ref={headingRef} tabIndex={-1} className="mt-6 font-display text-4xl font-bold text-forest outline-none">
        تم تسجيل مطلبك
      </h1>
      {welcomeTitle ? <p className="mt-3 font-display text-2xl font-bold text-gold">{welcomeTitle}</p> : null}
      {welcomeText ? <p className="mx-auto mt-3 max-w-md leading-7 text-ink/80">{welcomeText}</p> : null}

      <p className="mt-6 text-sm text-muted">رقم مطلبك</p>
      <p dir="ltr" className="mt-1 font-display text-4xl font-bold tracking-wide text-ink tabular-nums sm:text-5xl">
        {requestNo}
      </p>
      <button
        type="button"
        className="btn btn-ghost mt-2 min-h-10 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(requestNo);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "تم نسخ الرقم" : "نسخ الرقم"}
      </button>

      {recap.length > 0 ? (
        <dl className="mx-auto mt-8 max-w-md divide-y divide-line rounded-2xl border border-line bg-surface px-4 text-start">
          {recap.map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="text-end font-semibold text-ink tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="mx-auto mt-6 max-w-md leading-7 text-muted">
        احتفظ بهذا الرقم. سيتصل بك فريق AgriZed
        {channel ? ` عبر ${channel}` : ""}
        {time ? ` (${time})` : ""} عند دراسة طلبك.
      </p>
      {note ? <p className="mt-3 text-sm font-medium text-leaf">{note}</p> : null}

      {motivation ? (
        <p className="mx-auto mt-8 max-w-md rounded-2xl bg-leaf-soft/70 px-5 py-4 font-medium leading-7 text-forest">
          {motivation}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {progressLabel ? (
          <Link href="/#million" className="btn btn-primary">
            {progressLabel}
          </Link>
        ) : null}
        <Link href="/" className="btn btn-secondary">
          العودة للصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
