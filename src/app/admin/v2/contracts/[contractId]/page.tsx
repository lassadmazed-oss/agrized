import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { readContract } from "@/lib/backoffice/contracts/read";

import { Schedule } from "./schedule";

export const metadata: Metadata = { title: "العقد" };

/**
 * عقد — what was sold, what was paid, and what is still owed.
 *
 * THE UNSIGNED CONTRACT IS CALLED OUT AT THE TOP. `schedulePending` means signed, on instalments, and with no
 * schedule — and a draft has none either. In both states the contract appears in no finance queue, because
 * staff_installments has nothing to list. Money nobody can see is the worst failure this screen can hide, so
 * it is the first thing on it.
 *
 * `treesSold` AND `treesStillReserved` ARE PRINTED WHEN THEY DISAGREE with the contract's own count. The
 * contract says what was sold; public.trees says what is actually marked sold this second. §46 forbids the
 * system from selling 501 of 500, and the only way to keep that promise is to show the divergence rather
 * than pick whichever number looks better.
 */
export default async function ContractPage({ params }: PageProps<"/admin/v2/contracts/[contractId]">) {
  await requireStaff();
  const { contractId } = await params;
  const supabase = await createClient();

  const contract = await readContract(supabase, contractId);
  if (!contract) notFound();

  const instalments = contract.paymentMode === "installments";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="section-title" dir="ltr">
          {contract.referenceNo}
        </h1>
        <Link href="/admin/v2/contracts" className="text-sm text-muted hover:text-forest">
          رجوع للعقود
        </Link>
      </div>

      {contract.schedulePending || (instalments && !contract.scheduleGeneratedAt) ? (
        <p className="card border-gold/50 p-4 text-sm text-forest">
          هذا العقد بالتقسيط وما عندوش جدول أقساط، ومعناها ما يظهر في حتّى قائمة أقساط. يلزم يتمضى، ومن بعد
          يتولّد الجدول.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="stat-label">السعر الجملي</p>
          <p className="stat-figure">{formatMillimes(contract.totalPriceMillimes)}</p>
          <p className="text-xs text-muted">{formatCount(contract.treesCount)} زيتونة</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">المتبقّي</p>
          <p className="stat-figure">
            {contract.remainingMillimes === null ? "—" : formatMillimes(contract.remainingMillimes)}
          </p>
          <p className="text-xs text-muted">{instalments ? "بالتقسيط" : "بالحاضر"}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">الأقساط الباقية</p>
          <p className="stat-figure">
            {contract.money.installmentsCount > 0
              ? `${formatCount(contract.money.installmentsCount - contract.money.installmentsPaidCount)} / ${formatCount(contract.money.installmentsCount)}`
              : "—"}
          </p>
          {contract.money.nextDueOn ? (
            <p className="text-xs text-muted">
              الجاي {formatDate(contract.money.nextDueOn)}
              {contract.money.nextDueMillimes ? ` · ${formatMillimes(contract.money.nextDueMillimes)}` : ""}
            </p>
          ) : contract.monthlyMillimes ? (
            <p className="text-xs text-muted">القسط {formatMillimes(contract.monthlyMillimes)}</p>
          ) : null}
        </div>
      </div>

      <div className="card divide-y divide-line p-4">
        <Row label="العميل">
          <Link href={`/admin/v2/files/${contract.personId}`} className="text-forest hover:underline">
            {contract.personName ?? "بلا اسم"}
          </Link>
        </Row>
        {contract.personPhone ? (
          <Row label="التلفون">
            <span dir="ltr">{contract.personPhone}</span>
          </Row>
        ) : null}
        <Row label="العرض">{contract.offerName ?? "—"}</Row>
        <Row label="الحجز">
          <Link href={`/admin/v2/reservations/${contract.reservationId}`} className="text-forest hover:underline" dir="ltr">
            {contract.reservationNo ?? "—"}
          </Link>
        </Row>
        <Row label="الزيتونات">
          {formatCount(contract.treesCount)}
          {contract.treesSold !== contract.treesCount ? ` (تباعت ${formatCount(contract.treesSold)})` : ""}
          {contract.treesStillReserved > 0 ? ` · ${formatCount(contract.treesStillReserved)} مازالت محجوزة` : ""}
        </Row>
        {contract.firstCode ? (
          <Row label="الأرقام">
            <span dir="ltr">
              {contract.firstCode}
              {contract.lastCode && contract.lastCode !== contract.firstCode ? ` → ${contract.lastCode}` : ""}
            </span>
          </Row>
        ) : null}
        {contract.kindLabel ? <Row label="نوع العقد">{contract.kindLabel}</Row> : null}
        <Row label="الحالة">{contract.statusLabel}</Row>
        <Row label="الإمضاء">
          {contract.signedOn ? formatDate(contract.signedOn) : "ما تمضاش"}
        </Row>
        {contract.legalDocumentRef ? <Row label="رقم الوثيقة">{contract.legalDocumentRef}</Row> : null}
        {contract.reservationDepositMillimes > 0 ? (
          <Row label="العربون">{formatMillimes(contract.reservationDepositMillimes)}</Row>
        ) : null}
      </div>

      <Schedule
        contractId={contract.id}
        lines={contract.money.lines.map((line) => ({
          id: line.id,
          seq: line.seq,
          dueOn: line.dueOn,
          amountMillimes: line.amountMillimes,
          paidMillimes: line.paidMillimes,
          leftMillimes: line.leftMillimes,
          statusLabel: line.statusLabel,
          isLate: line.isLate,
          daysLate: line.daysLate,
        }))}
      />

      {contract.payments.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">الخلاصات ({formatCount(contract.payments.length)})</h2>
          <ul className="grid gap-2">
            {contract.payments.map((payment) => (
              <li key={payment.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <span className="font-semibold text-ink">{formatMillimes(payment.amountMillimes)}</span>
                <span className="text-xs text-muted">{formatDate(payment.receivedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {instalments ? (
        <Link href="/admin/v2/installments" className="btn btn-secondary w-full sm:w-auto">
          شوف الأقساط
        </Link>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}
