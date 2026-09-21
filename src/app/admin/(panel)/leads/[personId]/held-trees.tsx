"use client";

// «زيتونات هذا الحريف» — the proof, read from the client's side.
//
// Until now this fact was only visible from the other end, on the offer's الزيتونات tab: the stock knew who held
// what, and the client file — the screen a commercial actually opens before picking up the phone — could not
// answer «شنوّة يملك هذا الحريف؟». It answers it here, with the codes, because the code is the thing the client
// is told and the thing a contract names.
//
// It also carries the two moves that come after the reservation, each gated exactly as the database gates it:
//
//   «علّم المحجوزة مباعة»  staff_set_tree_state(state = 'sold'), app.can_contract_trees → Legal, Finance, Admin.
//                          The contract moment (§51).
//   «فكّ الحجز»            staff_set_tree_state(state = 'available'), app.can_manage_trees AND, because every
//                          held tree has a holder, app.can_see_person(held_by) as well (0054 §7). The two lists
//                          intersect on Finance and Admin only: an agricultural manager keeps stock but reads no
//                          client file, and a commercial reads the file but keeps no stock. Neither is shown the
//                          button, because the database would refuse them and a control a reader may never press
//                          is a lie about what they can do.
//
// A sold tree gets no button here on purpose: undoing a contract is stock keeping, and it is done from the
// offer's الزيتونات tab where the whole inventory is in view, not from one client's file.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { StatusPill } from "@/components/ui";
import { intakeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate } from "@/lib/format";

import { setTreeState } from "../../projects/actions";

export type HeldTree = {
  id: string;
  code: string;
  /** public.tree_state, minus 'available': an available tree holds nobody. */
  state: "reserved" | "sold";
  allocatedAt: string | null;
};

export type HeldOffer = {
  projectId: string;
  offerName: string;
  offerCode: string | null;
  /** In tree order (seq), so the codes read as the block they were handed out as. */
  trees: readonly HeldTree[];
};

/** The Arabic of the two states lives in settings (offers.stock_*), like everywhere else. */
export type StateLabels = { reserved: string; sold: string };

export function HeldTreesSection({
  offers,
  labels,
  canContract,
  canRelease,
  reasonMin,
  cappedAt,
}: {
  offers: readonly HeldOffer[];
  labels: StateLabels;
  /** app.can_contract_trees: Legal, Finance, Admin. */
  canContract: boolean;
  /** app.can_manage_trees ∩ app.can_see_person: Finance, Admin. */
  canRelease: boolean;
  reasonMin: number;
  /** Set when the read hit its limit, so the screen says it is showing a part and not the whole. */
  cappedAt: number | null;
}) {
  const total = offers.reduce((sum, offer) => sum + offer.trees.length, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">زيتونات هذا الحريف ({formatCount(total)})</h2>
        <p className="text-sm text-muted">كل زيتونة برقمها، كيما تتسمّى في العقد.</p>
      </div>

      {offers.map((offer) => (
        <HeldOfferCard
          key={offer.projectId}
          offer={offer}
          labels={labels}
          canContract={canContract}
          canRelease={canRelease}
          reasonMin={reasonMin}
        />
      ))}

      {cappedAt ? (
        <p className="hint">
          نعرضو أول <span className="tabular-nums">{formatCount(cappedAt)}</span> زيتونة برك، والعمليات تحت تمشي على
          هاذوما. البقية تلقاهم في تبويب «الزيتونات» متاع العرض.
        </p>
      ) : null}

      <p className="hint">
        بعد «{labels.sold}» المنصة توقف هنا: ما فماش بعد عقد ولا جدول أقساط ولا زيارة مسجّلة — الوحدات هاذي مازالت ما
        تبناتش. سجّل البقية في «ملاحظة» في هذا الملفّ حتى توفى.
      </p>
    </section>
  );
}

function HeldOfferCard({
  offer,
  labels,
  canContract,
  canRelease,
  reasonMin,
}: {
  offer: HeldOffer;
  labels: StateLabels;
  canContract: boolean;
  canRelease: boolean;
  reasonMin: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const reserved = offer.trees.filter((tree) => tree.state === "reserved");
  const sold = offer.trees.filter((tree) => tree.state === "sold");
  const first = offer.trees[0];
  const last = offer.trees[offer.trees.length - 1];
  const acts = (canContract || canRelease) && reserved.length > 0;

  function run(state: "sold" | "available") {
    const form = formRef.current;
    // The browser says the reason is missing, in its own bubble, before anything is sent.
    if (!form || !form.reportValidity()) return;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    setError(null);
    setDone(null);
    if (reason.length < reasonMin) {
      setError(intakeErrorMessage("reason_required"));
      return;
    }

    const ids = reserved.map((tree) => tree.id);
    startTransition(async () => {
      const result = await setTreeState({
        treeIds: ids,
        state,
        reason: `${reason} — ${state === "sold" ? "تسجيل العقد" : "فكّ الحجز"} من ملفّ الحريف على العرض ${offer.offerCode ?? offer.offerName}.`,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(
        state === "sold"
          ? `تسجّل العقد: ${formatCount(result.trees)} زيتونة ولّات «${labels.sold}».`
          : `تفكّ الحجز على ${formatCount(result.trees)} زيتونة، ورجعت متاحة في هذا العرض.`,
      );
      form.reset();
      router.refresh();
    });
  }

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/admin/projects/${offer.projectId}?tab=trees`}
            className="font-semibold text-forest underline-offset-4 hover:underline"
          >
            {offer.offerName}
          </Link>
          {offer.offerCode ? (
            <span dir="ltr" className="text-xs text-muted">
              {offer.offerCode}
            </span>
          ) : null}
        </p>
        <p className="flex flex-wrap items-center gap-tight text-sm">
          {reserved.length > 0 ? (
            <StatusPill tone="warning">
              {formatCount(reserved.length)} {labels.reserved}
            </StatusPill>
          ) : null}
          {sold.length > 0 ? (
            <StatusPill tone="success">
              {formatCount(sold.length)} {labels.sold}
            </StatusPill>
          ) : null}
        </p>
      </div>

      {first && last ? (
        <p className="mt-2 text-sm text-muted">
          الأرقام:{" "}
          <span dir="ltr" className="inline-block font-semibold text-ink tabular-nums">
            {first.code === last.code ? first.code : `${first.code} → ${last.code}`}
          </span>
        </p>
      ) : null}

      <details className="disclosure mt-3">
        <summary className="text-sm font-semibold text-forest">شوف الأرقام وحدة وحدة</summary>
        <ul className="flex flex-wrap gap-tight">
          {offer.trees.map((tree) => (
            <li key={tree.id}>
              {/* A badge, not a control: .pill-line is the hairline badge, .chip is something you pick. */}
              <span className="pill pill-line" title={tree.allocatedAt ? formatDate(tree.allocatedAt) : undefined}>
                <span dir="ltr" className="font-semibold text-ink tabular-nums">
                  {tree.code}
                </span>
                {tree.state === "sold" ? labels.sold : labels.reserved}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {acts ? (
        <form ref={formRef} className="mt-4 space-y-3 border-t border-line pt-4" onSubmit={(event) => event.preventDefault()}>
          <ReasonField
            minLength={reasonMin}
            id={`held-reason-${offer.projectId}`}
            label="سبب العملية"
            hint="يتسجّل في سجل العمليات مع حالة كل زيتونة قبل وبعد، ومن بعد ما يتبدّلش."
            rows={2}
          />
          <div className="flex flex-wrap gap-tight">
            {canContract ? (
              <button type="button" onClick={() => run("sold")} disabled={pending} className="btn btn-primary btn-sm">
                {pending ? "جارٍ الحفظ…" : `علّم ${formatCount(reserved.length)} زيتونة «${labels.sold}»`}
              </button>
            ) : null}
            {canRelease ? (
              <button type="button" onClick={() => run("available")} disabled={pending} className="btn btn-secondary btn-sm">
                {pending ? "جارٍ الحفظ…" : `فكّ الحجز على ${formatCount(reserved.length)} زيتونة`}
              </button>
            ) : null}
          </div>
          <p className="hint">
            العمليتين يمشيو على الزيتونات «{labels.reserved}» في هذا العرض برك. «{labels.sold}» هي لحظة العقد.
          </p>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-3 text-sm font-medium text-success">
          {done}
        </p>
      ) : null}
    </article>
  );
}
