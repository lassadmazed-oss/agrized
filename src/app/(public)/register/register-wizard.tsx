"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { GrowthIcon } from "@/components/site/growth-icon";
import { readVisitSource } from "@/components/site/source-capture";
import { toWesternDigits } from "@/lib/digits";
import { formatCount } from "@/lib/format";

import { submitInterest } from "./actions";

type Option = { id: string; code: string | null; label_ar: string };

type Scenario = {
  id: string;
  code: string;
  label_ar: string;
  description_ar: string | null;
  is_any: boolean;
  icon_code: string | null;
  image_url: string | null;
  image_alt_ar: string | null;
};

type RegisterWizardProps = {
  governorates: { id: number; name_ar: string }[];
  scenarios: Scenario[];
  treeCounts: Option[];
  desiredAreas: Option[];
  priorities: Option[];
  goals: Option[];
  downPayments: Option[];
  installments: Option[];
  contactTimes: Option[];
  allowMultipleScenarios: boolean;
  allowInternationalPhone: boolean;
  notice: string;
  consentText: string;
  initialDownPaymentId?: string;
  initialInstallmentId?: string;
  /** Chosen on the home page, in «قدّاش زيتونة تحب تبدا بيهم؟» (MIL-01). */
  initialTreeCountId?: string;
  /** Typed on /start instead of picking a card (MIL-01); the page already checked the limits. */
  initialTreeCountCustom?: number;
  customTreesMin: number;
  customTreesMax: number;
  initialScenarioId?: string;
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
  scenarioIds: string[];
  treeCountOptionId: string | null;
  treeCountCustom: number | null;
  desiredAreaOptionId: string | null;
  priorityOptionId: string | null;
  goalOptionId: string | null;
  downPaymentOptionId: string | null;
  installmentOptionId: string | null;
  contactChannel: ContactChannel | null;
  contactTimeOptionId: string | null;
  consent: boolean;
};

type Errors = Partial<Record<keyof FormState, string>>;

const STEPS = [
  "بياناتك",
  "أين ترغب في الاستثمار؟",
  "شنوّة تحب تملك؟",
  "قدّاش زيتونة؟",
  "ما هو هدفك؟",
  "شنوّة الأهم بالنسبة ليك؟",
  "قدرتك المالية",
  "كيف تحب نتصلوا بيك؟",
  "راجع طلبك",
] as const;

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "مكالمة هاتفية",
  whatsapp: "WhatsApp",
  both: "الاثنين",
};

const DRAFT_KEY = "agrized:register-draft";

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
    scenarioIds: props.initialScenarioId ? [props.initialScenarioId] : [],
    treeCountOptionId: props.initialTreeCountId ?? null,
    treeCountCustom: props.initialTreeCountId ? null : (props.initialTreeCountCustom ?? null),
    desiredAreaOptionId: null,
    priorityOptionId: null,
    goalOptionId: null,
    downPaymentOptionId: props.initialDownPaymentId ?? null,
    installmentOptionId: props.initialInstallmentId ?? null,
    contactChannel: null,
    contactTimeOptionId: null,
    consent: false,
  };
}

/** Drops draft values that no longer exist in the Back Office lists. */
function sanitize(form: FormState, props: RegisterWizardProps): FormState {
  const has = (list: { id: string }[], id: string | null) => (id && list.some((o) => o.id === id) ? id : null);
  const governorateIds = new Set(props.governorates.map((g) => g.id));
  const scenarioIds = new Set(props.scenarios.map((s) => s.id));
  const treeCountOptionId = has(props.treeCounts, form.treeCountOptionId);
  return {
    ...form,
    governorateId: form.governorateId && governorateIds.has(form.governorateId) ? form.governorateId : null,
    investGovernorateIds: form.investGovernorateIds.filter((id) => governorateIds.has(id)),
    scenarioIds: form.scenarioIds.filter((id) => scenarioIds.has(id)),
    treeCountOptionId,
    // A listed option and a typed number never coexist; the option wins.
    treeCountCustom: treeCountOptionId === null && isCustomTreesInRange(form.treeCountCustom, props) ? form.treeCountCustom : null,
    desiredAreaOptionId: has(props.desiredAreas, form.desiredAreaOptionId),
    priorityOptionId: has(props.priorities, form.priorityOptionId),
    goalOptionId: has(props.goals, form.goalOptionId),
    downPaymentOptionId: has(props.downPayments, form.downPaymentOptionId),
    installmentOptionId: has(props.installments, form.installmentOptionId),
    contactTimeOptionId: has(props.contactTimes, form.contactTimeOptionId),
    consent: false,
  };
}

function isCustomTreesInRange(value: unknown, props: RegisterWizardProps): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= props.customTreesMin && value <= props.customTreesMax;
}

function customTreesHint(props: RegisterWizardProps): string {
  return `اكتب عدداً بين ${formatCount(props.customTreesMin)} و${formatCount(props.customTreesMax)}.`;
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
  if (step === 3 && form.scenarioIds.length === 0) {
    errors.scenarioIds = "اختر شنوّة تحب تملك.";
  }
  if (step === 4) {
    if (form.treeCountCustom !== null && !isCustomTreesInRange(form.treeCountCustom, props)) {
      errors.treeCountOptionId = customTreesHint(props);
    } else if (props.treeCounts.length > 0 && !form.treeCountOptionId && form.treeCountCustom === null) {
      errors.treeCountOptionId = "اختر عدد الزيتونات، أو «اقترحولي».";
    }
    if (props.desiredAreas.length > 0 && !form.desiredAreaOptionId) {
      errors.desiredAreaOptionId = "اختر المساحة، أو «ما عنديش تفضيل».";
    }
  }
  if (step === 5 && !form.goalOptionId) errors.goalOptionId = "اختر هدفك.";
  if (step === 6 && props.priorities.length > 0 && !form.priorityOptionId) {
    errors.priorityOptionId = "اختر الأهم بالنسبة إليك.";
  }
  if (step === 7) {
    if (!form.downPaymentOptionId) errors.downPaymentOptionId = "اختر التسبقة التي تناسبك.";
    if (!form.installmentOptionId) errors.installmentOptionId = "اختر القسط الشهري الذي يناسبك.";
  }
  if (step === 8 && !form.contactChannel) errors.contactChannel = "اختر طريقة التواصل.";
  if (step === 9 && !form.consent) errors.consent = "لإرسال الطلب، وافق على التواصل ومعالجة معطياتك.";
  return errors;
}

function focusFirstError() {
  // setTimeout (not requestAnimationFrame) so it also runs after React commits in background tabs.
  setTimeout(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-anchor]')?.focus();
  }, 0);
}

export function RegisterWizard(props: RegisterWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => emptyForm(props));
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestNo, setRequestNo] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftLoaded = useRef(false);
  const firstRender = useRef(true);

  // LEAD-07: keep answers in this browser so a reload does not lose them. Nothing is sent before submit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormState>;
        // What the visitor just picked on the home page or /start wins over an older draft (MIL-01).
        const fromHome: Partial<FormState> = {
          ...(props.initialTreeCountId ? { treeCountOptionId: props.initialTreeCountId, treeCountCustom: null } : {}),
          ...(!props.initialTreeCountId && props.initialTreeCountCustom !== undefined
            ? { treeCountOptionId: null, treeCountCustom: props.initialTreeCountCustom }
            : {}),
          ...(props.initialScenarioId ? { scenarioIds: [props.initialScenarioId] } : {}),
          ...(props.initialDownPaymentId ? { downPaymentOptionId: props.initialDownPaymentId } : {}),
          ...(props.initialInstallmentId ? { installmentOptionId: props.initialInstallmentId } : {}),
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after hydration
        setForm((current) => sanitize({ ...current, ...draft, ...fromHome }, props));
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

    setSubmitError(null);
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
          scenarioIds: form.scenarioIds,
          treeCountOptionId: form.treeCountOptionId,
          treeCountCustom: form.treeCountCustom,
          desiredAreaOptionId: form.desiredAreaOptionId,
          priorityOptionId: form.priorityOptionId,
          goalOptionId: form.goalOptionId ?? "",
          downPaymentOptionId: form.downPaymentOptionId ?? "",
          installmentOptionId: form.installmentOptionId ?? "",
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
          setSubmitError(result.message);
          if (result.step) setStep(result.step);
        }
      } catch {
        setSubmitError("تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      }
    });
  }

  if (requestNo) {
    return <Success requestNo={requestNo} form={form} contactTimes={props.contactTimes} notice={props.notice} headingRef={headingRef} />;
  }

  const lastStep = step === STEPS.length;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-6 pt-6 sm:px-6 sm:pt-10">
      <Progress step={step} total={STEPS.length} />

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
            {submitError}
          </div>
        ) : null}

        <div className="mt-6">
          {step === 1 ? <IdentityStep form={form} errors={errors} update={update} {...props} /> : null}
          {step === 2 ? <LocationStep form={form} errors={errors} update={update} governorates={props.governorates} /> : null}
          {step === 3 ? (
            <ScenarioStep
              form={form}
              errors={errors}
              update={update}
              scenarios={props.scenarios}
              multiple={props.allowMultipleScenarios}
            />
          ) : null}
          {step === 4 ? (
            <div className="space-y-7">
              <div>
                <p className="label">قدّاش زيتونة تحب تبدا بيهم؟</p>
                <p className="hint mb-3">هذا هو العدد اللي يدخل في عدّاد مشروع المليون زيتونة.</p>
                <div className="space-y-2">
                  <SingleChoice
                    name="treeCount"
                    options={props.treeCounts}
                    value={form.treeCountOptionId}
                    onChange={(id) => {
                      update("treeCountOptionId", id);
                      update("treeCountCustom", null);
                    }}
                  />
                  <CustomTreesRow form={form} errors={errors} update={update} {...props} />
                </div>
                <GroupError message={errors.treeCountOptionId} />
              </div>
              <div>
                <p className="label">والمساحة؟</p>
                {/* PARC-02: two separate questions on purpose; neither answer fills in the other. */}
                <p className="hint mb-3">
                  المساحة تختلف من مشروع لآخر: عدد الزيتونات ما يتحسبش من المساحة، والعكس صحيح.
                </p>
                <SingleChoice
                  name="desiredArea"
                  options={props.desiredAreas}
                  value={form.desiredAreaOptionId}
                  onChange={(id) => update("desiredAreaOptionId", id)}
                  error={errors.desiredAreaOptionId}
                />
              </div>
            </div>
          ) : null}
          {step === 5 ? (
            <SingleChoice
              name="goal"
              options={props.goals}
              value={form.goalOptionId}
              onChange={(id) => update("goalOptionId", id)}
              error={errors.goalOptionId}
            />
          ) : null}
          {step === 6 ? (
            <div>
              <p className="hint mb-3">نستعملوها باش نقدّموا العروض الأقرب لما يهمّك.</p>
              <SingleChoice
                name="priority"
                options={props.priorities}
                value={form.priorityOptionId}
                onChange={(id) => update("priorityOptionId", id)}
                error={errors.priorityOptionId}
              />
            </div>
          ) : null}
          {step === 7 ? <CapacityStep form={form} errors={errors} update={update} {...props} /> : null}
          {step === 8 ? <ContactStep form={form} errors={errors} update={update} contactTimes={props.contactTimes} /> : null}
          {step === 9 ? <ReviewStep form={form} errors={errors} update={update} setStep={setStep} {...props} /> : null}
        </div>

        {/* Honeypot for bots; hidden from people and assistive technology */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
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
// Steps
// ---------------------------------------------------------------------------

type StepProps = {
  form: FormState;
  errors: Errors;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
};

function IdentityStep({ form, errors, update, governorates }: StepProps & RegisterWizardProps) {
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

/** Clause 25.3: the scenario, not the area, says what the citizen will own. */
function ScenarioStep({
  form,
  errors,
  update,
  scenarios,
  multiple,
}: StepProps & { scenarios: Scenario[]; multiple: boolean }) {
  function choose(scenario: Scenario, checked: boolean) {
    if (scenario.is_any) {
      update("scenarioIds", checked ? [scenario.id] : []);
      return;
    }
    const anyIds = new Set(scenarios.filter((s) => s.is_any).map((s) => s.id));
    const withoutAny = form.scenarioIds.filter((id) => !anyIds.has(id));
    const next = multiple
      ? checked
        ? [...withoutAny, scenario.id]
        : withoutAny.filter((id) => id !== scenario.id)
      : [scenario.id];
    update("scenarioIds", next);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">شنوّة تحب تملك؟</legend>
      {multiple ? <p className="hint -mt-2 mb-1">يمكنك اختيار أكثر من خيار.</p> : null}
      {scenarios.map((scenario) => (
        <label key={scenario.id} className="choice items-start">
          <input
            type={multiple && !scenario.is_any ? "checkbox" : "radio"}
            name="scenario"
            className="mt-1"
            checked={form.scenarioIds.includes(scenario.id)}
            onChange={(event) => choose(scenario, event.target.checked)}
          />
          {scenario.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- the address is set in the Back Office, its host is not known at build time
            <img
              src={scenario.image_url}
              alt={scenario.image_alt_ar ?? ""}
              loading="lazy"
              decoding="async"
              className="size-16 flex-none rounded-lg object-cover"
            />
          ) : (
            <GrowthIcon code={scenario.icon_code} className="size-8 flex-none text-leaf" />
          )}
          <span>
            <span className="block font-semibold">{scenario.label_ar}</span>
            {scenario.description_ar ? <span className="mt-0.5 block text-sm text-muted">{scenario.description_ar}</span> : null}
          </span>
        </label>
      ))}
      <GroupError message={errors.scenarioIds} />
    </fieldset>
  );
}

/** MIL-01: the visitor may type a number instead of picking a card; it is never derived from a surface (PARC-02). */
function CustomTreesRow({ form, errors, update, ...props }: StepProps & RegisterWizardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Picking the row before typing still shows it as the chosen answer, until a card is picked instead.
  const [picked, setPicked] = useState(false);
  const selected = form.treeCountCustom !== null || (picked && form.treeCountOptionId === null);

  function setCustom(raw: string) {
    // Arabic keyboards type ٠-٩; keep digits only and cap the length so Number() stays exact.
    const digits = toWesternDigits(raw).replace(/\D/g, "").slice(0, 9);
    setPicked(true);
    update("treeCountOptionId", null);
    update("treeCountCustom", digits ? Number(digits) : null);
  }

  return (
    <div>
      {/* Two controls, two labels: the radio names the row, the text field carries its own name and hint. */}
      <div className="choice">
        <label className="flex flex-1 cursor-pointer items-center gap-3">
          <input
            type="radio"
            name="treeCount"
            checked={selected}
            onChange={() => {
              setPicked(true);
              update("treeCountOptionId", null);
              inputRef.current?.focus();
            }}
          />
          <span className="font-semibold">عدد مخصّص</span>
        </label>
        <input
          ref={inputRef}
          type="text"
          // `.choice input` sizes radios (1.125rem); these utilities restore a text field inside the row.
          className="field h-auto min-h-10 w-full max-w-40 py-1.5 text-center tabular-nums"
          inputMode="numeric"
          dir="ltr"
          placeholder="أدخل العدد"
          aria-label="عدد الزيتونات المخصّص"
          aria-describedby="custom-trees-hint"
          autoComplete="off"
          value={form.treeCountCustom ?? ""}
          onChange={(event) => setCustom(event.target.value)}
          aria-invalid={selected && Boolean(errors.treeCountOptionId)}
        />
      </div>
      <p id="custom-trees-hint" className="hint mt-1.5">
        {customTreesHint(props)}
      </p>
    </div>
  );
}

function CapacityStep({ form, errors, update, downPayments, installments }: StepProps & RegisterWizardProps) {
  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="label text-base">التسبقة</legend>
        <p className="hint mb-3">المبلغ الذي يمكنك دفعه في البداية.</p>
        <ChipGrid
          name="downPayment"
          options={downPayments}
          value={form.downPaymentOptionId}
          onChange={(id) => update("downPaymentOptionId", id)}
        />
        <GroupError message={errors.downPaymentOptionId} />
      </fieldset>

      <fieldset>
        <legend className="label text-base">القسط الشهري</legend>
        <p className="hint mb-3">المبلغ الذي يناسبك كل شهر.</p>
        <ChipGrid
          name="installment"
          options={installments}
          value={form.installmentOptionId}
          onChange={(id) => update("installmentOptionId", id)}
          suffix="شهرياً"
        />
        <GroupError message={errors.installmentOptionId} />
      </fieldset>
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
  scenarios,
  treeCounts,
  desiredAreas,
  priorities,
  goals,
  downPayments,
  installments,
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
    {
      step: 3,
      label: "شنوّة تحب تملك",
      value: scenarios.filter((s) => form.scenarioIds.includes(s.id)).map((s) => s.label_ar).join("، ") || "—",
    },
    ...(treeCounts.length > 0 || form.treeCountCustom !== null
      ? [
          {
            step: 4,
            label: "عدد الزيتونات",
            value: form.treeCountCustom !== null ? `${formatCount(form.treeCountCustom)} زيتونة` : label(treeCounts, form.treeCountOptionId),
          },
        ]
      : []),
    ...(desiredAreas.length > 0 ? [{ step: 4, label: "المساحة", value: label(desiredAreas, form.desiredAreaOptionId) }] : []),
    { step: 5, label: "الهدف", value: label(goals, form.goalOptionId) },
    ...(priorities.length > 0 ? [{ step: 6, label: "الأهم بالنسبة ليك", value: label(priorities, form.priorityOptionId) }] : []),
    { step: 7, label: "التسبقة", value: label(downPayments, form.downPaymentOptionId) },
    { step: 7, label: "القسط الشهري", value: `${label(installments, form.installmentOptionId)} شهرياً` },
    {
      step: 8,
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
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{name}</legend>
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

function ChipGrid({
  name,
  options,
  value,
  onChange,
  suffix,
}: {
  name: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  suffix?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((option) => (
        <label key={option.id} className="choice justify-center">
          <input type="radio" name={name} className="sr-only" checked={value === option.id} onChange={() => onChange(option.id)} />
          <span className="text-center">
            <span className="block font-semibold tabular-nums">{option.label_ar}</span>
            {suffix ? <span className="block text-xs text-muted">{suffix}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

function Success({
  requestNo,
  form,
  contactTimes,
  notice,
  headingRef,
}: {
  requestNo: string;
  form: FormState;
  contactTimes: Option[];
  notice: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const channel = form.contactChannel ? CHANNEL_LABELS[form.contactChannel] : null;
  const time = contactTimes.find((t) => t.id === form.contactTimeOptionId)?.label_ar;

  return (
    <div className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-leaf-soft">
        <svg viewBox="0 0 24 24" className="size-8 text-forest" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="mt-6 font-display text-4xl font-bold text-forest outline-none">
        تم تسجيل مطلبك
      </h1>

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

      <p className="mx-auto mt-6 max-w-md leading-7 text-muted">
        احتفظ بهذا الرقم. سيتصل بك فريق AgriZed
        {channel ? ` عبر ${channel}` : ""}
        {time ? ` (${time})` : ""} عند دراسة طلبك.
      </p>
      {notice ? <p className="mt-3 text-sm font-medium text-leaf">{notice}</p> : null}

      <Link href="/" className="btn btn-secondary mt-8">
        العودة للصفحة الرئيسية
      </Link>
    </div>
  );
}
