import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataRow, DataList, EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { hasRole, requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import {
  AppointmentActs,
  AppointmentForm,
  ChecklistCard,
  LegalNoteForm,
  OpenFileForm,
} from "../file-acts";
import { nextStepOf, stageTone, type LegalFile, type NamedOption } from "../legal-model";
import { readLegalFile, readPartners } from "../read";
import { LEGAL_DESK_ROLES, LEGAL_WAIVE_ROLES } from "../roles";

export const metadata: Metadata = { title: "الملف القانوني" };

/**
 * §17 — everything Legal sees about one file, on one screen, joined and never retyped.
 *
 * THE POINT OF THE PAGE IS THAT NONE OF IT IS NEW DATA. The reservation and its عربون were written by the
 * reservations module, the trees by the inventory, the visit by the visits module, the payment plan by the
 * client on the public site, the phone agent by the CRM's assignment. §26 — «ENTER ONCE, REUSE EVERYWHERE» —
 * is not a slogan this desk repeats, it is the reason the desk owns almost no columns: app.legal_file_payload
 * joins six tables and this module stores when the file opened, which papers were seen, and when the closing
 * is.
 *
 * WHAT IT ADDS TO THE JOURNEY. §18's partner on §19's appointment, and §20's checklist — which is the only
 * thing on this page that can STOP something. It stops it in the database: a trigger on public.contracts
 * refuses the contract, the signature and the ownership while a mandatory paper at that gate is open. A
 * disabled button is not a rule, so there is no disabled button here; the acts that write a contract live in
 * وحدة العقود and they are the ones that get refused.
 *
 * 404 IS THE RIGHT ANSWER TO «not found» AND TO «not yours» ALIKE. app.can_see_person decides which it was,
 * not this page, and naming a file a reader may not open would leak that it exists.
 */
export default async function LegalFilePage({ params }: PageProps<"/admin/desk/legal/[reservationId]">) {
  const session = await requireStaff(LEGAL_DESK_ROLES);
  const { reservationId } = await params;

  const supabase = await createClient();
  const [file, directory, { data: settingRows }] = await Promise.all([
    readLegalFile(supabase, reservationId),
    readPartners(supabase),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  if (!file) notFound();

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  // Only partners who are active AND available may be booked; the database refuses an archived one anyway.
  const partners: NamedOption[] = (directory?.rows ?? [])
    .filter((partner) => partner.isActive)
    .map((partner) => ({
      id: partner.id,
      label: [partner.fullName, partner.specialityLabel, partner.governorate].filter(Boolean).join(" · "),
    }));

  const canWaive = hasRole(session, LEGAL_WAIVE_ROLES) && file.allowWaiver;

  return (
    <div className="space-y-4">
      {/*
        A plain back link rather than <AdminBreadcrumbs/>: that component builds its trail from
        src/components/admin/nav-model.ts, which is another session's file and does not know this route, so it
        would draw «لوحة القيادة» alone and nothing else. Adding the two labels there is one line and is listed
        in the handover; until it happens, this says where «رجوع» goes.
      */}
      <nav aria-label="مسار الصفحة" className="text-sm">
        <Link href="/admin/desk/legal" className="text-muted underline-offset-4 hover:text-forest hover:underline">
          ← القانوني وإتمام البيع
        </Link>
      </nav>

      <SectionHeader
        as="h1"
        level={1}
        title={file.personName}
        description={nextStepOf(file)}
        badge={<StatusPill tone={stageTone(file.stage)}>{file.stageLabel}</StatusPill>}
        actions={
          <Link href={`/admin/leads/${file.personId}`} className="btn btn-secondary btn-sm">
            ملف الحريف الكامل
          </Link>
        }
      />

      <IdentityCard file={file} />
      <TreesCard file={file} />
      <MoneyCard file={file} />
      <HandlersCard file={file} />

      {file.legalFile === null ? (
        <section className="card p-cozy">
          <h2 className="section-title">افتح الملف القانوني</h2>
          <p className="mt-1 text-sm leading-6">
            العربون تخلّص، فالملف ولّى متاع المكتب القانوني. كي تفتحو، القائمة القانونية تتنسخ عليه كيما هي
            اليوم، ومن بعد تنجم تعلّم الوثائق وتحدّد موعد العقد.
          </p>
          <div className="mt-3">
            <OpenFileForm reservationId={file.reservationId} reasonMin={reasonMin} />
          </div>
        </section>
      ) : (
        <>
          <ChecklistCard
            reservationId={file.reservationId}
            fileId={file.legalFile.id}
            checklist={file.legalFile.checklist}
            gateLabels={file.gateLabels}
            canWaive={canWaive}
            reasonMin={reasonMin}
          />

          <ClosingCard file={file} partners={partners} reasonMin={reasonMin} />

          <section className="card p-cozy">
            <h2 className="section-title">ملاحظة المكتب</h2>
            <div className="mt-3">
              <LegalNoteForm
                fileId={file.legalFile.id}
                reservationId={file.reservationId}
                note={file.legalFile.note}
                reasonMin={reasonMin}
              />
            </div>
            <p className="hint mt-3">
              الملف تفتح {formatDateTime(file.legalFile.openedAt)}
              {file.legalFile.openedBy ? ` · ${file.legalFile.openedBy}` : ""}
            </p>
          </section>
        </>
      )}

      <ContractCard file={file} />
      <NotesCard file={file} />
    </div>
  );
}

/* --------------------------------------------------------------------- cards */

function IdentityCard({ file }: { file: LegalFile }) {
  return (
    <section className="card p-cozy">
      <h2 className="section-title">الحريف والحجز</h2>
      <DataList variant="grid" columns={2} className="mt-3 text-sm">
        <DataRow label="الهاتف" layout="stacked" numeric={false}>
          <span dir="ltr">{file.personPhone ?? "—"}</span>
        </DataRow>
        <DataRow label="WhatsApp" layout="stacked" numeric={false}>
          <span dir="ltr">{file.personWhatsapp ?? "—"}</span>
        </DataRow>
        <DataRow label="الولاية" layout="stacked" numeric={false}>
          {file.personGovernorate ?? "—"}
        </DataRow>
        <DataRow label="البريد" layout="stacked" numeric={false}>
          <span dir="ltr">{file.personEmail ?? "—"}</span>
        </DataRow>
        <DataRow label="رقم الحجز" layout="stacked" numeric={false}>
          <span dir="ltr">{file.reservationNo}</span>
        </DataRow>
        <DataRow label="حالة الحجز" layout="stacked" numeric={false}>
          {file.reservationStatusLabel}
        </DataRow>
        <DataRow label="العرض" layout="stacked" numeric={false}>
          {file.offerName ?? "—"}
          {file.offerCode ? (
            <span className="block text-xs font-normal text-muted" dir="ltr">
              {file.offerCode}
            </span>
          ) : null}
        </DataRow>
        <DataRow label="رقم المطلب" layout="stacked" numeric={false}>
          <span dir="ltr">{file.requestNo ?? "—"}</span>
        </DataRow>
      </DataList>
      {file.conditionsAr ? <p className="hint mt-3 leading-6">{file.conditionsAr}</p> : null}
    </section>
  );
}

/** §9 and §10: we did not sell «عشر زيتونات», we sold these ten, by their numbers. */
function TreesCard({ file }: { file: LegalFile }) {
  const total = file.treesHeld + file.treesSold;
  return (
    <section className="card p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">الزيتونات بأرقامها</h2>
        <span className="text-sm text-muted tabular-nums">
          {formatCount(total)} زيتونة
          {file.treesSold > 0 ? ` · ${formatCount(file.treesSold)} مباعة` : ""}
        </span>
      </div>
      {file.treeCodes.length === 0 ? (
        <EmptyState size="sm" variant="plain" className="mt-3">
          ما فماش زيتونات مربوطة بهذا الحجز توّا.
        </EmptyState>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-1.5" dir="ltr">
            {file.treeCodes.map((code) => (
              <li key={code} className="chip tabular-nums">
                {code}
              </li>
            ))}
          </ul>
          {file.treeCodesCapped ? (
            <p className="hint mt-2">
              معروضة أول {formatCount(file.treeCodes.length)} زيتونة من {formatCount(total)}. الحدّ يتبدّل من
              الإعدادات (legal.queue_codes_limit)، والقائمة الكاملة في تبويب «الزيتونات» متاع العرض.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** §17's money. Every figure arrives computed; this card prints and never adds. */
function MoneyCard({ file }: { file: LegalFile }) {
  const { money } = file;
  const plan = money.plan;
  return (
    <section className="card p-cozy">
      <h2 className="section-title">الفلوس وخطّة الخلاص</h2>
      <DataList variant="grid" columns={4} className="mt-3 text-sm">
        <DataRow label="ثمن الزيتونة" layout="stacked">
          {money.pricePerTreeMillimes === null ? "—" : formatMillimes(money.pricePerTreeMillimes)}
        </DataRow>
        <DataRow label="الثمن الجملي" layout="stacked">
          {money.totalPriceMillimes === null ? "—" : formatMillimes(money.totalPriceMillimes)}
        </DataRow>
        <DataRow label="المدفوع" layout="stacked">
          {formatMillimes(money.paidMillimes)}
        </DataRow>
        <DataRow label="الباقي" layout="stacked">
          {money.remainingMillimes === null ? "—" : formatMillimes(money.remainingMillimes)}
        </DataRow>
      </DataList>

      <DataList variant="grid" columns={4} className="mt-4 text-sm">
        <DataRow label="العربون المطلوب" layout="stacked">
          {formatMillimes(money.depositDueMillimes)}
        </DataRow>
        <DataRow label="العربون المدفوع" layout="stacked">
          {formatMillimes(money.depositPaidMillimes)}
          {money.depositPaidAt ? (
            <span className="block text-xs font-normal text-muted">{formatDate(money.depositPaidAt)}</span>
          ) : null}
        </DataRow>
        <DataRow label="طريقة الدفع" layout="stacked" numeric={false}>
          {plan.paymentMode === "installments" ? "بالتقسيط" : plan.paymentMode === "cash" ? "بالحاضر" : "—"}
        </DataRow>
        <DataRow label="التسبقة" layout="stacked">
          {plan.downPaymentMillimes === null ? "—" : formatMillimes(plan.downPaymentMillimes)}
          {plan.downPaymentPercent !== null ? (
            <span className="block text-xs font-normal text-muted tabular-nums">{plan.downPaymentPercent}%</span>
          ) : null}
        </DataRow>
      </DataList>

      {plan.paymentMode === "installments" ? (
        <DataList variant="grid" columns={4} className="mt-4 text-sm">
          <DataRow label="المدة" layout="stacked">
            {plan.durationMonths === null ? "—" : `${formatCount(plan.durationMonths)} شهر`}
          </DataRow>
          <DataRow label="القسط الشهري" layout="stacked">
            {plan.monthlyMillimes === null ? "—" : formatMillimes(plan.monthlyMillimes)}
          </DataRow>
          <DataRow label="عدد الأقساط" layout="stacked">
            {plan.installmentsCount === null ? "—" : formatCount(plan.installmentsCount)}
          </DataRow>
          <DataRow label="آخر قسط" layout="stacked">
            {plan.lastInstallmentMillimes === null ? "—" : formatMillimes(plan.lastInstallmentMillimes)}
          </DataRow>
        </DataList>
      ) : null}

      <p className="hint mt-3 leading-6">
        {money.priceSource === "contract"
          ? "الأرقام هاذي متاع العقد كيما تجمّدت نهار ما تكتب — ماهيش سعر العرض اليوم."
          : plan.source === "request"
            ? "الأرقام هاذي كيما اختارهم الحريف في الموقع. وقت ما يتكتب العقد، يتجمّدوا عليه ويولّيوا هوما المرجع."
            : "الأرقام هاذي محسوبة من سعر العرض اليوم، خاطر الحجز ماهوش وراه مطلب."}
      </p>
    </section>
  );
}

/** §17's «أنا Commercial Terrain وأنا Agent تيليفون»: facts the CRM knew and nobody had ever joined. */
function HandlersCard({ file }: { file: LegalFile }) {
  const h = file.handlers;
  return (
    <section className="card p-cozy">
      <h2 className="section-title">شكون خدم على الملف</h2>
      <DataList variant="grid" columns={2} className="mt-3 text-sm">
        <DataRow label="موظّف الهاتف" layout="stacked" numeric={false}>
          {h.phoneAgent ?? "ما تسنّدش لحتى حدّ"}
        </DataRow>
        <DataRow label="Commercial Terrain" layout="stacked" numeric={false}>
          {h.fieldCommercial ?? "—"}
          {h.visitNo ? (
            <span className="block text-xs font-normal text-muted">
              <span dir="ltr">{h.visitNo}</span>
              {h.visitDate ? ` · ${formatDate(h.visitDate)}` : ""}
              {h.visitStatusLabel ? ` · ${h.visitStatusLabel}` : ""}
            </span>
          ) : null}
        </DataRow>
        <DataRow label="اللي عمل الحجز" layout="stacked" numeric={false}>
          {h.reservedBy ?? "—"}
        </DataRow>
        <DataRow label="اللي خذا العربون" layout="stacked" numeric={false}>
          {h.depositTakenBy ?? "—"}
          {h.depositReceiptNo ? (
            <span className="block text-xs font-normal text-muted" dir="ltr">
              {h.depositReceiptNo}
            </span>
          ) : null}
        </DataRow>
      </DataList>
      {h.visitNote ? (
        <p className="mt-3 rounded-xl bg-paper p-3 text-sm leading-6">{h.visitNote}</p>
      ) : null}
    </section>
  );
}

/** §19. The appointment is a plan for a signature; the signature itself is recorded in وحدة العقود. */
function ClosingCard({
  file,
  partners,
  reasonMin,
}: {
  file: LegalFile;
  partners: NamedOption[];
  reasonMin: number;
}) {
  const appointment = file.appointment;
  const open = appointment !== null && appointment.status === "scheduled";
  if (!file.legalFile) return null;

  return (
    <section className="card p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">موعد العقد</h2>
        {appointment ? (
          <StatusPill tone={open ? (appointment.isPast ? "attention" : "info") : "neutral"}>
            {appointment.statusLabel}
          </StatusPill>
        ) : null}
      </div>

      {appointment ? (
        <>
          <DataList variant="grid" columns={2} className="mt-3 text-sm">
            <DataRow label="النهار والساعة" layout="stacked" numeric={false}>
              {formatDate(appointment.meetOn)}
              {appointment.meetAt ? ` · ${appointment.meetAt.slice(0, 5)}` : ""}
              {open && appointment.isPast ? <span className="text-danger"> · فات ميعادو</span> : null}
              {open && appointment.isToday ? <span className="text-forest"> · اليوم</span> : null}
            </DataRow>
            <DataRow label="المكان" layout="stacked" numeric={false}>
              {appointment.place ?? "—"}
            </DataRow>
            <DataRow label="الشريك" layout="stacked" numeric={false}>
              {appointment.partnerLabel ?? "—"}
              {appointment.partnerPhone ? (
                <span className="block text-xs font-normal text-muted" dir="ltr">
                  {appointment.partnerPhone}
                </span>
              ) : null}
            </DataRow>
            <DataRow label="الوثائق المطلوبة" layout="stacked" numeric={false}>
              {appointment.documentsNote ?? "—"}
            </DataRow>
          </DataList>
          {appointment.cancelReason ? <p className="hint mt-2">{appointment.cancelReason}</p> : null}
          {open ? (
            <AppointmentActs
              appointmentId={appointment.id}
              reservationId={file.reservationId}
              reasonMin={reasonMin}
            />
          ) : null}
        </>
      ) : null}

      <div className="mt-4 border-t border-line pt-4">
        <AppointmentForm
          reservationId={file.reservationId}
          fileId={file.legalFile.id}
          appointment={appointment}
          partners={partners}
          minDate={file.appointmentMinDate}
          maxDate={file.appointmentMaxDate}
          reasonMin={reasonMin}
        />
      </div>
      {partners.length === 0 ? (
        <p className="hint mt-3">
          ما فماش شركاء في الدليل بعد.{" "}
          <Link href="/admin/desk/legal/partners" className="font-semibold underline underline-offset-4">
            زيد محامي ولا عدل إشهاد
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

/** §21. The contract engine is another module's; this card says where the file stands in it and links out. */
function ContractCard({ file }: { file: LegalFile }) {
  const contract = file.contract;
  const blocking = file.legalFile?.checklist.blocking ?? {};

  return (
    <section className="card p-cozy">
      <h2 className="section-title">العقد وإتمام البيع</h2>
      {contract === null ? (
        <>
          <p className="mt-1 text-sm leading-6">
            مازال ما تكتبش العقد. كتابة العقد تصير من{" "}
            <Link href="/admin/contracts" className="font-semibold underline underline-offset-4">
              وحدة العقود ووعد البيع
            </Link>
            ، وهي اللحظة اللي فيها الزيتونات يولّيوا «مباعة».
          </p>
          {(blocking.contract ?? 0) > 0 ? (
            <p className="mt-2 text-sm font-semibold text-danger">
              قاعدة البيانات باش ترفض كتابة العقد: باقي {formatCount(blocking.contract ?? 0)} بند إجباري في
              «قبل ما يتكتب العقد».
            </p>
          ) : null}
        </>
      ) : (
        <>
          <DataList variant="grid" columns={2} className="mt-3 text-sm">
            <DataRow label="رقم العقد" layout="stacked" numeric={false}>
              <Link
                href={`/admin/contracts/${contract.id}`}
                className="font-semibold underline underline-offset-4"
                dir="ltr"
              >
                {contract.referenceNo}
              </Link>
            </DataRow>
            <DataRow label="الحالة" layout="stacked" numeric={false}>
              {contract.statusLabel}
              {contract.kindLabel ? (
                <span className="block text-xs font-normal text-muted">{contract.kindLabel}</span>
              ) : null}
            </DataRow>
            <DataRow label="تاريخ الإمضاء" layout="stacked" numeric={false}>
              {contract.signedOn ? formatDate(contract.signedOn) : "ما تمضاش"}
              {contract.signedBy ? (
                <span className="block text-xs font-normal text-muted">{contract.signedBy}</span>
              ) : null}
            </DataRow>
            <DataRow label="مرجع الوثيقة" layout="stacked" numeric={false}>
              <span dir="ltr">{contract.legalDocumentRef ?? "—"}</span>
            </DataRow>
          </DataList>

          {contract.ownedAt === null ? (
            (blocking.signature ?? 0) > 0 || (blocking.ownership ?? 0) > 0 ? (
              <p className="mt-3 text-sm font-semibold text-danger">
                {(blocking.signature ?? 0) > 0
                  ? `قاعدة البيانات باش ترفض الإمضاء: باقي ${formatCount(blocking.signature ?? 0)} بند إجباري.`
                  : `قاعدة البيانات باش ترفض تسجيل التملّك: باقي ${formatCount(blocking.ownership ?? 0)} بند إجباري.`}
              </p>
            ) : (
              <p className="mt-3 text-sm leading-6">
                الوثائق كملت. كمّل من{" "}
                <Link
                  href={`/admin/contracts/${contract.id}`}
                  className="font-semibold underline underline-offset-4"
                >
                  صفحة العقد
                </Link>
                .
              </p>
            )
          ) : (
            <p className="mt-3 text-sm leading-6">
              التملّك تسجّل {formatDate(contract.ownedAt)}. الحريف ولّى مالك، و«زيتونتي» تتفتحلو من هنا.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** §17's «ملاحظات كل الفرق», merged in Postgres into one feed. Three stores, one list, no fourth store. */
function NotesCard({ file }: { file: LegalFile }) {
  if (file.notes.length === 0) return null;
  return (
    <section className="card p-cozy">
      <h2 className="section-title">ملاحظات الفرق</h2>
      <ul className="mt-3 space-y-3">
        {file.notes.map((note, index) => (
          <li key={`${note.at ?? index}-${index}`} className="border-s-2 border-line ps-3">
            <p className="text-xs text-muted">
              {note.team}
              {note.who ? ` · ${note.who}` : ""}
              {note.at ? ` · ${formatDateTime(note.at)}` : ""}
            </p>
            <p className="mt-0.5 text-sm leading-6">{note.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
