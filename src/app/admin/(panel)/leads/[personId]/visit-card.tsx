// «الزيارات الميدانية» on one client's file (report v3 §25).
//
// FOR THE INTEGRATOR: this is a self-contained server component. Mount it in the MAIN column of
// src/app/admin/(panel)/leads/[personId]/page.tsx, under the held trees — a visit is a fact about this person
// and the land they were shown, not a control to squeeze into the aside, which already carries five cards and
// stacks all of them at 375px. One line:
//
//   <VisitCard personId={personId} canBook={canReserve} />
//
// `canReserve` is the flag that page already computes (app.can_see_person: Admin, Finance and Legal on any
// file, a commercial on their own) and it is the same line the database draws for booking a visit, so no new
// role list is invented here. The card reads its own data and its own settings, so nothing else on that page
// has to change.
//
// IT DISAPPEARS RATHER THAN BREAKS. public.visits arrives with supabase/pending/bb_21_visits.sql, which is a
// draft: until the owner applies it the read fails and this renders nothing, so mounting it early cannot break
// a screen the whole CRM depends on.

import { EmptyState, SectionHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { BookVisitForm } from "../../visits/book-visit-form";
import { readPersonVisits } from "../../visits/visit-data";
import { VisitEntry } from "../../visits/visit-entry";

export async function VisitCard({ personId, canBook = false }: { personId: string; canBook?: boolean }) {
  const data = await readPersonVisits(personId);
  // A FAILED READ IS SAID OUT LOUD, not rendered as nothing. This card is only mounted when the `visits` module
  // is not «معطّل», so a null here almost always means the module was switched on before its draft was applied —
  // a state the owner can now reach, because the key is in IMPLEMENTED_MODULES. Returning null made the whole
  // section disappear with no explanation, and a commercial cannot tell «this client asked for no visit» from
  // «the table does not exist». /admin/visits and ReservationCard both name their own draft here; so does this.
  if (!data) {
    return (
      <section className="space-y-snug">
        <SectionHeader as="h2" title="الزيارات الميدانية" />
        <p className="card p-cozy text-sm leading-6 text-muted">
          ما نجمناش نقرا الزيارات. إذا كانت هذي أول مرة، جدول الزيارات مازال ما تركّبش في قاعدة البيانات{" "}
          <span dir="ltr">(supabase/pending/bb_21_visits.sql)</span>. كلّم المسؤول باش يركّبو، ومن بعد حدّث الصفحة.
        </p>
      </section>
    );
  }

  const supabase = await createClient();
  const { data: settingRows } = await supabase.from("settings").select("key, value").eq("key", "audit.reason_min_length");
  const reasonValue = settingRows?.[0]?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const live = data.visits.filter((visit) => visit.status === "requested" || visit.status === "confirmed");
  // A wish with nothing behind it is the reason this card exists at all: 25 of the 36 demands in the database
  // carry «نحب نزور الأرض» and not one of them had a screen before this module.
  const waiting = data.waiting;

  return (
    <section className="space-y-snug">
      <SectionHeader
        as="h2"
        title="الزيارات الميدانية"
        description={
          live.length > 0
            ? `${live.length} زيارة مبرمجة · ${data.visits.length} في المجموع`
            : "زيارة الأرض: الحريف يشوف بعينيه قبل ما يقرر."
        }
      />

      {waiting.length > 0 ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold text-ink">هذا الحريف طلب يزور الأرض</span>{" "}
          {waiting.map((wish) => (
            <span key={wish.request_id} className="text-muted">
              — {wish.project_name ?? "بلا عرض محدّد"} ({formatDateTime(wish.created_at)}){" "}
            </span>
          ))}
          {waiting.some((wish) => !wish.project_id) ? (
            <span className="text-muted">
              · المطلب ما فيهش عرض محدّد، فاختر العرض وقتلي تبرمج الزيارة.
            </span>
          ) : null}
        </p>
      ) : null}

      {data.visits.length === 0 ? (
        <EmptyState title="ما فماش زيارة مسجّلة لهذا الحريف" size="sm" variant="plain">
          كي تتفقو على موعد، برمجو من تحت باش يظهر في روزنامة الفريق.
        </EmptyState>
      ) : (
        <div className="space-y-snug">
          {data.visits.map((visit) => (
            <VisitEntry
              key={visit.id}
              visit={visit}
              terms={data.terms}
              offers={data.offers}
              reasonMin={reasonMin}
              showDate
            />
          ))}
        </div>
      )}

      {canBook ? (
        <details className="card disclosure" open={data.visits.length === 0 && waiting.length > 0}>
          <summary className="text-sm font-semibold text-forest">برمج زيارة</summary>
          <div>
            <BookVisitForm
              personId={personId}
              offers={data.offers}
              terms={data.terms}
              requestId={waiting[0]?.request_id ?? null}
              defaultProjectId={waiting.find((wish) => wish.project_id)?.project_id ?? null}
              reasonMin={reasonMin}
            />
          </div>
        </details>
      ) : (
        <p className="hint">برمجة الزيارات متاع الـCommercial المسؤول على الملفّ، والـAdmin والمالية والقانوني.</p>
      )}
    </section>
  );
}
