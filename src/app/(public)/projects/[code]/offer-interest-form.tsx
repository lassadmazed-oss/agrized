"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { readVisitSource } from "@/components/site/source-capture";
import { toWesternDigits } from "@/lib/digits";
import { formatArea, formatCount, formatMillimes } from "@/lib/format";

import { submitOfferInterest } from "./offer-actions";

type Option = { id: string; code: string | null; label_ar: string };
type ContactChannel = "phone" | "whatsapp" | "both";

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "مكالمة",
  whatsapp: "WhatsApp",
  both: "الزوز",
};

/** The figures of one tree in this offer, computed in Postgres; the picker only multiplies them. */
export type OfferFigures = {
  pricePerTreeMillimes: number | null;
  annualFeePerTreeMillimes: number | null;
  areaPerTreeM2: number | null;
};

export type OfferInterestFormProps = {
  projectId: string;
  projectName: string;
  /** The offer's own trees: the visitor may ask for one, for all of them, or anything between. */
  maxTrees: number;
  figures: OfferFigures;
  governorates: { id: number; name_ar: string }[];
  contactTimes: Option[];
  title: string;
  intro: string;
  treesLabel: string;
  treesHint: string;
  submitLabel: string;
  successTitle: string;
  successText: string;
  consentText: string;
  /** PRN-01: an amount is never shown without the note that it is an estimate. */
  estimateNote: string;
  rowPricePerTree: string;
  rowTotalPrice: string;
  rowAnnualFee: string;
  rowAreaPerTree: string;
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
  consent: boolean;
};

type Errors = Partial<Record<keyof FormState, string>>;

const QUICK_PICKS = [1, 5, 10, 25, 50];

export function OfferInterestForm(props: OfferInterestFormProps) {
  const [form, setForm] = useState<FormState>({
    trees: "1",
    fullName: "",
    phone: "",
    whatsappSame: true,
    whatsapp: "",
    email: "",
    governorateId: "",
    contactChannel: null,
    contactTimeOptionId: null,
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestNo, setRequestNo] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const trees = useMemo(() => {
    const parsed = Number.parseInt(toWesternDigits(form.trees).replace(/\D/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [form.trees]);

  const valid = trees >= 1 && trees <= props.maxTrees;
  // v_total := v_per_tree * v_trees (migration 0034): the price of one tree does not move with the count,
  // so the total follows the picker with no round trip, and the database recomputes it on submit anyway.
  const total = valid && props.figures.pricePerTreeMillimes ? props.figures.pricePerTreeMillimes * trees : null;
  const annualTotal = valid && props.figures.annualFeePerTreeMillimes ? props.figures.annualFeePerTreeMillimes * trees : null;
  const area = valid && props.figures.areaPerTreeM2 ? props.figures.areaPerTreeM2 * trees : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!valid) {
      next.trees = props.treesHint.replace("{max}", formatCount(props.maxTrees)) || "اكتب عدد الزيتونات.";
    }
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
          consent: true,
          website: honeypot,
          source: readVisitSource() as Record<string, string>,
        });
        if (result.ok) setRequestNo(result.requestNo);
        else setSubmitError(result.message);
      } catch {
        setSubmitError("تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      }
    });
  }

  if (requestNo) {
    return (
      <section id="offer-form" className="scroll-mt-24 rounded-2xl border border-leaf bg-leaf-soft/60 p-6 text-center sm:p-8">
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
        </p>
      </section>
    );
  }

  return (
    <section id="offer-form" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold text-forest">{props.title}</h2>
      {props.intro ? <p className="mt-2 leading-7 text-muted">{props.intro}</p> : null}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
        {/* The offer's own question: how many of its trees. Everything else is who to call back. */}
        <div>
          <label htmlFor="offer-trees" className="label">
            {props.treesLabel}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_PICKS.filter((count) => count <= props.maxTrees).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => update("trees", String(count))}
                aria-pressed={trees === count}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold tabular-nums transition ${
                  trees === count ? "border-forest bg-leaf-soft text-forest" : "border-line text-ink hover:border-line-strong"
                }`}
              >
                {formatCount(count)}
              </button>
            ))}
            {props.maxTrees > 1 ? (
              <button
                type="button"
                onClick={() => update("trees", String(props.maxTrees))}
                aria-pressed={trees === props.maxTrees}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold tabular-nums transition ${
                  trees === props.maxTrees ? "border-forest bg-leaf-soft text-forest" : "border-line text-ink hover:border-line-strong"
                }`}
              >
                الكل ({formatCount(props.maxTrees)})
              </button>
            ) : null}
          </div>
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
            className="field mt-3 max-w-40 text-center tabular-nums"
          />
          {errors.trees ? (
            <p id="offer-trees-error" className="error-text">
              {errors.trees}
            </p>
          ) : props.treesHint ? (
            <p id="offer-trees-hint" className="hint mt-1.5">
              {props.treesHint.replace("{max}", formatCount(props.maxTrees))}
            </p>
          ) : null}
        </div>

        {/* What those trees cost today. Every figure came from the database; this only multiplies by the count. */}
        <dl className="divide-y divide-line rounded-xl bg-paper px-4 text-sm">
          {props.figures.pricePerTreeMillimes ? (
            <>
              <Row label={props.rowPricePerTree}>
                <span className="font-display text-2xl font-bold text-forest">
                  {formatMillimes(props.figures.pricePerTreeMillimes)}
                </span>
              </Row>
              {area ? <Row label={props.rowAreaPerTree}>{formatArea(area)}</Row> : null}
              {total ? (
                <Row label={props.rowTotalPrice}>
                  <span className="font-display text-2xl font-bold text-forest">{formatMillimes(total)}</span>
                </Row>
              ) : null}
              {annualTotal ? <Row label={props.rowAnnualFee}>{formatMillimes(annualTotal)}</Row> : null}
            </>
          ) : (
            <p className="py-3 font-semibold text-forest">{props.pricePending}</p>
          )}
        </dl>
        {props.figures.pricePerTreeMillimes && props.estimateNote ? (
          <p className="-mt-3 text-xs leading-6 text-muted">{props.estimateNote}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="offer-name" label="الاسم واللقب" error={errors.fullName}>
            <input
              id="offer-name"
              name="fullName"
              autoComplete="name"
              value={form.fullName}
              onChange={(event) => update("fullName", event.target.value)}
              aria-invalid={Boolean(errors.fullName)}
              className="field"
            />
          </Field>
          <Field id="offer-phone" label="رقم الهاتف" hint="8 أرقام، مثال: 98 123 456" error={errors.phone}>
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
          </Field>
        </div>

        <label className="choice">
          <input type="checkbox" checked={form.whatsappSame} onChange={(event) => update("whatsappSame", event.target.checked)} />
          <span>رقم WhatsApp هو نفس رقم الهاتف</span>
        </label>
        {!form.whatsappSame ? (
          <Field id="offer-whatsapp" label="رقم WhatsApp" error={errors.whatsapp}>
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
          </Field>
        ) : null}

        <Field id="offer-governorate" label="ولاية إقامتك" error={errors.governorateId}>
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
        </Field>

        <fieldset>
          <legend className="label">كيفاش تحب نتصلوا بيك؟</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((channel) => (
              <label key={channel} className="choice min-h-11 justify-center text-center font-semibold">
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
          <Field id="offer-time" label="الوقت المفضّل للمكالمة (اختياري)">
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
          </Field>
        ) : null}

        <label className="choice items-start">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.consent}
            onChange={(event) => update("consent", event.target.checked)}
            aria-invalid={Boolean(errors.consent)}
          />
          <span className="text-[0.95rem] leading-7">{props.consentText}</span>
        </label>
        {errors.consent ? <p className="error-text -mt-4">{errors.consent}</p> : null}

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

        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto sm:min-w-56">
          {pending ? "جارٍ الإرسال…" : props.submitLabel}
        </button>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="hint mt-1.5">{hint}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-semibold text-ink tabular-nums">{children}</dd>
    </div>
  );
}
