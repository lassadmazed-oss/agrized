import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";

import { FIELD_ROLES, phoneDisplay, waHref, type FieldFile, type FieldVisit } from "../field-model";
import { readFile } from "../read";

import { BookCard } from "./book-card";
import { CallCard } from "./call-card";
import { ReportCard } from "./report-card";

export const metadata: Metadata = { title: "الحريف" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One person, one card per step: «كلّمو» → «الموعد» → «الزيارة» → «النتيجة» → «الوصل». The step he stands
 * at is open; the ones behind are ticked and stay readable; the ones ahead wait.
 */
export default async function TerrainPersonPage({ params }: PageProps<"/admin/terrain/[personId]">) {
  await requireStaff(FIELD_ROLES);
  const { personId } = await params;
  if (!UUID.test(personId)) notFound();

  const { data: file, error } = await readFile(personId);
  if (!file) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="card p-5 leading-7">
          <p className="font-semibold text-ink">ما نجمناش نحلّو الملف هذا.</p>
          <p className="mt-1 text-sm text-muted">
            {error === "forbidden" ? "الملف هذا موش في الليستا متاعك. اطلب من الإدارة تعطيهولك." : "حدّث الصفحة ولا ارجع للّيستا."}
          </p>
        </div>
      </div>
    );
  }

  const open = file.state.visit;
  const step = file.state.step;
  const last = file.state.last ?? file.visits.find((visit) => visit.status === "completed") ?? null;
  const reportable = open && open.visit_date <= file.terms.today;
  const deposits = (file.reservation?.payments ?? []).filter((payment) => payment.kind === "deposit" && !payment.voided);
  const result = last?.field_result ? (file.labels[last.field_result] ?? last.field_result) : null;

  return (
    <div className="space-y-5">
      <BackLink />

      <PersonHeader file={file} />

      {step === "done" && last ? (
        <div className="card border-forest/40 bg-leaf-soft p-4 leading-7">
          <p className="text-lg font-bold text-forest">✓ كمل: {result}</p>
          <p className="text-sm text-ink/80">
            زار {last.offer.name} نهار {formatDate(last.visit_date)}.{last.outcome?.note ? ` «${last.outcome.note}»` : ""}
          </p>
        </div>
      ) : null}

      <Step n={1} title="كلّمو" state={open || last || file.calls.length > 0 ? "done" : "now"}>
        <CallCard
          personId={file.person.id}
          phone={file.person.phone_e164}
          whatsapp={file.person.whatsapp_e164}
          calls={file.calls}
          canEdit={file.can_edit}
        />
      </Step>

      <Step n={2} title="الموعد" state={open ? "done" : step === "done" ? "done" : "now"}>
        {open ? <VisitSummary visit={open} /> : null}
        {file.can_edit && step !== "done" ? (
          open ? (
            <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
              <summary className="cursor-pointer py-1 text-sm font-semibold text-forest">بدّل النهار ولا الساعة</summary>
              <div className="pt-3">
                <BookCard file={file} visit={open} />
              </div>
            </details>
          ) : (
            <BookCard file={file} visit={null} />
          )
        ) : null}
        {!open && step === "done" ? <p className="text-sm text-muted">الموعد تعدّى.</p> : null}
      </Step>

      <Step n={3} title="نهار الزيارة" state={!open ? (step === "done" ? "done" : "later") : reportable ? "now" : "later"}>
        {open ? (
          <div className="space-y-3">
            <p className="leading-7">
              {open.visit_date === file.terms.today ? "اليوم" : formatDate(open.visit_date)}
              {" · "}
              <span dir="ltr" className="font-semibold">
                {open.meeting_time ?? open.slot_label}
              </span>
              {" · "}
              {formatCount(open.people_count)} {open.people_count === 1 ? "شخص" : "أشخاص"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {open.map_url ? (
                <a href={open.map_url} target="_blank" rel="noreferrer" className="btn btn-secondary min-h-12">
                  🗺️ الأرض على الخريطة
                </a>
              ) : null}
              {file.person.phone_e164 ? (
                <a href={`tel:${file.person.phone_e164}`} className="btn btn-secondary min-h-12">
                  📞 عيّطلو قبل ما تتلاقاو
                </a>
              ) : null}
            </div>
            {open.meeting_point ? <p className="text-sm text-muted">📍 {open.meeting_point}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">{step === "done" ? "تمّت." : "كي تثبّت الموعد، يبان هوني."}</p>
        )}
      </Step>

      <Step n={4} title="النتيجة" state={step === "done" ? "done" : reportable ? "now" : "later"}>
        {open && file.can_edit ? (
          reportable ? (
            <ReportCard file={file} visit={open} />
          ) : (
            <p className="text-sm text-muted">النتيجة تتسجّل نهار الزيارة ({formatDate(open.visit_date)}).</p>
          )
        ) : step === "done" ? (
          <p className="leading-7">{result}</p>
        ) : (
          <p className="text-sm text-muted">بعد الزيارة، تختار هوني: {Object.values(file.labels).join(" · ")}.</p>
        )}
      </Step>

      {file.reservation ? (
        <Step n={5} title="الحجز والوصل" state="done">
          <div className="space-y-3 leading-7">
            <p>
              <span className="font-semibold">{file.reservation.status_label}</span>
              {" · "}
              {formatCount(file.reservation.trees_count)} زيتونة في {file.reservation.offer_name}
              {file.reservation.first_code ? (
                <span dir="ltr" className="text-sm text-muted">
                  {" "}
                  ({file.reservation.first_code}
                  {file.reservation.last_code && file.reservation.last_code !== file.reservation.first_code ? ` → ${file.reservation.last_code}` : ""})
                </span>
              ) : null}
            </p>
            {file.reservation.is_open && file.reservation.expires_at ? (
              <p className="text-sm text-ink/80">
                محجوزة حتى {formatDateTime(file.reservation.expires_at)}
                {file.reservation.days_left !== null ? ` · باقي ${formatCount(Math.max(file.reservation.days_left, 0))} يوم` : ""}
              </p>
            ) : null}
            {deposits.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {deposits.map((payment) => (
                  <Link key={payment.id} href={`/admin/terrain/receipt/${payment.id}`} className="btn btn-primary btn-sm">
                    🧾 الوصل · {formatMillimes(payment.amount_millimes)}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">العربون مازال ما تخلّصش ({formatMillimes(file.reservation.deposit_due_millimes)}).</p>
            )}
          </div>
        </Step>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/terrain" className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
      → الليستا
    </Link>
  );
}

function PersonHeader({ file }: { file: FieldFile }) {
  const request = file.request;
  const wa = waHref(file.person.whatsapp_e164 ?? file.person.phone_e164);
  const facts = [
    request?.offer_name ? `العرض: ${request.offer_name}` : null,
    request?.trees ? `${formatCount(request.trees)} زيتونة` : request?.trees_label,
    request?.budget_label ? `الميزانية: ${request.budget_label}` : null,
    request?.payment_mode === "installments"
      ? `بالتقسيط${request.monthly_millimes ? ` (${formatMillimes(request.monthly_millimes)} في الشهر)` : ""}`
      : request?.payment_mode === "cash"
        ? "بالحاضر"
        : null,
    request?.contact_time_label ? `يحب نكلّموه: ${request.contact_time_label}` : null,
  ].filter(Boolean);

  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">{file.person.full_name}</h1>
          <p className="text-sm text-muted">
            {[file.person.governorate, file.listed?.commercial ? `في ليستا ${file.listed.commercial.full_name}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          {file.person.phone_e164 ? (
            <a href={`tel:${file.person.phone_e164}`} className="btn btn-secondary btn-sm" aria-label="عيّطلو">
              📞 <span dir="ltr">{phoneDisplay(file.person.phone_e164)}</span>
            </a>
          ) : null}
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" aria-label="واتساب">
              💬
            </a>
          ) : null}
        </div>
      </div>
      {facts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {facts.map((fact) => (
            <li key={fact} className="rounded-full bg-paper px-3 py-1 text-sm text-ink">
              {fact}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">ما عندو حتى طلب مسجّل.</p>
      )}
    </section>
  );
}

function VisitSummary({ visit }: { visit: FieldVisit }) {
  return (
    <div className="rounded-xl bg-paper p-3 leading-7">
      <p className="font-semibold text-ink">
        {formatDate(visit.visit_date)} · <span dir="ltr">{visit.meeting_time ?? visit.slot_label}</span> · {visit.offer.name}
      </p>
      {visit.meeting_point ? <p className="text-sm text-muted">📍 {visit.meeting_point}</p> : null}
      <p className="text-xs text-muted">{visit.visit_no}</p>
    </div>
  );
}

function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "now" | "later"; children: ReactNode }) {
  const tone =
    state === "now" ? "border-forest shadow-[var(--shadow-raise)]" : state === "done" ? "border-line" : "border-line opacity-70";
  return (
    <section className={`card space-y-3 p-5 ${tone}`} aria-current={state === "now" ? "step" : undefined}>
      <h2 className="flex items-center gap-3 text-lg font-bold text-forest">
        <span
          className={`grid size-8 place-items-center rounded-full text-sm ${
            state === "done" ? "bg-forest text-white" : state === "now" ? "bg-gold-bright text-forest" : "bg-paper text-muted"
          }`}
        >
          {state === "done" ? "✓" : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
