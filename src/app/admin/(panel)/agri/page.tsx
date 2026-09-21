// العمليات الفلاحية — «what did we do to the grove, and what is due».
//
// Report v3 §36 (Post-sale Services) and cahier v2 §41 (العمليات الفلاحية) · §42 (الشركات المتعاقدة).
// Owner, 2026-09-19, walking down the disabled modules: «continue working, dont stop».
//
// WHAT THIS SCREEN ANSWERS, in the order it answers it:
//   1. what is late right now, and what the season has cost (the four tiles);
//   2. for each offer, what each service costs, how often it is owed, who does it, and when it is next due;
//   3. the work log itself, most recent first, and the form that adds to it.
//
// WHY IT OPENS WHILE THE MODULE IS OFF. src/app/admin/(panel)/layout.tsx:47-54 states the rule: the flag says
// what VISITORS see and is not an access rule for the team — the Back Office is where a module is prepared
// before it is published. So the page reads and renders with `agri_backoffice` disabled, says so in one line
// with a link to the switch, and every write RPC still refuses (module_closed) until the owner turns it on.
// Turning it on is his act and nothing here does it for him.
//
// NOTHING ON THIS PAGE IS COMPUTED. The counts, the costs, the due dates, what is overdue and the Arabic of
// every status all arrive decided from Postgres. The only choice made here is which of them to show whom:
// a cost is absent — not zero — for a reader who is not Finance or Admin (PRJ-03).
//
// THE EMPTY STATE IS THE NORMAL STATE TODAY. All 8,600 trees are still «متاحة» and the draft that creates
// these tables is not applied, so the first thing this screen will say to the owner is that there is nothing
// yet and what has to happen first. That sentence is a setting, not a string: he can rewrite it himself.

import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig, optionsFor, settingText } from "@/lib/config";
import { formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import {
  AGRI_ROLES,
  OPERATION_FILTERS,
  OPERATION_FILTER_LABELS,
  operationTone,
  parseOperationFilter,
} from "./agri-model";
import { OfferServicesCard } from "./offer-services";
import { OperationForm } from "./operation-form";
import { readOfferServicesMany, readOperations } from "./read";

export const metadata: Metadata = { title: "العمليات الفلاحية" };

const REASON_HINT = "اكتب علاش عملت هذا التغيير. يتسجّل في سجل العمليات معاك ومع الوقت.";

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AgriPage({ searchParams }: Search) {
  const session = await requireStaff(AGRI_ROLES);
  const params = await searchParams;
  const filter = parseOperationFilter(params.filter);

  const supabase = await createClient();
  const [config, offers, list] = await Promise.all([
    getPublicConfig(),
    supabase.from("projects").select("id, code, name, status").order("code"),
    readOperations(supabase, filter),
  ]);

  const offerRows = (offers.data ?? []).filter((offer) => offer.status !== "archived");
  const services = await readOfferServicesMany(
    supabase,
    offerRows.map((offer) => offer.id),
  );

  const state = flagState(config, "agri_backoffice");
  const canPrice = hasRole(session, PRICE_ROLES);

  // Every list the forms below offer comes from الإعدادات ← القوائم. None of them is written here.
  const serviceOptions = optionsFor(config, "agrized_service");
  const frequencyOptions = optionsFor(config, "service_frequency");
  const providerOptions = optionsFor(config, "service_provider");

  const emptyNote = settingText(
    config,
    "agri.empty_note",
    "مازال ما تسجّلت حتى عملية فلاحية. كل خدمة تتعمل في الضيعة تتسجّل هنا: شنوّة تعمل، وقتاش، شكون عملها، وبشحال.",
  );
  const servicesEmptyNote = settingText(
    config,
    "agri.services_empty_note",
    "هذا العرض ما عندو حتى خدمة في بطاقتو. زيد الخدمات في بطاقة العرض قبل ما تحدّد أثمانها.",
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title="العمليات الفلاحية"
        description="شنوّة تعمل في الغراسة، وقتاش، شكون عملها وبشحال — ومعاه شنوّة فات وقتو. كل خدمة عندها ثمنها ودوريتها ومنفّذها في كل عرض."
        badge={list ? <StatusPill tone="line">{list.season.label}</StatusPill> : null}
      />

      {state === "disabled" ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">الموديول معطّل.</span> الشاشة هاذي مفتوحة للفريق باش تحضّرها، أما تسجيل
          العمليات وتحديد أثمان الخدمات موقّفين في قاعدة البيانات روحها. كي تكون جاهز، شغّلو من{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>
          : «داخلي فقط» يخلّي الفريق يخدم بيه، و«منشور للعموم» يبان للزوّار.
        </p>
      ) : null}

      {list === null ? (
        <EmptyState title="الوحدة مازالت ما تركّبتش في قاعدة البيانات">
          جداول العمليات الفلاحية والاشتراكات مازالوا مسودّة. كي يتطبّق ملف الترحيل الخاص بيهم، الشاشة هاذي
          تعمّر روحها بلا أي تبديل آخر.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label={OPERATION_FILTER_LABELS.late}
              value={list.counts.late}
              note="مبرمجة وفات وقتها"
              href="/admin/agri?filter=late"
              emphasis={list.counts.late > 0}
              quiet={list.counts.late === 0}
            />
            <StatTile
              label={OPERATION_FILTER_LABELS.planned}
              value={list.counts.planned}
              note="مبرمجة ومازالت ما تعملتش"
              href="/admin/agri?filter=planned"
            />
            <StatTile
              label={OPERATION_FILTER_LABELS.done}
              value={list.counts.done}
              note="تعملت وتسجّلت"
              href="/admin/agri?filter=done"
            />
            {list.costsVisible ? (
              <StatTile
                label="كلفة الموسم"
                value={formatMillimes(list.seasonCostMillimes ?? 0)}
                note={list.season.label}
              />
            ) : (
              <StatTile label="كلفة الموسم" value="—" note="الأرقام المالية للمالية والإدارة برك" quiet />
            )}
          </div>

          <nav className="flex flex-wrap gap-2" aria-label="ترشيح العمليات">
            {OPERATION_FILTERS.map((key) => (
              <Link
                key={key}
                href={key === "all" ? "/admin/agri" : `/admin/agri?filter=${key}`}
                className={`pill ring-1 ring-inset ${
                  filter === key ? "bg-leaf-soft text-forest ring-leaf/30" : "pill-line ring-0"
                }`}
              >
                {OPERATION_FILTER_LABELS[key]}
              </Link>
            ))}
          </nav>

          <section className="space-y-3">
            <SectionHeader
              level={2}
              title="خدمات العروض وأثمانها"
              description="شنوّة يعرض كل عرض، بشحال، كل قدّاش، وشكون ينفّذها. الخدمة اللي داخل الباقة السنوية ما عندهاش ثمن مستقل: ثمنها هو المعاليم السنوية."
            />
            {services.length === 0 ? (
              <EmptyState size="sm">{servicesEmptyNote}</EmptyState>
            ) : (
              services.map((offer) => (
                <OfferServicesCard
                  key={offer.projectId}
                  offer={offer}
                  frequencies={frequencyOptions}
                  providers={providerOptions}
                  canPrice={canPrice}
                  emptyNote={servicesEmptyNote}
                  reasonHint={REASON_HINT}
                />
              ))
            )}
          </section>

          <section className="space-y-3">
            <SectionHeader
              level={2}
              title="سجلّ العمليات"
              description="الأحدث في الأول. العملية تتسجّل مرة وحدة على العرض الكل — «حرثنا الضيعة» سطر واحد، موش سطر لكل زيتونة — كان ما مسّتش زيتونات بعينها."
            />

            {list.rows.length === 0 ? (
              <EmptyState>{emptyNote}</EmptyState>
            ) : (
              <ul className="space-y-3">
                {list.rows.map((operation) => (
                  <li key={operation.id} className="card p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{operation.labelAr}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={operationTone(operation.status, operation.isLate)}>
                          {operation.statusLabel || operation.status}
                        </StatusPill>
                        {operation.isLate ? <StatusPill tone="attention">فات وقتها</StatusPill> : null}
                      </span>
                    </div>

                    <p className="text-sm text-muted">
                      {operation.projectName} <span dir="ltr">({operation.projectCode})</span>
                      {" · "}
                      {operation.scope === "trees"
                        ? `${operation.treesTouched} زيتونة بعينها`
                        : "الضيعة الكل"}
                      {operation.providerLabel ? ` · ${operation.providerLabel}` : ""}
                    </p>

                    <p className="text-sm text-muted">
                      {operation.executedOn
                        ? `تعملت في ${formatDate(operation.executedOn)}`
                        : operation.plannedOn
                          ? `مبرمجة لـ${formatDate(operation.plannedOn)}`
                          : "بلا تاريخ"}
                      {list.costsVisible && operation.costMillimes !== null
                        ? ` · ${formatMillimes(operation.costMillimes)}`
                        : ""}
                      {operation.approvedByName ? ` · صادق عليها ${operation.approvedByName}` : ""}
                    </p>

                    {operation.note ? <p className="text-sm leading-6">{operation.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 space-y-4">
            <SectionHeader
              level={2}
              title="سجّل عملية"
              description="كراس الشروط v2 §41. الصور مازالت ما تتسجّلش: تحبّ فضاء تخزين خاص، ويتعمل في دفعة قادمة."
            />
            <OperationForm
              offers={offerRows.map((offer) => ({ id: offer.id, code: offer.code, name: offer.name }))}
              services={serviceOptions}
              providers={providerOptions}
              reasonHint={REASON_HINT}
            />
          </section>
        </>
      )}
    </div>
  );
}
