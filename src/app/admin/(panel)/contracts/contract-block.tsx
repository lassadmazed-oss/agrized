"use client";

// One contract, said the way a commercial says it down the phone: who, on what land, how many trees, at what
// price, over how long, and where they are in it. The same block is used by /admin/contracts and by the
// client file, because a contract is one object and reading it twice in two different shapes is how two
// screens start disagreeing — which is also why app.contract_payload returns the SAME full payload to the
// queue, the client file and the document page.
//
// EVERY FIGURE HERE WAS DECIDED IN POSTGRES. The monthly, the instalment count, the balance, how many
// instalments have been paid, how late the file is and which rung of §31's ladder it sits on all arrive from
// app.contract_money. This file formats them and works nothing out — and in a module that is entirely about
// money that rule has no exception. app.financed_quote rounds the monthly UP and recomputes the count from
// it, so `monthly × months` is not the balance; on this database's own rows it overcharges four plans in five.
//
// WHY THE CONTROLS ARE NOT ALWAYS DRAWN. Three gates, each mirroring a rule the database holds:
//   the modules  `installments` closes recording an instalment (app.assert_installments_open). With it off the
//                block shows the facts, says which switch is off, and draws no button that would be refused.
//   the roles    recording money is app.can_record_money (Finance · Admin), which is NOT the list that may
//                sign — «signing the contract and taking the cash are two different desks» (0063:98).
//   the state    a cancelled contract takes no more money; a cash contract has no schedule to record against,
//                and its money is taken on the contract's own page under «الخلاص بالحاضر».

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { StatusPill } from "@/components/ui";
import { formatCount, formatDate } from "@/lib/format";

import {
  CONTRACT_TONES,
  daysLateLabel,
  isOpen,
  lineTone,
  nextLine,
  planLine,
  progressLabel,
  STAGE_TONES,
  stageWorthShowing,
  type Contract,
  formatAmount,
} from "@/lib/backoffice/contracts/model";
import { RecordPaymentForm, type PaymentMethod } from "./payment-forms";

export type { PaymentMethod };

export type ContractBlockProps = {
  contract: Contract;
  methods: readonly PaymentMethod[];
  reasonMin: number;
  /** app.can_record_money(): Finance, Admin, Super Admin. Legal may sign and may not take cash. */
  canRecordMoney: boolean;
  /** The `installments` flag is not «معطّل», so staff_record_installment will accept a call. */
  installmentsOpen: boolean;
  /** The queue names the client; their own file already does. */
  showPerson?: boolean;
};

export function ContractBlock({
  contract,
  methods,
  reasonMin,
  canRecordMoney,
  installmentsOpen,
  showPerson = false,
}: ContractBlockProps) {
  const [recording, setRecording] = useState(false);

  const money = contract.money;
  const next = nextLine(contract);
  const open = isOpen(contract);
  const canRecord = installmentsOpen && canRecordMoney && open && next !== null;
  const plan = planLine(contract, formatAmount);
  const progress = progressLabel(contract);
  const late = daysLateLabel(next?.daysLate ?? null);

  return (
    <article className="card p-cozy space-y-3">
      <header className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-tight">
          <StatusPill tone={CONTRACT_TONES[contract.status]}>{contract.statusLabel}</StatusPill>
          {stageWorthShowing(money.stage) ? (
            <StatusPill tone={STAGE_TONES[money.stage]}>{money.stageLabel}</StatusPill>
          ) : null}
          {contract.ownedAt ? <StatusPill tone="brand">ولّى مالك</StatusPill> : null}
          <Link
            href={`/admin/contracts/${contract.id}`}
            dir="ltr"
            className="text-xs tabular-nums text-muted underline-offset-4 hover:text-forest hover:underline"
          >
            {contract.referenceNo}
          </Link>
        </div>

        <p className="text-sm font-semibold">
          {showPerson && contract.personName ? (
            <>
              <Link href={`/admin/leads/${contract.personId}`} className="underline-offset-4 hover:underline">
                {contract.personName}
              </Link>
              <span className="mx-1 text-muted">·</span>
            </>
          ) : null}
          <Link href={`/admin/projects/${contract.projectId}`} className="underline-offset-4 hover:underline">
            {contract.offerName ?? "عرض"}
          </Link>
        </p>

        <p className="hint">
          {contract.kindLabel ?? "عقد"}
          {contract.signedOn ? ` · تمضى يوم ${formatDate(contract.signedOn)}` : " · مازال ما تمضاش"}
          {contract.reservationNo ? (
            <>
              {" · على الحجز "}
              <span dir="ltr" className="inline-block tabular-nums">
                {contract.reservationNo}
              </span>
            </>
          ) : null}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-tight sm:grid-cols-4">
        <Figure label="الزيتونات">
          <span className="tabular-nums">{formatCount(contract.treesCount)}</span>
          {contract.treesStillReserved > 0 ? (
            <span className="ms-1 text-xs text-danger">مازال {formatCount(contract.treesStillReserved)} محجوز</span>
          ) : null}
        </Figure>

        <Figure label="الثمن بالحاضر">
          <span className="tabular-nums">{formatAmount(contract.totalPriceMillimes)}</span>
        </Figure>

        <Figure label="خلّص">
          <span className="tabular-nums">{formatAmount(money.totalPaidMillimes)}</span>
          <span className="ms-1 text-xs text-muted">من {formatAmount(money.totalDueMillimes)}</span>
        </Figure>

        {/* The balance means the same thing in both modes — what is still owed — so it is one figure and not
            two. A cash contract with nothing recorded owes its whole price, which is the fact a reader needs. */}
        <Figure label="الباقي">
          <span className={`tabular-nums ${money.totalLeftMillimes === 0 ? "text-muted" : ""}`}>
            {formatAmount(money.totalLeftMillimes)}
          </span>
        </Figure>
      </dl>

      {plan ? (
        <p className="text-sm">
          <span className="text-muted">خطة الخلاص: </span>
          <span className="font-semibold tabular-nums">{plan}</span>
          {contract.totalFinancedMillimes !== null ? (
            <span className="text-muted">
              {" · الجملة بالتقسيط "}
              <span className="tabular-nums">{formatAmount(contract.totalFinancedMillimes)}</span>
            </span>
          ) : null}
        </p>
      ) : null}

      {contract.firstCode ? (
        <p className="text-sm">
          <span className="text-muted">أرقام الزيتونات: </span>
          <span dir="ltr" className="inline-block font-semibold tabular-nums">
            {contract.firstCode === contract.lastCode ? contract.firstCode : `${contract.firstCode} … ${contract.lastCode}`}
          </span>
        </p>
      ) : null}

      {/* ONE line about the schedule, never eighty-four: the queue answers «where is this client in the
          plan», and the document page answers «which instalment, exactly». */}
      {contract.paymentMode === "installments" ? (
        <div className="panel flex flex-wrap items-center justify-between gap-tight p-cozy text-sm">
          <div className="min-w-0">
            <p className="font-semibold">
              {progress ?? "جدول الأقساط مازال ما تولّدش"}
              {money.missedCount > 0 ? (
                <span className="ms-2 font-normal text-danger">· {formatCount(money.missedCount)} قسط متأخّر</span>
              ) : null}
            </p>
            <p className="hint mt-0.5">
              {next ? (
                <>
                  القسط {next.seq} يوم {formatDate(next.dueOn)} ·{" "}
                  <span className="tabular-nums">{formatAmount(next.leftMillimes)}</span>
                  {late ? ` · ${late}` : null}
                </>
              ) : contract.schedulePending ? (
                "الجدول يتولّد كي يتشغّل موديول «الأقساط»."
              ) : money.installmentsCount > 0 ? (
                "ما فماش قسط مستحقّ — الجدول كمّل."
              ) : (
                "ما فماش جدول."
              )}
            </p>
          </div>
          {next ? <StatusPill tone={lineTone(next)}>{next.statusLabel}</StatusPill> : null}
        </div>
      ) : (
        // A cash contract has zero schedule rows by design, so the same strip says the one thing there is to
        // say about its money. It is taken on the contract's own page, under «الخلاص بالحاضر».
        <div className="panel flex flex-wrap items-center justify-between gap-tight p-cozy text-sm">
          <p className="min-w-0">
            <span className="text-muted">بالحاضر — خلّص </span>
            <span className="font-semibold tabular-nums">{formatAmount(money.downPaymentPaidMillimes)}</span>
            <span className="text-muted">
              {" من "}
              <span className="tabular-nums">{formatAmount(money.downPaymentDueMillimes)}</span>
            </span>
          </p>
          {money.downPaymentLeftMillimes === 0 ? <StatusPill tone="success">تخلّص</StatusPill> : null}
        </div>
      )}

      {/* §31, rung four: the software has said its piece and the decision is a human's, outside it. The
          banner names that plainly so nobody waits for the system to do something it never will. */}
      {money.stage === "critical" ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
          <span className="font-semibold">الملفّ في حالة حرجة.</span> النظام ما يفسخش عقد وحدو: كلّم القانوني
          والإدارة باش ياخذو القرار حسب العقد والقانون، ومن بعد سجّلو هنا.
        </p>
      ) : null}

      {open && !installmentsOpen && contract.paymentMode === "installments" ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          موديول «الأقساط» معطّل، فما تنجمش تسجّل قسط من هنا
          {contract.schedulePending ? "، والجدول مازال ما تولّدش" : ""}.{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            شغّلو من الموديولات
          </Link>
          .
        </p>
      ) : null}

      <div className="flex flex-wrap gap-tight">
        {canRecord ? (
          <button type="button" onClick={() => setRecording((value) => !value)} className="btn btn-primary btn-sm">
            {recording ? "رجوع" : "سجّل قسط"}
          </button>
        ) : null}
        <Link href={`/admin/contracts/${contract.id}`} className="btn btn-secondary btn-sm">
          افتح العقد
        </Link>
      </div>

      {canRecord && recording && next ? (
        <RecordPaymentForm
          contract={contract}
          installment={next}
          methods={methods}
          reasonMin={reasonMin}
          onDone={() => setRecording(false)}
        />
      ) : null}
    </article>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label-sm">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}
