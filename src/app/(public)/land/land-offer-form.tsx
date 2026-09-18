"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { readVisitSource } from "@/components/site/source-capture";
import { FormField } from "@/components/ui";
import { toWesternDigits } from "@/lib/digits";
import { getStorageUploadClient, LAND_OFFER_BUCKET } from "@/lib/supabase/storage-upload";

import { finalizeLandOfferFiles, submitLandOffer } from "./actions";

type Option = { id: string; code: string | null; label_ar: string };

type LandOfferFormProps = {
  governorates: { id: number; name_ar: string }[];
  delegations: { id: number; governorate_id: number; name_ar: string }[];
  propertyTypes: Option[];
  treeAges: Option[];
  documents: Option[];
  intro: string;
  notice: string;
  consentText: string;
  allowInternationalPhone: boolean;
  maxFiles: number;
  maxFileSizeMb: number;
};

type Capacity = "owner" | "agent" | "broker";
type Irrigation = "rainfed" | "irrigated";

const CAPACITY_LABELS: Record<Capacity, string> = { owner: "مالك", agent: "وكيل", broker: "وسيط" };
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

type Errors = Record<string, string | undefined>;

type Done = { referenceNo: string; failedUploads: number };

function parseNumber(value: string): number | null {
  const normalized = toWesternDigits(value).replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function LandOfferForm(props: LandOfferFormProps) {
  const [governorateId, setGovernorateId] = useState<number | null>(null);
  const [delegationId, setDelegationId] = useState<number | null>(null);
  const [locationDescription, setLocationDescription] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [area, setArea] = useState("");
  const [areaUnit, setAreaUnit] = useState<"ha" | "m2">("ha");
  const [propertyTypeId, setPropertyTypeId] = useState<string | null>(null);
  const [treeCount, setTreeCount] = useState("");
  const [treeAgeId, setTreeAgeId] = useState("");
  const [irrigation, setIrrigation] = useState<Irrigation | null>(null);
  const [waterSource, setWaterSource] = useState("");
  const [price, setPrice] = useState("");
  const [negotiable, setNegotiable] = useState(false);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedType = props.propertyTypes.find((type) => type.id === propertyTypeId);
  const hasTrees = selectedType ? selectedType.code !== "bare_land" : true;
  const delegationOptions = props.delegations.filter((d) => d.governorate_id === governorateId);

  function clearError(key: string) {
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const maxBytes = props.maxFileSizeMb * 1024 * 1024;
    const incoming = Array.from(list);
    const rejected = incoming.filter(
      (file) => !ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number]) || file.size > maxBytes,
    );
    const accepted = incoming.filter((file) => !rejected.includes(file));
    const next = [...files, ...accepted].slice(0, props.maxFiles);
    setFiles(next);
    if (rejected.length > 0) {
      setErrors((current) => ({
        ...current,
        files: `بعض الملفات لم تُضف: الأنواع المقبولة PDF وJPG وPNG، بحجم أقصى ${props.maxFileSizeMb} ميغابايت للملف.`,
      }));
    } else if (files.length + accepted.length > props.maxFiles) {
      setErrors((current) => ({ ...current, files: `يمكنك إرفاق ${props.maxFiles} ملفات كحد أقصى.` }));
    } else {
      clearError("files");
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setErrors((current) => ({ ...current, coords: "المتصفح لا يسمح بتحديد الموقع. اكتب وصف المكان." }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        setLocating(false);
        clearError("coords");
      },
      () => {
        setLocating(false);
        setErrors((current) => ({ ...current, coords: "تعذّر تحديد موقعك. اسمح بالوصول للموقع أو اكتب وصف المكان." }));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!governorateId) next.governorate = "اختر الولاية.";
    if (!delegationId) next.delegation = "اختر المعتمدية.";
    const areaValue = parseNumber(area);
    if (areaValue === null || Number.isNaN(areaValue) || areaValue <= 0) next.area = "اكتب المساحة بالأرقام، مثال: 2.5";
    if (!propertyTypeId) next.propertyType = "اختر نوع العقار.";
    const trees = parseNumber(treeCount);
    if (trees !== null && (Number.isNaN(trees) || trees < 0 || !Number.isInteger(trees))) next.treeCount = "اكتب عدد الزيتونات بالأرقام.";
    if (!irrigation) next.irrigation = "اختر بعلية أو مروية.";
    const priceValue = parseNumber(price);
    if (priceValue !== null && (Number.isNaN(priceValue) || priceValue < 0)) next.price = "اكتب السعر بالأرقام، أو اتركه فارغاً.";
    if (contactName.trim().length < 3) next.contactName = "اكتب الاسم واللقب.";
    const compactPhone = toWesternDigits(contactPhone).replace(/[\s.\-()]/g, "");
    const local = compactPhone.replace(/^(\+216|00216)/, "");
    const phoneOk =
      /^[2-9]\d{7}$/.test(local) || (props.allowInternationalPhone && /^(\+|00)[1-9]\d{6,14}$/.test(compactPhone));
    if (!phoneOk) next.contactPhone = "رقم الهاتف غير صحيح. اكتب 8 أرقام، مثال: 98 123 456.";
    if (!capacity) next.capacity = "اختر صفتك.";
    if (!consent) next.consent = "لإرسال العرض، وافق على التواصل ومعالجة معطياتك.";
    return next;
  }

  function submit() {
    const found = validate();
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      setTimeout(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-anchor]')?.focus();
      }, 0);
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      try {
        setProgress("جارٍ إرسال العرض…");
        const areaValue = parseNumber(area) ?? 0;
        const trees = hasTrees ? parseNumber(treeCount) : null;
        const result = await submitLandOffer({
          governorateId: governorateId ?? 0,
          delegationId: delegationId ?? 0,
          locationDescription,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          areaValue,
          areaUnit,
          propertyTypeOptionId: propertyTypeId ?? "",
          oliveTreeCount: trees,
          treeAgeOptionId: hasTrees && treeAgeId ? treeAgeId : null,
          irrigation: irrigation ?? "rainfed",
          waterSource,
          askingPriceDinars: parseNumber(price),
          priceNegotiable: negotiable,
          documentOptionIds: documentIds,
          contactName,
          contactPhone,
          contactCapacity: capacity ?? "owner",
          consent: true,
          website: honeypot,
          source: readVisitSource() as Record<string, string>,
          files: files.map((file) => ({ name: file.name, size: file.size, type: file.type as (typeof ACCEPTED_TYPES)[number] })),
        });

        if (!result.ok) {
          setProgress(null);
          setSubmitError(result.message);
          return;
        }

        const storage = getStorageUploadClient().storage.from(LAND_OFFER_BUCKET);
        const uploaded: { path: string; name: string }[] = [];
        for (const [position, upload] of result.uploads.entries()) {
          const file = files[upload.index];
          if (!file) continue;
          setProgress(`جارٍ رفع الملفات (${position + 1} من ${result.uploads.length})…`);
          const { error } = await storage.uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
          if (!error) uploaded.push({ path: upload.path, name: file.name });
        }

        let saved = 0;
        if (uploaded.length > 0) {
          saved = (await finalizeLandOfferFiles({ offerId: result.offerId, files: uploaded })).saved;
        }
        setProgress(null);
        setDone({ referenceNo: result.referenceNo, failedUploads: files.length - saved });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setProgress(null);
        setSubmitError("تعذّر الإرسال. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      }
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-leaf-soft">
          <svg viewBox="0 0 24 24" className="size-8 text-forest" fill="none" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold text-forest">استلمنا عرضك</h1>
        <p className="mt-6 text-sm text-muted">الرقم المرجعي</p>
        <p dir="ltr" className="mt-1 font-display text-3xl font-bold tracking-wide text-ink tabular-nums sm:text-4xl">
          {done.referenceNo}
        </p>
        <p className="mx-auto mt-6 max-w-md leading-7 text-muted">
          عرضك الآن قيد الدراسة ولن يُنشر. سيتصل بك فريق AgriZed بعد المراجعة الأولى.
        </p>
        {done.failedUploads > 0 ? (
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
            تعذّر رفع {done.failedUploads} من الملفات. يمكنك تقديمها للفريق عند التواصل معك.
          </p>
        ) : null}
        {props.notice ? <p className="mt-4 text-sm text-muted">{props.notice}</p> : null}
        <Link href="/" className="btn btn-secondary mt-8">
          العودة للصفحة الرئيسية
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-4xl font-bold text-forest sm:text-5xl">عندك أرض أو ضيعة زيتون؟</h1>
      {props.intro ? <p className="mt-3 max-w-2xl leading-7 text-muted">{props.intro}</p> : null}

      <form
        noValidate
        className="mt-8 space-y-10"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {submitError ? (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {submitError}
          </div>
        ) : null}

        <Section title="الموقع">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="governorate" label="الولاية" error={errors.governorate}>
              <select
                id="governorate"
                className="field"
                value={governorateId ?? ""}
                onChange={(event) => {
                  setGovernorateId(event.target.value ? Number(event.target.value) : null);
                  setDelegationId(null);
                  clearError("governorate");
                }}
                aria-invalid={Boolean(errors.governorate)}
              >
                <option value="">اختر الولاية</option>
                {props.governorates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name_ar}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="delegation" label="المعتمدية" error={errors.delegation}>
              <select
                id="delegation"
                className="field disabled:opacity-60"
                value={delegationId ?? ""}
                disabled={!governorateId}
                onChange={(event) => {
                  setDelegationId(event.target.value ? Number(event.target.value) : null);
                  clearError("delegation");
                }}
                aria-invalid={Boolean(errors.delegation)}
              >
                <option value="">{governorateId ? "اختر المعتمدية" : "اختر الولاية أولاً"}</option>
                {delegationOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_ar}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField id="locationDescription" label="وصف المكان (اختياري)" hint="مثال: قرب الطريق الجهوية، 3 كم بعد القرية.">
            <textarea
              id="locationDescription"
              rows={3}
              maxLength={1000}
              className="field min-h-24"
              value={locationDescription}
              onChange={(event) => setLocationDescription(event.target.value)}
            />
          </FormField>

          <div>
            {coords ? (
              <p className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-leaf-soft px-3 py-1 font-medium text-forest">تم تحديد الموقع</span>
                <span dir="ltr" className="text-muted tabular-nums">
                  {coords.latitude}, {coords.longitude}
                </span>
                <button type="button" className="font-semibold text-forest underline-offset-4 hover:underline" onClick={() => setCoords(null)}>
                  إزالة
                </button>
              </p>
            ) : (
              <button type="button" onClick={locate} disabled={locating} className="btn btn-secondary">
                {locating ? "جارٍ تحديد الموقع…" : "أنا في العقار الآن: حدّد موقعي"}
              </button>
            )}
            {errors.coords ? <p className="error-text">{errors.coords}</p> : null}
          </div>
        </Section>

        <Section title="العقار">
          <fieldset>
            <legend className="label">نوع العقار</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {props.propertyTypes.map((type) => (
                <label key={type.id} className="choice">
                  <input
                    type="radio"
                    name="propertyType"
                    checked={propertyTypeId === type.id}
                    onChange={() => {
                      setPropertyTypeId(type.id);
                      clearError("propertyType");
                    }}
                  />
                  <span className="font-semibold">{type.label_ar}</span>
                </label>
              ))}
            </div>
            <GroupError message={errors.propertyType} />
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <FormField id="area" label="المساحة" error={errors.area}>
              <input
                id="area"
                inputMode="decimal"
                dir="ltr"
                className="field text-left"
                placeholder="2.5"
                value={area}
                onChange={(event) => {
                  setArea(event.target.value);
                  clearError("area");
                }}
                aria-invalid={Boolean(errors.area)}
              />
            </FormField>
            <fieldset>
              <legend className="label">الوحدة</legend>
              <div className="flex gap-2">
                {(["ha", "m2"] as const).map((unit) => (
                  <label key={unit} className="choice min-h-12 py-2">
                    <input type="radio" name="areaUnit" checked={areaUnit === unit} onChange={() => setAreaUnit(unit)} />
                    <span className="font-semibold">{unit === "ha" ? "هكتار" : "م²"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {hasTrees ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField id="treeCount" label="عدد الزيتونات (تقريبي)" error={errors.treeCount}>
                <input
                  id="treeCount"
                  inputMode="numeric"
                  dir="ltr"
                  className="field text-left"
                  value={treeCount}
                  onChange={(event) => {
                    setTreeCount(event.target.value);
                    clearError("treeCount");
                  }}
                  aria-invalid={Boolean(errors.treeCount)}
                />
              </FormField>
              <FormField id="treeAge" label="عمر الأشجار">
                <select id="treeAge" className="field" value={treeAgeId} onChange={(event) => setTreeAgeId(event.target.value)}>
                  <option value="">لا أعرف</option>
                  {props.treeAges.map((age) => (
                    <option key={age.id} value={age.id}>
                      {age.label_ar}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          ) : null}

          <fieldset>
            <legend className="label">الري</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["rainfed", "irrigated"] as const).map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name="irrigation"
                    checked={irrigation === value}
                    onChange={() => {
                      setIrrigation(value);
                      clearError("irrigation");
                    }}
                  />
                  <span className="font-semibold">{value === "rainfed" ? "بعلية" : "مروية"}</span>
                </label>
              ))}
            </div>
            <GroupError message={errors.irrigation} />
          </fieldset>

          {irrigation === "irrigated" ? (
            <FormField id="waterSource" label="مصدر الماء (اختياري)" hint="مثال: بئر، منطقة سقوية عمومية.">
              <input id="waterSource" className="field" maxLength={200} value={waterSource} onChange={(event) => setWaterSource(event.target.value)} />
            </FormField>
          ) : null}
        </Section>

        <Section title="السعر المطلوب">
          <FormField id="price" label="السعر بالدينار (اختياري)" error={errors.price}>
            <input
              id="price"
              inputMode="decimal"
              dir="ltr"
              className="field text-left"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
                clearError("price");
              }}
              aria-invalid={Boolean(errors.price)}
            />
          </FormField>
          <label className="flex items-center gap-3 text-label">
            <input type="checkbox" className="size-5 accent-forest" checked={negotiable} onChange={(event) => setNegotiable(event.target.checked)} />
            السعر قابل للتفاوض
          </label>
        </Section>

        <Section title="الوثائق">
          {props.documents.length > 0 ? (
            <fieldset>
              <legend className="label">الوثائق المتوفرة عندك</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {props.documents.map((doc) => (
                  <label key={doc.id} className="choice">
                    <input
                      type="checkbox"
                      checked={documentIds.includes(doc.id)}
                      onChange={(event) =>
                        setDocumentIds((current) => (event.target.checked ? [...current, doc.id] : current.filter((id) => id !== doc.id)))
                      }
                    />
                    <span>{doc.label_ar}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div>
            <p className="label">صور ووثائق (اختياري)</p>
            <p className="hint">
              PDF أو JPG أو PNG، حتى {props.maxFiles} ملفات، {props.maxFileSizeMb} ميغابايت كحد أقصى للملف. الملفات تبقى خاصة بفريق AgriZed.
            </p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="sr-only"
              id="files"
              onChange={(event) => addFiles(event.target.files)}
            />
            <label htmlFor="files" className="btn btn-secondary mt-3 cursor-pointer">
              إضافة ملفات
            </label>
            {files.length > 0 ? (
              <ul className="panel mt-3 divide-y divide-line rounded-xl">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span dir="auto" className="min-w-0 truncate">
                      {file.name}
                    </span>
                    <span className="flex flex-none items-center gap-3 text-muted">
                      <span dir="ltr" className="tabular-nums">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        className="font-semibold text-danger"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      >
                        حذف
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {errors.files ? <p className="error-text">{errors.files}</p> : null}
          </div>
        </Section>

        <Section title="معلومات الاتصال">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="contactName" label="الاسم واللقب" error={errors.contactName}>
              <input
                id="contactName"
                className="field"
                autoComplete="name"
                value={contactName}
                onChange={(event) => {
                  setContactName(event.target.value);
                  clearError("contactName");
                }}
                aria-invalid={Boolean(errors.contactName)}
              />
            </FormField>
            <FormField id="contactPhone" label="رقم الهاتف" error={errors.contactPhone}>
              <input
                id="contactPhone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                className="field text-left"
                autoComplete="tel"
                placeholder="98 123 456"
                value={contactPhone}
                onChange={(event) => {
                  setContactPhone(event.target.value);
                  clearError("contactPhone");
                }}
                aria-invalid={Boolean(errors.contactPhone)}
              />
            </FormField>
          </div>
          <fieldset>
            <legend className="label">صفتك</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(Object.keys(CAPACITY_LABELS) as Capacity[]).map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name="capacity"
                    checked={capacity === value}
                    onChange={() => {
                      setCapacity(value);
                      clearError("capacity");
                    }}
                  />
                  <span className="font-semibold">{CAPACITY_LABELS[value]}</span>
                </label>
              ))}
            </div>
            <GroupError message={errors.capacity} />
          </fieldset>
        </Section>

        <div className="space-y-4">
          <label className="choice items-start">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
                clearError("consent");
              }}
              aria-invalid={Boolean(errors.consent)}
            />
            <span className="text-label leading-7">{props.consentText}</span>
          </label>
          {errors.consent ? <p className="error-text -mt-2">{errors.consent}</p> : null}
          {props.notice ? <p className="text-sm leading-6 text-muted">{props.notice}</p> : null}
        </div>

        <div aria-hidden="true" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 }}>
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
          </label>
        </div>

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto sm:min-w-56">
            {pending ? (progress ?? "جارٍ الإرسال…") : "أرسل العرض"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5 border-t border-line pt-6">
      <h2 className="font-display text-2xl font-bold text-forest">{title}</h2>
      {children}
    </section>
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
