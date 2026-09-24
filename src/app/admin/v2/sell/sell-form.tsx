"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { formatCount, formatMillimes } from "@/lib/format";

import { registerSale } from "./actions";
import { formatTreeNumbers, parseTreeNumbers } from "./trees";

export type TreeRun = {
  from_seq: number;
  to_seq: number;
  from_code: string | null;
  to_code: string | null;
  trees: number;
};

export type SellOffer = {
  id: string;
  name: string;
  available: number;
  min: number;
  depositMillimes: number;
  validDays: number;
  runs: TreeRun[];
};

export type Candidate = { id: string; full_name: string | null; phone_e164: string | null; cin: string | null };

/**
 * The whole first page of the sale: who, which trees, how much عربون.
 *
 * THE THREE BLOCKS ARE ALWAYS ALL VISIBLE. There is no wizard here — a seller on the phone answers these in
 * whatever order the client gives them, and a form that reveals block 2 only after block 1 is «finished»
 * makes them fight it. Everything is on screen; the button at the bottom says what will happen.
 *
 * TYPING THE TREES IS THE POINT. The box takes «5-11» or «5، 10، 15»; underneath, it echoes back what it
 * understood («12 زيتونة · 5-11، 20») and the offer's free stretches are listed as buttons. The echo is the
 * check: a seller reads it against what they meant before pressing, which no error message can replace.
 *
 * THE عربون IS PREFILLED FROM THE OFFER and stays editable, because the offer's figure is what the company
 * asks and what a client actually hands over on the day is sometimes less. Zero is allowed: the confirmation
 * page will show it as still owed.
 */
export function SellForm({
  offers,
  recent,
  preselectedId,
}: {
  offers: SellOffer[];
  recent: Candidate[];
  preselectedId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [mode, setMode] = useState<"known" | "new">(preselectedId || recent.length > 0 ? "known" : "new");
  const [personId, setPersonId] = useState(preselectedId ?? recent[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cin, setCin] = useState("");
  const [email, setEmail] = useState("");

  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const offer = offers.find((row) => row.id === offerId) ?? null;

  const [treesText, setTreesText] = useState("");
  const [count, setCount] = useState("");
  const [deposit, setDeposit] = useState(
    offers[0]?.depositMillimes ? String(offers[0].depositMillimes / 1000) : "",
  );
  const [note, setNote] = useState("");

  const parsed = useMemo(() => (treesText.trim() ? parseTreeNumbers(treesText) : null), [treesText]);
  const seqs = parsed?.ok ? parsed.seqs : [];

  /** Every number the seller typed has to sit inside a stretch that is still free. */
  const unavailable = useMemo(() => {
    if (!offer || seqs.length === 0) return [];
    return seqs.filter((seq) => !offer.runs.some((run) => seq >= run.from_seq && seq <= run.to_seq));
  }, [offer, seqs]);

  const wanted = seqs.length > 0 ? seqs.length : Number(count);
  const treesReady =
    offer !== null &&
    (parsed?.ok === true
      ? unavailable.length === 0 && seqs.length >= offer.min
      : Number.isInteger(wanted) && wanted >= offer.min && wanted <= offer.available);

  const whoReady = mode === "known" ? Boolean(personId) : fullName.trim().length >= 3 && phone.trim().length > 0;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return recent.slice(0, 50);
    const digits = needle.replace(/[^0-9]/g, "");
    return recent
      .filter((row) => {
        const name = (row.full_name ?? "").toLowerCase();
        const number = (row.phone_e164 ?? "").replace(/[^0-9]/g, "");
        return name.includes(needle) || (digits.length > 0 && number.includes(digits));
      })
      .slice(0, 50);
  }, [recent, search]);

  const chooseOffer = (id: string) => {
    const next = offers.find((row) => row.id === id);
    setOfferId(id);
    setTreesText("");
    setCount("");
    if (next) setDeposit(next.depositMillimes ? String(next.depositMillimes / 1000) : "");
  };

  const submit = () => {
    if (!offer) return;
    setError(null);
    setNotice(null);
    start(async () => {
      const result = await registerSale({
        mode,
        personId,
        fullName,
        phone,
        cin,
        email,
        projectId: offer.id,
        treesText,
        count: Number(count) || 0,
        depositDinars: deposit,
        note,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The sale exists; it is finished on the confirmation page, which is where the seller goes next.
      router.push(`/admin/v2/confirm?sale=${result.reservationId}`);
      router.refresh();
    });
  };

  if (offers.length === 0) {
    return <p className="card p-5 text-center text-sm text-muted">ما فماش عرض عندو زيتونات متاحة توّا.</p>;
  }

  return (
    <div className="space-y-2">
      {/* ——— 1 · who ——— */}
      <section className="card space-y-2.5 p-3">
        <Head n={1} title="الحريف">
          <Switch
            value={mode}
            onChange={setMode}
            options={[
              ["known", "حريف موجود"],
              ["new", "حريف جديد"],
            ]}
          />
        </Head>

        {mode === "known" ? (
          <div className="space-y-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="لوّج بالاسم ولا بالتلفون"
              className="field field-sm w-full"
              aria-label="لوّج على حريف"
            />
            <select
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              size={Math.min(Math.max(visible.length, 3), 6)}
              className="field w-full py-1 text-sm"
              aria-label="الحريف"
            >
              {visible.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name ?? "بلا اسم"} — {row.phone_e164 ?? "بلا تلفون"}
                  {row.cin ? "" : " (بلا بطاقة تعريف)"}
                </option>
              ))}
            </select>
            {visible.length === 0 ? (
              <p className="text-[0.6875rem] text-muted">ما فماش حريف بهالاسم. اعمل «حريف جديد».</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="الاسم واللقب">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="field field-sm w-full" />
            </Field>
            <Field label="التلفون">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                inputMode="tel"
                placeholder="98 123 456"
                className="field field-sm w-full"
              />
            </Field>
            <Field label="بطاقة التعريف" hint="يلزمها وقت العقد">
              <input
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                dir="ltr"
                inputMode="numeric"
                maxLength={8}
                placeholder="12345678"
                className="field field-sm w-full tabular-nums"
              />
            </Field>
            <Field label="الإيميل" hint="اختياري">
              <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" className="field field-sm w-full" />
            </Field>
          </div>
        )}
      </section>

      {/* ——— 2 · which trees ——— */}
      <section className="card space-y-2.5 p-3">
        <Head n={2} title="الزيتونات" />

        <select
          value={offerId}
          onChange={(event) => chooseOffer(event.target.value)}
          className="field field-sm w-full"
          aria-label="العرض"
        >
          {offers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} — متاح {formatCount(row.available)}
            </option>
          ))}
        </select>

        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <Field label="أرقام الزيتونات" hint="5-11 ولا 5، 10، 15">
            <input
              value={treesText}
              onChange={(event) => setTreesText(event.target.value)}
              dir="ltr"
              placeholder="5-11، 20، 25"
              className="field field-sm w-full text-start tabular-nums"
            />
          </Field>
          <Field label="ولا بالعدد برك" hint="ياخو أوّل الخاويات">
            <input
              type="number"
              inputMode="numeric"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              disabled={seqs.length > 0}
              min={offer?.min ?? 1}
              max={offer?.available ?? 1}
              className="field field-sm w-full tabular-nums"
            />
          </Field>
        </div>

        {/* The echo: what the box understood, before anything is pressed. */}
        {parsed ? (
          parsed.ok ? (
            <p className="text-[0.6875rem]">
              <b className="font-semibold text-forest">{formatCount(seqs.length)} زيتونة</b>
              <span className="text-muted"> · </span>
              <span dir="ltr" className="text-muted">
                {formatTreeNumbers(seqs)}
              </span>
              {unavailable.length > 0 ? (
                <span className="text-danger">
                  {" "}
                  — <span dir="ltr">{formatTreeNumbers(unavailable)}</span> موش خاوية.
                </span>
              ) : null}
              {offer && seqs.length < offer.min ? (
                <span className="text-danger"> — أقل عدد {formatCount(offer.min)}.</span>
              ) : null}
            </p>
          ) : (
            <p className="text-[0.6875rem] font-semibold text-danger">{parsed.message}</p>
          )
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[0.6875rem] text-muted">الخاوي:</span>
          {(offer?.runs ?? []).slice(0, 12).map((run) => (
            <button
              key={`${run.from_seq}-${run.to_seq}`}
              type="button"
              onClick={() =>
                setTreesText((current) => {
                  const piece = run.from_seq === run.to_seq ? `${run.from_seq}` : `${run.from_seq}-${run.to_seq}`;
                  return current.trim() ? `${current.trim()}، ${piece}` : piece;
                })
              }
              className="rounded-lg border border-line px-2 py-0.5 text-[0.6875rem] tabular-nums text-muted transition-colors hover:border-forest/30 hover:bg-paper hover:text-forest"
              dir="ltr"
            >
              {run.from_seq}-{run.to_seq}
            </button>
          ))}
        </div>
      </section>

      {/* ——— 3 · the عربون and the note ——— */}
      <section className="card space-y-2.5 p-3">
        <Head n={3} title="العربون" />
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
          <Field
            label="العربون (د.ت)"
            hint={offer?.depositMillimes ? `العرض يطلب ${formatMillimes(offer.depositMillimes)}` : "ما تحدّدش"}
          >
            <input
              type="number"
              inputMode="decimal"
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              min={0}
              className="field field-sm w-full tabular-nums"
            />
          </Field>
          <Field label="ملاحظة" hint="اختياري">
            <input value={note} onChange={(event) => setNote(event.target.value)} className="field field-sm w-full" />
          </Field>
        </div>
        {offer ? (
          <p className="text-[0.6875rem] text-muted">
            الحجز يدوم {offer.validDays > 0 ? `${formatCount(offer.validDays)} يوم` : "بلا أجل"} · خلّي 0 كان
            الحريف ما خلّصش توّا.
          </p>
        ) : null}
      </section>

      {error ? <p className="card border-danger/40 px-3 py-2.5 text-sm text-danger">{error}</p> : null}
      {notice ? <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">{notice}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !treesReady || !whoReady}
        className="btn btn-primary w-full"
      >
        {pending ? "…" : "سجّل البيعة"}
      </button>
    </div>
  );
}

function Head({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-leaf-soft text-[0.625rem] font-bold text-forest">
        {n}
      </span>
      <h2 className="text-xs font-bold text-forest">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 flex items-baseline gap-1.5">
        <span className="text-[0.625rem] font-semibold text-muted">{label}</span>
        {hint ? <span className="text-[0.625rem] text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Switch<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return (
    <div className="ms-auto flex gap-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-lg px-2 py-1 text-[0.6875rem] font-semibold transition-colors ${
            value === key ? "bg-leaf-soft text-forest" : "text-muted hover:bg-paper hover:text-forest"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
