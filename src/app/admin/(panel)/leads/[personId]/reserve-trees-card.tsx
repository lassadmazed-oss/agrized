"use client";

// «احجز زيتونات لهذا الحريف» — the act the product was missing.
//
// The owner, 2026-09-18: «we just give each tree a number or an id and associate it with the client». The
// numbering shipped (600 trees carry codes); the association had no screen at all, so every tree sat at
// `available` with `held_by` null while public.staff_allocate_trees was written, role-checked, audited and
// tested. This card is the missing screen, and it is deliberately the ONLY place a reservation is made.
//
// WHY HERE AND NOT ON THE OFFER. The database gates allocation on app.can_see_person (0054 §7), not on
// app.can_manage_trees: an agricultural manager keeps stock but never reads a client file, so allocation is not
// theirs (tests/033 T7e pins the refusal), and a commercial may allocate only inside a file assigned to them
// (tests/034 §9). A reservation is therefore a CRM act, and it belongs on the file of the person who gets it.
//
// IT INVENTS NOTHING. The offer, the demand and the number of trees are the demand the client already sent
// (interest_requests.project_id / .id / .offer_trees); the live availability and the smallest basket come from
// staff_offer_stock; WHICH trees are handed out is the database's own decision — the lowest available numbers,
// all of them or none (FOR UPDATE SKIP LOCKED). Nothing here counts, computes or picks a tree.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { SectionHeader } from "@/components/ui";
import { intakeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";

import { allocateOfferTrees } from "../../projects/actions";

/** One demand this person sent on a real offer, with that offer's stock as it stands right now. */
export type ReserveChoice = {
  requestId: string;
  requestNo: string;
  projectId: string;
  offerName: string;
  offerCode: string | null;
  /** interest_requests.offer_trees: how many the client asked for. */
  askedTrees: number | null;
  /** staff_offer_stock.trees_available, read on this page load. */
  available: number;
  /** staff_offer_stock.min_trees: the offer's own minimum, or the setting's. */
  minTrees: number;
  /** False while nobody has numbered this offer's trees: there is nothing to hand out yet. */
  numbered: boolean;
  /**
   * How the client asked to pay, ready to read — «بالتقسيط · 546 د.ت شهرياً» or «بالحاضر». Null when the
   * demand carries no answer, which is every offer demand sent before the offer form asked the question.
   *
   * It arrives as a finished sentence because the labels and the money belong to the server page (../filters
   * and @/lib/format), and because reserving 200 numbered trees for someone who asked to spread them over
   * sixty months is a different act from selling them cash — the screen that performs it should say which.
   */
  planLabel: string | null;
};

type Done = { trees: number; firstCode: string | null; lastCode: string | null };

export function ReserveTreesCard({
  personId,
  personName,
  choices,
  reasonMin,
  defaultRequestId,
}: {
  personId: string;
  /** Written into the reason, so the audit row says who the trees went to without opening another screen. */
  personName: string;
  choices: readonly ReserveChoice[];
  /** settings audit.reason_min_length; app.require_reason checks it again (§51). */
  reasonMin: number;
  /** The demand the reader arrived from (?reserve=…), else the most recent one. */
  defaultRequestId?: string | null;
}) {
  const first = choices.find((choice) => choice.requestId === defaultRequestId) ?? choices[0] ?? null;
  const [requestId, setRequestId] = useState(first?.requestId ?? "");
  const [trees, setTrees] = useState(String(first?.askedTrees ?? first?.minTrees ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const choice = choices.find((item) => item.requestId === requestId) ?? first;

  if (!choice) {
    return (
      <section id="reserve-trees" className="card p-4">
        <SectionHeader as="h2" level={3} title="احجز زيتونات لهذا الحريف" className="mb-2" />
        <p className="text-sm leading-6 text-muted">
          الحجز يمشي على عرض حقيقي، وهذا الملفّ ما فيه كان محاكاة من الحاسبة. كلّم الحريف، وكي يختار عرض عبّي معاه
          استمارة «سجّل اهتمامك بهذا العرض» من صفحة العرض في الموقع، ومن بعد ترجع تحجز من هنا.
        </p>
      </section>
    );
  }

  const shut = !choice.numbered || choice.available < 1;

  function pick(nextRequestId: string) {
    const next = choices.find((item) => item.requestId === nextRequestId);
    if (!next) return;
    setRequestId(nextRequestId);
    setTrees(String(next.askedTrees ?? next.minTrees));
    setError(null);
    setDone(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice || shut) return;
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    const count = Number(trees);
    setError(null);
    setDone(null);

    // The same four refusals the database raises, said before the round trip and in the same words
    // (@/lib/errors) — never a second wording of the same rule.
    if (!Number.isInteger(count) || count < 1) {
      setError(intakeErrorMessage("invalid_offer_trees"));
      return;
    }
    if (count < choice.minTrees) {
      setError(intakeErrorMessage("below_min_trees"));
      return;
    }
    if (count > choice.available) {
      setError(intakeErrorMessage("not_enough_trees"));
      return;
    }
    if (reason.length < reasonMin) {
      setError(intakeErrorMessage("reason_required"));
      return;
    }

    startTransition(async () => {
      const result = await allocateOfferTrees({
        projectId: choice.projectId,
        personId,
        trees: count,
        reason: `${reason} — حجز لـ${personName} على المطلب ${choice.requestNo}.`,
        requestId: choice.requestId,
        state: "reserved",
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone({ trees: result.trees, firstCode: result.firstCode, lastCode: result.lastCode });
      form.reset();
      router.refresh();
    });
  }

  return (
    <section id="reserve-trees" className="card scroll-mt-24 p-4">
      <SectionHeader
        as="h2"
        level={3}
        title="احجز زيتونات لهذا الحريف"
        description="الحجز ياخذ أصغر أرقام متاحة في العرض، ياخذهم الكل ولا حتّى واحد."
        className="mb-3"
      />

      <form onSubmit={submit} className="space-y-3">
        {choices.length > 1 ? (
          <label className="block">
            <span className="label-sm">المطلب اللي نحجزو عليه</span>
            <select value={requestId} onChange={(event) => pick(event.target.value)} className="field field-sm" disabled={pending}>
              {choices.map((item) => (
                <option key={item.requestId} value={item.requestId}>
                  {item.offerName} · {item.requestNo}
                  {typeof item.askedTrees === "number" ? ` · طلب ${formatCount(item.askedTrees)} زيتونة` : ""}
                  {item.planLabel ? ` · ${item.planLabel}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">{choice.offerName}</span>
            {choice.offerCode ? (
              <span dir="ltr" className="ms-2 inline-block text-xs text-muted">
                {choice.offerCode}
              </span>
            ) : null}
            <span className="block text-xs text-muted">
              على المطلب <span dir="ltr" className="inline-block tabular-nums">{choice.requestNo}</span>
              {typeof choice.askedTrees === "number" ? ` · طلب ${formatCount(choice.askedTrees)} زيتونة` : ""}
            </span>
            {choice.planLabel ? <span className="block text-xs text-muted">طلب يخلّص {choice.planLabel}</span> : null}
          </p>
        )}

        {shut ? (
          <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
            {choice.numbered
              ? "ما فماش زيتونات متاحة في هذا العرض توّا. فكّ حجزاً قديماً، ولا اختار عرضاً آخر للحريف."
              : "زيتونات هذا العرض مازالت ما ترقّمتش، فما فماش شنوّة يتحجز."}{" "}
            <Link href={`/admin/projects/${choice.projectId}?tab=trees`} className="font-semibold underline underline-offset-4">
              افتح زيتونات العرض
            </Link>
          </p>
        ) : null}

        <label className="block">
          <span className="label-sm">عدد الزيتونات</span>
          <input
            type="number"
            inputMode="numeric"
            value={trees}
            onChange={(event) => setTrees(event.target.value)}
            min={choice.minTrees}
            max={choice.available || undefined}
            step={1}
            required
            disabled={pending || shut}
            className="field field-sm tabular-nums"
            dir="ltr"
          />
          <span className="hint mt-1 block">
            متاح توّا: <span className="tabular-nums">{formatCount(choice.available)}</span> زيتونة · أقلّ عدد في هذا
            العرض: <span className="tabular-nums">{formatCount(choice.minTrees)}</span>
          </span>
        </label>

        <ReasonField
          minLength={reasonMin}
          id={`reserve-reason-${personId}`}
          label="سبب الحجز"
          hint="يتسجّل في سجل العمليات مع أرقام الزيتونات، ومن بعد ما يتبدّلش."
        />

        {error ? (
          <p role="alert" className="error-text">
            {error}
          </p>
        ) : null}

        {done ? (
          <div role="status" className="rounded-xl bg-leaf-soft/60 px-4 py-3 text-sm leading-6 text-forest-700">
            <p className="font-semibold">تم الحجز: {formatCount(done.trees)} زيتونة.</p>
            {done.firstCode ? (
              <p className="mt-1">
                {done.firstCode === done.lastCode ? "رقمها: " : "من "}
                <span dir="ltr" className="inline-block font-semibold tabular-nums">
                  {done.firstCode}
                </span>
                {done.firstCode === done.lastCode ? null : (
                  <>
                    {" إلى "}
                    <span dir="ltr" className="inline-block font-semibold tabular-nums">
                      {done.lastCode}
                    </span>
                  </>
                )}
              </p>
            ) : null}
            <p className="mt-1">قول للحريف الأرقام هاذي: هي اللي تتسمّى في العقد، وتلقاها تحت في «زيتونات هذا الحريف».</p>
          </div>
        ) : null}

        <button type="submit" disabled={pending || shut} className="btn btn-primary btn-sm">
          {pending ? "جارٍ الحجز…" : "احجز الزيتونات"}
        </button>
      </form>
    </section>
  );
}
