import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile } from "@/components/ui";
import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { ReservationBlock, type PaymentMethod } from "./reservation-block";
import { FILTER_LABELS, RESERVATION_FILTERS, type ReservationFilter } from "@/lib/backoffice/reservations/model";
import { parseFilter, readReservations } from "@/lib/backoffice/reservations/read";

export const metadata: Metadata = { title: "الحجوزات" };

/**
 * الحجوزات — report v3 §23 (العربون) and §24 (مدة إتمام البيع).
 *
 * WHAT IT LEADS WITH. A reservation list sorted by date would be a list of paperwork. §24's whole point is
 * that a hold has a deadline and somebody has to look before it passes, so the order is the order of
 * attention — overdue first, then closing in, then the rest — and it is decided in SQL (staff_reservations),
 * not here. The four tiles are the same three questions plus the total, and each one is a link to its own
 * filter, so «3 انتهت مدّتها» is not a figure to admire but a way in.
 *
 * WHY THE SCREEN OPENS WHILE THE MODULE IS OFF. src/app/admin/(panel)/layout.tsx:47-54 states the rule: the
 * flag says what VISITORS see, and is not an access rule for the team — the Back Office is where a module is
 * prepared before it is published. So the page reads and renders with `reservations` disabled, says so in one
 * line with a link to the switch, and draws no control that the database would refuse (every write RPC raises
 * module_closed). Turning the module on is the owner's act and nothing here does it for him.
 *
 * NOTHING ON THIS PAGE IS COMPUTED. The counts, the ordering, the days left, what is owed and what is left,
 * and the Arabic of every status all arrive decided from Postgres.
 */
export default async function ReservationsPage({ searchParams }: PageProps<"/admin/reservations">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const filter: ReservationFilter = parseFilter(params.filter);

  const supabase = await createClient();
  const [config, list, { data: settingRows }] = await Promise.all([
    getPublicConfig(),
    readReservations(supabase, filter),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const state = flagState(config, "reservations");
  const moduleOpen = state !== "disabled";
  // app.can_record_money(): recording a deposit, extending and closing a hold are all Finance's and Admin's.
  const canRecordMoney = hasRole(session, PRICE_ROLES);

  // The methods the owner keeps in الإعدادات ← القوائم, never a list written here.
  const methods: PaymentMethod[] = optionsFor(config, "payment_method").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title="الحجوزات والعربون"
        description="كل حجز: شنوّة تحجز، قدّاش العربون، وقتاش توفى المدة. الترتيب حسب اللي يلزمو تدخّل قبل الكل."
      />

      {state === "disabled" ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">الموديول معطّل.</span> الشاشة هاذي مفتوحة للفريق باش تحضّرها، أما الحجز
          وتسجيل العربون موقّفين في قاعدة البيانات روحها. كي تكون جاهز، شغّلو من{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>
          : «داخلي فقط» يخلّي الفريق يخدم بيه، و«منشور للعموم» يبان للزوّار.
        </p>
      ) : null}

      {list === null ? (
        <EmptyState title="ما نجمناش نقرا الحجوزات.">
          إذا كانت هذي أول مرة، جداول الحجز مازالت ما تركّبتش في قاعدة البيانات
          (supabase/pending/bb_20_reservations.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث الصفحة.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={FILTER_LABELS.overdue}
              value={list.counts.overdue}
              href="/admin/reservations?filter=overdue"
              emphasis={list.counts.overdue > 0}
              quiet={list.counts.overdue === 0}
              note="فاتت المدة والحجز مازال مفتوح: مدّد، ألغي، ولا رجّع الزيتونات."
            />
            <StatTile
              label={FILTER_LABELS.soon}
              value={list.counts.soon}
              href="/admin/reservations?filter=soon"
              quiet={list.counts.soon === 0}
              note={`باقيلها ${formatCount(list.soonDays)} أيام ولا أقلّ.`}
            />
            <StatTile
              label={FILTER_LABELS.awaiting}
              value={list.counts.awaiting}
              href="/admin/reservations?filter=awaiting"
              quiet={list.counts.awaiting === 0}
              note="محجوزة وما وصلش العربون الكامل."
            />
            <StatTile
              label={FILTER_LABELS.open}
              value={list.counts.open}
              href="/admin/reservations?filter=open"
              quiet={list.counts.open === 0}
              note="كل الحجوزات اللي مازالت حيّة."
            />
          </div>

          <nav aria-label="فرز الحجوزات" className="flex flex-wrap gap-tight">
            {RESERVATION_FILTERS.map((key) => (
              <Link
                key={key}
                href={`/admin/reservations?filter=${key}`}
                // .chip in globals.css styles the selected one from aria-current="true"; no second class.
                aria-current={key === filter ? "true" : undefined}
                className="chip"
              >
                {FILTER_LABELS[key]}
                <span className="ms-1 tabular-nums text-muted">{formatCount(list.counts[key])}</span>
              </Link>
            ))}
          </nav>

          {list.rows.length === 0 ? (
            <EmptyState title="ما فماش حجوزات في هذا الفرز.">
              الحجز يتعمل من ملفّ الحريف، بعد ما يختار عرضاً حقيقياً: افتح الملفّ واحجز من قسم «الحجز والعربون».
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {list.rows.map((reservation) => (
                <ReservationBlock
                  key={reservation.id}
                  reservation={reservation}
                  methods={methods}
                  reasonMin={reasonMin}
                  canRecordMoney={canRecordMoney}
                  moduleOpen={moduleOpen}
                  showPerson
                />
              ))}
            </div>
          )}

          {list.capped ? (
            <p className="hint">
              نعرضو أول <span className="tabular-nums">{formatCount(list.limit)}</span> حجز برك من{" "}
              <span className="tabular-nums">{formatCount(list.matched)}</span>. ضيّق الفرز باش تشوف البقية.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
