// وين وصل هذا المطلب — where ONE demand stands, drawn.
//
// WHAT WAS MISSING, IN ONE SENTENCE. The request file prints every answer the client typed and says nothing
// about where the request got to (owner, 2026-09-25: «كيف نحب نشوف المطلب متاعي أنا وين — فما حاجة ناقصة في
// الواحد»). The only stage in the product hangs off the PERSON, so a client with two demands has one answer
// and it is the higher of the two — the quieter demand reads as further along than it is. bb_75 derives a
// stage per demand; this draws it.
//
// IT DECIDES NOTHING. Every word on screen arrives from public.staff_request_journey: the stage, its rank,
// the owner's label for it (settings journey.stage_<key>), the thirteen-stage path with what this demand
// reached, and the row that proves it. This file chooses layout and colour and nothing else — the same rule
// src/lib/journey.ts states for itself, one level up.
//
// A SERVER COMPONENT, deliberately. There is no state here: a band that is read and not clicked needs no
// client bundle, and keeping it server-side means a page may render it directly from its own read.
//
// SAFE ON BOTH SIDES OF THE ADMIN REWRITE. It imports only from @/lib/journey, @/lib/format and
// @/components/ui — three modules that exist in both the v1 panel and the v2 screens — so wiring it into
// either costs one import and one tag.

import { StatusPill } from "@/components/ui";
import { formatCount, formatDate } from "@/lib/format";
import {
  journeyProgress,
  stageTone,
  type JourneyResult,
  type JourneyStage,
  type RequestJourney,
} from "@/lib/journey";

/**
 * The sentence naming the row that proves the stage.
 *
 * WHY THE PROOF IS ON SCREEN AT ALL. A derived stage that cannot be checked is just a different dropdown to
 * distrust. «العربون مدفوع · حجز AGZ-RES-7 · 12 سبتمبر 2026» can be opened and verified in ten seconds, and
 * that is what makes a computed answer worth more than the one somebody forgot to update.
 */
const PROOF_NOUN: Record<string, string> = {
  request: "المطلب",
  person: "الملف",
  contact_attempt: "مكالمة",
  visit: "زيارة",
  trees: "زيتونات",
  reservation: "حجز",
  contract: "عقد",
};

function proofSentence(journey: RequestJourney): string | null {
  const { proof } = journey.stage;
  const noun = PROOF_NOUN[proof.kind] ?? null;
  if (!noun) return null;

  // Trees have no reference number — their `ref` is a COUNT, which reads as a number of trees and not as a
  // record id. Printing «زيتونات 5» would be wrong in the other direction, so it is spelled out.
  const named =
    proof.kind === "trees"
      ? `${noun}: ${formatCount(Number(proof.ref ?? 0))}`
      : proof.ref
        ? `${noun} ${proof.ref}`
        : noun;

  const when = proof.at ? ` · ${formatDate(proof.at)}` : "";
  return `${named}${when}`;
}

/**
 * THE BAND. Thirteen stages, in the owner's order, with what this demand reached.
 *
 * A stage is drawn in one of four ways, and the difference matters:
 *   · CURRENT   — filled and named. Where the demand is.
 *   · REACHED   — filled, quiet. Behind the current one, and proven.
 *   · HOLLOW    — behind the current one but `has_fact: false`, so nothing in the database ever proved it.
 *                 Drawn as an outline, because claiming it would be inventing a fact (bb_70 names the two:
 *                 «مؤهَّل» and «موعد العقد محدد»).
 *   · AHEAD     — not reached.
 */
function Band({ journey }: { journey: RequestJourney }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="مسار المطلب">
      {journey.spine.map((stage) => {
        const proven = stage.reached && stage.has_fact;
        const hollow = stage.reached && !stage.has_fact;
        return (
          <li
            key={stage.key}
            // The label is the accessible name AND the hover text: on a phone there is no hover, so the
            // current stage is also printed in full underneath and this is never the only way to read it.
            title={stage.has_fact ? stage.label : `${stage.label} — ${stage.fact_ar}`}
            aria-current={stage.current ? "step" : undefined}
            className={[
              "h-1.5 rounded-full transition-[width]",
              stage.current ? "w-8" : "w-4",
              stage.current
                ? "bg-forest"
                : proven
                  ? "bg-leaf/60"
                  : hollow
                    ? "border border-dashed border-leaf/50 bg-transparent"
                    : "bg-line",
            ].join(" ")}
          >
            <span className="sr-only">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * THE CHIP — one demand's stage on a card or a list row.
 *
 * It takes a bare JourneyStage and not a whole journey ON PURPOSE. A list draws N of these, and the band's
 * payload (the thirteen-stage spine and this demand's identifiers) is the same spine N times over: reading a
 * full journey per row would be N round trips for one word each. public.staff_request_stage answers the
 * whole list in ONE call, and this is the shape that call returns.
 *
 * `stage` is null when the demand exists but the reader could not derive it — never drawn as a stage.
 */
export function RequestStageChip({ stage, className = "" }: { stage: JourneyStage | null; className?: string }) {
  if (!stage) return null;
  // `stage.label` with no «غير معروف» fallback, and that is not an oversight. app.request_stage can only
  // ever RETURN a stage it proved: ranks 3 and 10 have no fact anywhere in the database and the derivation
  // skips them outright, so a derived stage always has has_fact:true and always has the owner's word for it.
  // The band below is the place that needs `unknown`, because it draws all thirteen — including those two.
  return (
    <StatusPill toneClass={stageTone(stage.key)} className={className}>
      {stage.label}
    </StatusPill>
  );
}

export type RequestStageBandProps = {
  /** Exactly what readRequestJourney returned — including its failure, which this draws rather than hides. */
  result: JourneyResult<RequestJourney>;
  className?: string;
};

/**
 * WHERE THIS DEMAND IS.
 *
 * WHY IT TAKES THE RESULT AND NOT THE VALUE. bb_75 and bb_70 are drafts: until the owner applies them the
 * read comes back `not_applied`, and a component handed only the happy value would render nothing and leave
 * a hole on the page with no explanation. Every failure below prints one Arabic line saying what happened
 * and what to do — which is the house rule for errors, and the difference between «the screen is broken» and
 * «this is switched off».
 */
export function RequestStageBand({ result, className = "" }: RequestStageBandProps) {
  if (!result.ok) {
    // `forbidden` is not drawn at all: a reader who may not see the demand should not be told it exists.
    if (result.reason === "forbidden" || result.reason === "missing") return null;
    const text =
      result.reason === "not_applied"
        ? "مرحلة المطلب مازالت ما تفعّلتش. لازم تتطبّق supabase/pending/bb_70_journey.sql و bb_75_request_stage.sql باش تبان هنا."
        : "تعذّرت قراءة مرحلة هذا المطلب. حدّث الصفحة، وإذا تعاود المشكل قول للمسؤول.";
    return <p className={`text-sm text-muted ${className}`.trim()}>{text}</p>;
  }

  const journey = result.value;
  const { stage, ids } = journey;
  const progress = journeyProgress(journey.spine);
  const label = stage.has_fact ? stage.label : journey.unknown;
  const proof = proofSentence(journey);

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill toneClass={stageTone(stage.key)}>{label}</StatusPill>
        <span className="text-xs text-muted tabular-nums">
          المرحلة {formatCount(stage.rank)} من {formatCount(progress.total)}
        </span>
      </div>

      <Band journey={journey} />

      {proof ? (
        <p className="text-xs text-muted">
          الدليل: <span dir="auto">{proof}</span>
          {/* THE ONE HONEST CAVEAT. public.contact_attempts carries no request_id — an agent dials a person,
              not a demand — so «تم الاتصال» is proven by a call on the CLIENT. Saying so is the difference
              between a number that can be trusted and one that quietly overstates this particular demand. */}
          {stage.proof.person_scoped ? <span className="text-muted"> — مكالمة مع الحريف، موش خاصّة بهذا المطلب</span> : null}
        </p>
      ) : null}

      {/* §26 threaded down THIS demand: every number here belongs to the row on screen, which the
          person-level version cannot promise for a client with two demands. */}
      {ids.visit_no || ids.reservation_no || ids.contract_no || ids.trees_held > 0 ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {ids.visit_no ? (
            <span>
              زيارة <span dir="ltr" className="tabular-nums">{ids.visit_no}</span>
            </span>
          ) : null}
          {ids.reservation_no ? (
            <span>
              حجز <span dir="ltr" className="tabular-nums">{ids.reservation_no}</span>
            </span>
          ) : null}
          {ids.contract_no ? (
            <span>
              عقد <span dir="ltr" className="tabular-nums">{ids.contract_no}</span>
            </span>
          ) : null}
          {ids.trees_held > 0 ? <span className="tabular-nums">{formatCount(ids.trees_held)} زيتونة محجوزة</span> : null}
        </p>
      ) : null}
    </div>
  );
}
