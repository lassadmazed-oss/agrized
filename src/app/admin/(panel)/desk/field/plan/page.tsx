import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { readTreePlan } from "../../../projects/[id]/tree-plan-read";
import { TreePlan } from "../../../projects/[id]/tree-plan";
import { PLAN_MAX_SELECTION, parseSeq } from "../../../projects/[id]/tree-plan-model";
import { holdChosenTrees, reserveChosenTrees } from "../actions";

// §9 · §11 · §12 — «ما نحجزوش عشر زيتونات، نحجزو عشر زيتونات بأرقامها».
//
// The screen a commercial opens while standing in the grove with the client. It arrives knowing everything:
// which land (the visit's offer), which client (the visit's person), which demand (the visit's request). It
// asks for exactly one thing — WHICH TREES — and then hands the whole journey to the reservation screen that
// already exists, with nothing retyped (§12, §26).
//
// THE THREE IDENTIFIERS COME FROM THE ADDRESS AND ARE CHECKED AGAINST THE DATABASE, not trusted. The person is
// read through RLS, so a commercial who opens this URL for a file that is not theirs sees «ما تنجمش تفتح هذا
// الملف» — app.can_see_person answers, not this page. The offer is read the same way. Guessing a uuid gets
// nobody anywhere, and the write behind the button is gated a third time in SQL.
//
// WHAT HAPPENS WHEN THE MODULE IS OFF. With `reservations` disabled every reservation RPC raises module_closed,
// so the button would be a lie. The screen then offers the other honest act instead — hold these exact trees
// for this client — because the client still walked to ten trees and those ten must stop being sold to someone
// else while the owner decides when to publish the module. Both acts take the same chosen set and both are
// refused by the same race guard.

export const metadata: Metadata = { title: "اختيار الزيتونات" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** «125,126,134» as it travels in the address, so changing block never loses what was already chosen. */
function parsePicked(value: string | string[] | undefined): number[] {
  const raw = one(value);
  if (!raw) return [];
  const seqs = raw
    .split(",")
    .map((part) => parseSeq(part))
    .filter((seq): seq is number => seq !== null);
  return [...new Set(seqs)].sort((a, b) => a - b).slice(0, PLAN_MAX_SELECTION);
}

export default async function TreePickerPage({ searchParams }: PageProps<"/admin/desk/field/plan">) {
  await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;

  const projectId = one(params.offer);
  const personId = one(params.person);
  const requestId = one(params.request);
  if (!projectId || !UUID.test(projectId) || !personId || !UUID.test(personId)) notFound();

  const supabase = await createClient();
  const [config, { data: person }, { data: request }, { data: reasonRow }] = await Promise.all([
    getPublicConfig(),
    // RLS decides. A commercial reads their own files; Admin, Finance and Legal read any. No row means the
    // reader may not act on this client, and the page says that instead of drawing a plan they cannot use.
    supabase.from("persons").select("id, full_name, phone_e164").eq("id", personId).maybeSingle(),
    requestId && UUID.test(requestId)
      ? supabase
          .from("interest_requests")
          .select("id, request_no, offer_trees, project_id")
          .eq("id", requestId)
          .eq("person_id", personId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // audit.reason_min_length, the same setting every sensitive form reads. Zero hides the field (0058).
    supabase.from("settings").select("value").eq("key", "audit.reason_min_length").maybeSingle(),
  ]);

  const reasonValue = reasonRow?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  if (!person) {
    return (
      <div className="space-y-roomy">
        <SectionHeader as="h1" level={1} title="اختيار الزيتونات" />
        <EmptyState title="ما تنجمش تفتح هذا الملف">
          ملفّ الحريف هذا موش مسند ليك، ولا ما عادش موجود. إذا لازمك تخدم عليه، اطلب من المسؤول يسندهولك من
          «مطالب الاستثمار».
        </EmptyState>
      </div>
    );
  }

  const plan = await readTreePlan(projectId, parseSeq(one(params.from)));
  if (!plan) notFound();

  const reservationsOpen = flagState(config, "reservations") !== "disabled";
  const picked = parsePicked(params.picked);

  return (
    <div className="space-y-roomy">
      <header className="space-y-snug">
        <div className="flex flex-wrap items-center gap-tight">
          <h1 className="section-title">اختيار الزيتونات بأرقامها</h1>
          <StatusPill tone="brand">{plan.offerName}</StatusPill>
          {plan.offerCode ? (
            <span dir="ltr" className="text-xs text-muted">
              {plan.offerCode}
            </span>
          ) : null}
        </div>

        <p className="flex flex-wrap items-baseline gap-tight text-sm">
          <span className="text-muted">للحريف</span>
          <Link href={`/admin/leads/${person.id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
            {person.full_name}
          </Link>
          {person.phone_e164 ? (
            <a href={`tel:${person.phone_e164}`} dir="ltr" className="text-muted tabular-nums underline-offset-4 hover:underline">
              {formatPhone(person.phone_e164)}
            </a>
          ) : null}
          {request ? (
            <span className="text-muted">
              · على المطلب <span dir="ltr" className="inline-block tabular-nums">{request.request_no}</span>
              {typeof request.offer_trees === "number" ? ` · طلب ${formatCount(request.offer_trees)} زيتونة` : ""}
            </span>
          ) : null}
        </p>

        <p className="max-w-3xl leading-7 text-muted">
          اقرا الرقم المكتوب على الزيتونة، اكتبو فوق، ثم أنقر على الزيتونات اللي اختارهم الحريف. كي تنقر على
          الزرّ، قاعدة البيانات هي اللي تأكّد في نفس اللحظة إلّي الزيتونات هاذوما مازالوا فاضيين — وإذا واحدة
          منهم تحجزت قبلك، تقول لك أنهي وحدة وشنوّة مازال فاضي.
        </p>
      </header>

      {!reservationsOpen ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">موديول «العربون والحجز» معطّل</span>، فالحجز الكامل موقّف في قاعدة
          البيانات روحها. تنجم برك تحجز الزيتونات باسم الحريف باش ما يبيعهمش زميل آخر، ومن بعد تكمّل الحجز
          والعربون من ملفّو كي يتشغّل الموديول من{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>
          .
        </p>
      ) : null}

      <TreePlan
        plan={plan}
        target={{
          personId: person.id,
          personName: person.full_name,
          requestId: request?.id ?? null,
          requestNo: request?.request_no ?? null,
        }}
        action={reservationsOpen ? reserveChosenTrees : holdChosenTrees}
        actionLabel={reservationsOpen ? "احجز وادفع العربون" : "احجز الزيتونات باسم الحريف"}
        note={
          reservationsOpen
            ? "الزرّ يفتح الحجز على نفس الأرقام هاذوما ويوديك لصفحة الحجز في ملفّ الحريف، وثمّة يتسجّل العربون. ما تعاودش تكتب حتى حاجة."
            : "الزيتونات هاذوما يولّيو محجوزين لهذا الحريف، وما ينجمش زميل آخر يبيعهم."
        }
        reasonMin={reasonMin}
        initialPicked={picked}
      />
    </div>
  );
}
