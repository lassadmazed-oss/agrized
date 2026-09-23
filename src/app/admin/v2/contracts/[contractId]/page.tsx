import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readContract } from "@/lib/backoffice/contracts/read";
import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Fact, Facts, Screen, Tile, Tiles } from "../../ui";

import { Schedule } from "./schedule";

export const metadata: Metadata = { title: "العقد" };

/**
 * عقد — what was sold, what was paid, and what is still owed.
 *
 * THE IDENTITY IS A GRID, NOT A COLUMN. Eleven facts stacked one per line ran 500px down a screen that is
 * 1900px wide and empty either side of them (owner, 2026-09-23). The same eleven in three columns are four
 * rows and one glance.
 *
 * THE UNSIGNED CONTRACT IS CALLED OUT AT THE TOP. `schedulePending` means signed, on instalments, with no
 * schedule — and a draft has none either. In both states the contract appears in no finance queue, because
 * staff_installments has nothing to list. Money nobody can see is the worst thing this screen could hide.
 *
 * `treesSold` AND `treesStillReserved` ARE PRINTED ONLY WHEN THEY DISAGREE with the contract's own count.
 * The contract says what was sold; public.trees says what is marked sold this second. §46 forbids selling
 * 501 of 500, and the only way to keep that promise is to show the divergence rather than pick a number.
 */
export default async function ContractPage({ params }: PageProps<"/admin/v2/contracts/[contractId]">) {
  await requireStaff();
  const { contractId } = await params;
  const supabase = await createClient();

  const contract = await readContract(supabase, contractId);
  if (!contract) notFound();

  const instalments = contract.paymentMode === "installments";
  const left = contract.money.installmentsCount - contract.money.installmentsPaidCount;

  return (
    <Screen
      title={contract.referenceNo}
      action={
        <Link href="/admin/v2/contracts" className="text-xs text-muted hover:text-forest">
          رجوع
        </Link>
      }
    >
      {contract.schedulePending || (instalments && !contract.scheduleGeneratedAt) ? (
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          عقد بالتقسيط بلا جدول — ما يظهرش في قائمة الأقساط. يلزم يتمضى، ومن بعد يتولّد الجدول.
        </p>
      ) : null}

      <Tiles>
        <Tile
          label="السعر الجملي"
          value={formatMillimes(contract.totalPriceMillimes)}
          note={`${formatCount(contract.treesCount)} زيتونة`}
        />
        <Tile
          label="المتبقّي"
          value={contract.remainingMillimes === null ? "—" : formatMillimes(contract.remainingMillimes)}
          note={instalments ? "بالتقسيط" : "بالحاضر"}
        />
        <Tile
          label="الأقساط الباقية"
          value={
            contract.money.installmentsCount > 0
              ? `${formatCount(left)} / ${formatCount(contract.money.installmentsCount)}`
              : "—"
          }
          note={
            contract.money.nextDueOn
              ? `الجاي ${formatDate(contract.money.nextDueOn)}${
                  contract.money.nextDueMillimes ? ` · ${formatMillimes(contract.money.nextDueMillimes)}` : ""
                }`
              : contract.monthlyMillimes
                ? `القسط ${formatMillimes(contract.monthlyMillimes)}`
                : undefined
          }
          tone={contract.money.missedCount > 0 ? "danger" : undefined}
        />
      </Tiles>

      <Facts>
        <Fact label="العميل">
          <Link href={`/admin/v2/files/${contract.personId}`} className="text-forest hover:underline">
            {contract.personName ?? "بلا اسم"}
          </Link>
        </Fact>
        <Fact label="التلفون">
          {contract.personPhone ? <span dir="ltr">{contract.personPhone}</span> : undefined}
        </Fact>
        <Fact label="العرض">{contract.offerName ?? undefined}</Fact>
        <Fact label="الحجز">
          <Link
            href={`/admin/v2/reservations/${contract.reservationId}`}
            className="text-forest hover:underline"
            dir="ltr"
          >
            {contract.reservationNo ?? "—"}
          </Link>
        </Fact>
        <Fact label="الزيتونات">
          {`${formatCount(contract.treesCount)}${
            contract.treesSold !== contract.treesCount ? ` (تباعت ${formatCount(contract.treesSold)})` : ""
          }${contract.treesStillReserved > 0 ? ` · ${formatCount(contract.treesStillReserved)} محجوزة` : ""}`}
        </Fact>
        <Fact label="الأرقام">
          {contract.firstCode ? (
            <span dir="ltr">
              {contract.firstCode}
              {contract.lastCode && contract.lastCode !== contract.firstCode ? ` → ${contract.lastCode}` : ""}
            </span>
          ) : undefined}
        </Fact>
        <Fact label="نوع العقد">{contract.kindLabel ?? undefined}</Fact>
        <Fact label="الحالة">{contract.statusLabel}</Fact>
        <Fact label="الإمضاء">{contract.signedOn ? formatDate(contract.signedOn) : "ما تمضاش"}</Fact>
        <Fact label="رقم الوثيقة">{contract.legalDocumentRef ?? undefined}</Fact>
        <Fact label="العربون">
          {contract.reservationDepositMillimes > 0
            ? formatMillimes(contract.reservationDepositMillimes)
            : undefined}
        </Fact>
        <Fact label="الخلاصات">
          {contract.payments.length > 0 ? formatCount(contract.payments.length) : undefined}
        </Fact>
      </Facts>

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
    </Screen>
  );
}
