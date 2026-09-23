import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { readReservation } from "@/lib/backoffice/reservations/read";
import { requireStaff } from "@/lib/auth";
import { formatCount, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Fact, Facts, Screen } from "../../../ui";

import { CompleteForm } from "./complete-form";

export const metadata: Metadata = { title: "تأكيد البيع" };

/**
 * تأكيد البيع — the human checkpoint before the company commits.
 *
 * WHY A WHOLE SCREEN FOR A SUMMARY. Everything above it was reversible: a hold expires, a عربون can be
 * voided. What happens after it is a contract with a client's name and CIN on it. The owner asked for this
 * step by name («confirmation page … this is basically your human verification checkpoint»), and the reason
 * it earns a screen rather than a line in a dialog is that it is the last place someone can notice the wrong
 * client, the wrong offer, or nine trees where ten were promised.
 *
 * IT REFUSES WITHOUT A CIN. A contract names its buyer by national identity card; a sale confirmed against a
 * file that has none produces a paper nobody can match to a person. The identity is filled on the client's
 * file, and this screen says so rather than failing at the press.
 *
 * NOTHING HERE IS PRE-FILLED FROM THE DEMAND. What the visitor typed into the public calculator is what they
 * WANTED; the commercial arrangement is what the company agreed after the call, and it is typed below.
 */
export default async function CompletePage({
  params,
}: PageProps<"/admin/v2/reservations/[reservationId]/complete">) {
  await requireStaff();
  const { reservationId } = await params;
  const supabase = await createClient();

  const reservation = await readReservation(supabase, reservationId);
  if (!reservation) notFound();

  const [{ data: person }, { data: kinds }, { data: methods }] = await Promise.all([
    supabase.from("persons").select("id, full_name, phone_e164, cin").eq("id", reservation.personId).maybeSingle(),
    supabase.from("option_items").select("id, label_ar").eq("list_key", "contract_kind").eq("is_active", true).order("sort_order"),
    supabase.from("option_items").select("id, label_ar").eq("list_key", "payment_method").eq("is_active", true).order("sort_order"),
  ]);

  const depositSettled = reservation.depositLeftMillimes <= 0;

  return (
    <Screen
      title="تأكيد البيع"
      action={
        <Link href={`/admin/v2/reservations/${reservationId}`} className="text-xs text-muted hover:text-forest">
          رجوع للتعديل
        </Link>
      }
    >
      <Facts>
        <Fact label="الحريف">
          <Link href={`/admin/v2/files/${reservation.personId}`} className="text-forest hover:underline">
            {person?.full_name ?? reservation.personName ?? "بلا اسم"}
          </Link>
        </Fact>
        <Fact label="التلفون">
          {person?.phone_e164 ? <span dir="ltr">{person.phone_e164}</span> : undefined}
        </Fact>
        <Fact label="بطاقة التعريف">
          {person?.cin ? <span dir="ltr">{person.cin}</span> : undefined}
        </Fact>
        <Fact label="العرض">{reservation.offerName ?? undefined}</Fact>
        <Fact label="الزيتونات">{`${formatCount(reservation.treesHeld)} زيتونة`}</Fact>
        <Fact label="الأرقام">
          {reservation.firstCode ? (
            <span dir="ltr">
              {reservation.firstCode}
              {reservation.lastCode && reservation.lastCode !== reservation.firstCode
                ? ` → ${reservation.lastCode}`
                : ""}
            </span>
          ) : undefined}
        </Fact>
        <Fact label="العربون">
          {reservation.depositDueMillimes > 0
            ? `${formatMillimes(reservation.depositDueMillimes)}${depositSettled ? " · تخلّص" : " · مازال"}`
            : undefined}
        </Fact>
        <Fact label="الحجز">
          <span dir="ltr">{reservation.referenceNo}</span>
        </Fact>
      </Facts>

      {!person?.cin ? (
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          ما ينجمش يتعمل عقد قبل ما تتعمّر بطاقة التعريف متاع الحريف.{" "}
          <Link href={`/admin/v2/files/${reservation.personId}`} className="underline">
            عمّرها في الملف
          </Link>
          .
        </p>
      ) : !depositSettled && reservation.depositDueMillimes > 0 ? (
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          العربون مازال ما تخلّصش كامل. تنجم تكمّل، أما تثبّت أوّلاً.
        </p>
      ) : null}

      {person?.cin ? (
        <CompleteForm
          reservationId={reservation.id}
          depositMillimes={reservation.depositDueMillimes}
          kinds={kinds ?? []}
          methods={methods ?? []}
        />
      ) : null}
    </Screen>
  );
}
