import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";
import { moneyWordsAr } from "@/lib/money-words";

import { FIELD_ROLES, phoneDisplay, waHref } from "../../field-model";
import { readReceipt } from "../../read";

import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "الوصل" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «يعطيه توصيل» — the receipt for a deposit taken on the land. Everything on it is read from the payment
 * (field_receipt); the title and the sentence are the owner's settings (field.receipt_title / _note). It
 * prints on one page, and goes to the client on WhatsApp as text from the commercial's own phone.
 */
export default async function ReceiptPage({ params }: PageProps<"/admin/terrain/receipt/[paymentId]">) {
  await requireStaff(FIELD_ROLES);
  const { paymentId } = await params;
  if (!UUID.test(paymentId)) notFound();

  const { data: receipt } = await readReceipt(paymentId);
  if (!receipt) notFound();

  const reservation = receipt.reservation;
  const until = reservation?.expires_at ? formatDate(reservation.expires_at) : "";
  const note = receipt.note.replaceAll("{date}", until).trim();
  const words = moneyWordsAr(receipt.amount_millimes);
  const amount = formatMillimes(receipt.amount_millimes);
  const place = [receipt.offer?.delegation, receipt.offer?.governorate].filter(Boolean).join("، ");
  const trees = reservation ? `${formatCount(reservation.trees_count)} زيتونة` : "";
  const codes =
    reservation?.first_code && reservation.last_code && reservation.last_code !== reservation.first_code
      ? `${reservation.first_code} → ${reservation.last_code}`
      : (reservation?.first_code ?? "");

  const text = [
    `AgriZed · ${receipt.title}`,
    receipt.company,
    `رقم الوصل: ${receipt.reference_no}`,
    `${receipt.person?.full_name ?? ""}، استلمنا منك ${amount} عربون.`,
    reservation ? `مقابل حجز ${trees} في ${receipt.offer?.name ?? reservation.offer_name}${codes ? ` (${codes})` : ""}.` : "",
    until ? `الزيتونات محجوزة باسمك حتى ${until}.` : "",
    receipt.contact_phone ? `للاستفسار: ${receipt.contact_phone}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const wa = waHref(receipt.person?.whatsapp_e164 ?? receipt.person?.phone_e164 ?? null, text);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <PrintButton />
        {wa ? (
          <a href={wa} target="_blank" rel="noreferrer" className="btn btn-secondary min-h-12 flex-1">
            💬 ابعثو بالواتساب
          </a>
        ) : null}
        {reservation ? (
          <Link href={`/admin/terrain/${reservation.person_id}`} className="btn btn-ghost min-h-12">
            رجوع
          </Link>
        ) : null}
      </div>

      <article className="card space-y-5 p-6 print:border-0 print:shadow-none sm:p-8">
        {receipt.voided ? (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-center font-bold text-danger">الوصل هذا ملغى</p>
        ) : null}

        <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="font-display text-2xl font-bold text-forest">🫒 AgriZed</p>
            {receipt.company ? <p className="text-xs leading-5 text-ink/80">{receipt.company}</p> : null}
            {receipt.address ? <p className="text-xs leading-5 text-muted">{receipt.address}</p> : null}
            <h1 className="mt-2 text-lg font-bold text-ink">{receipt.title}</h1>
          </div>
          <div className="text-end text-sm leading-6 text-muted">
            <p dir="ltr" className="font-semibold text-ink">
              {receipt.reference_no}
            </p>
            <p>{formatDateTime(receipt.received_at)}</p>
          </div>
        </header>

        <dl className="space-y-3 leading-7">
          <Row label="استلمنا من">
            {receipt.person?.full_name}
            {receipt.person?.phone_e164 ? (
              <span dir="ltr" className="ms-2 text-sm text-muted">
                {phoneDisplay(receipt.person.phone_e164)}
              </span>
            ) : null}
          </Row>
          <Row label="المبلغ">
            <span className="text-2xl font-bold text-forest">{amount}</span>
            {words ? <span className="block text-sm text-muted">{words}</span> : null}
          </Row>
          {receipt.method_label ? <Row label="طريقة الخلاص">{receipt.method_label}</Row> : null}
          {reservation ? (
            <Row label="مقابل حجز">
              {trees} في {receipt.offer?.name ?? reservation.offer_name}
              {place ? <span className="block text-sm text-muted">{place}</span> : null}
              {codes ? (
                <span dir="ltr" className="block text-sm text-muted">
                  {codes}
                </span>
              ) : null}
            </Row>
          ) : null}
          {reservation ? (
            <Row label="رقم الحجز">
              <span dir="ltr">{reservation.reference_no}</span>
            </Row>
          ) : null}
          {receipt.recorded_by ? <Row label="استلمها">{receipt.recorded_by}</Row> : null}
        </dl>

        {note ? <p className="rounded-xl bg-paper p-4 leading-7 text-ink">{note}</p> : null}

        <div className="grid grid-cols-2 gap-6 pt-6 text-center text-sm text-muted">
          <div className="border-t border-line-strong pt-2">إمضاء الحريف</div>
          <div className="border-t border-line-strong pt-2">إمضاء AgriZed</div>
        </div>

        {receipt.contact_phone ? (
          <p className="text-center text-xs text-muted">
            للاستفسار: <span dir="ltr">{receipt.contact_phone}</span>
          </p>
        ) : null}
      </article>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{children}</dd>
    </div>
  );
}
