// «عروض تنفع لهذا الحريف» — the answer to «شنوّة نعرضلو؟» while the phone is ringing (report v3 §43, §45).
//
// §43: «مطابقة Demand الحريف مع Inventory AgriZed … النظام يعرض للCommercial: Best matching offers.» The demand
// is the input and the offers are the output — the opposite direction of the matcher that exists today
// (public.match_requests_for_parcel: given a parcel, which clients fit), which belongs to the retired parcel
// layer and leaves with it.
//
// NOTHING IS COMPUTED HERE. The ranking, the score, the reason of each rank, the free stock and the money all
// come back from ONE call to public.staff_match_offers (supabase/pending/bb_22_matching.sql). This file counts
// no tree, multiplies no price, applies no threshold and holds no weight: the weights live in the setting
// matching.weights, the floor in matching.min_score, the row count in matching.offers_limit and every Arabic
// sentence under a card in matching.reason_labels — so the owner re-weights matching by editing one jsonb in
// الإعدادات, with no deploy.
//
// WHAT IT REFUSES TO SHOW. A price the reader may not see: the database attaches the money keys only for Finance
// and Admin (app.can_price, PRJ-03), and a commercial gets the same ranking with no dinar in it — the score is
// built from the STRUCTURE of the plan (does this offer offer that percentage? does it price that duration?),
// never from its amount. And an offer with no free tree: §46 forbids selling the 501st tree of 500, so an offer
// that cannot be sold is never a «best matching offer». It is counted in the footer instead of vanishing.
//
// THE GATE, BOTH HALVES. moduleAccess() here and app.module_open('matching') inside the RPC. While the owner
// leaves the module «معطّل» this section says so and calls nothing; the RPC would refuse it anyway
// (module_closed). A Back Office module needs only «داخلي فقط» to work — it is never shown to a visitor.
//
// MOUNTING IT (the integrator's one line, in the main column of the client file, under the held trees):
//   <MatchingOffers personId={person.id} requestId={defaultRequestId} />
// It reads its own data, so it needs nothing else. `requestId` is optional: without it the section matches the
// most recent demand of the file, which is what a commercial opening a file wants.

import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState, SectionHeader, StatusPill } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";
import { PLANTATION_LABELS, PRODUCTION_LABELS } from "@/lib/crm";
import { intakeErrorMessage } from "@/lib/errors";
import { formatCount, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

/** One criterion of a rank, ready to be read out loud: its weight, what it earned and its Arabic sentence. */
export type MatchReason = {
  key: string;
  weight: number;
  fraction: number;
  earned: number;
  hit: boolean;
  label_ar: string;
};

/** One offer that fits, as public.staff_match_offers returns it. The money keys are ABSENT — not null — for a
 *  reader without price rights, which is why every one of them is optional. */
export type MatchOffer = {
  project_id: string;
  project_code: string | null;
  project_name: string;
  status: string;
  governorate_ar: string | null;
  production_status: string | null;
  plantation_system: string | null;
  /** Null when the demand answered nothing that could be scored. */
  score: number | null;
  trees_available: number;
  trees_requested: number | null;
  min_trees: number;
  /** The offer covers part of the demand: it is still proposed, with both numbers said out loud. */
  partial: boolean;
  /** The offer's own smallest basket is bigger than what the client asked for. */
  below_min_trees: boolean;
  /** This is the offer the demand itself names, not a suggestion. */
  is_requested_offer: boolean;
  reasons: readonly MatchReason[];
  pricing?: string | null;
  price_per_tree_millimes?: number | null;
  total_price_millimes?: number | null;
  plan_status?: string | null;
  monthly_millimes?: number | null;
  months?: number | null;
};

export type MatchPayload = {
  request_id: string;
  request_no: string;
  request_kind: string;
  min_score: number;
  limit: number;
  offers_considered: number;
  offers_no_stock: number;
  offers_below_min_score: number;
  money: boolean;
  offers: readonly MatchOffer[];
};

/**
 * The RPC is not in src/lib/supabase/database.types.ts yet: it ships in the draft
 * supabase/pending/bb_22_matching.sql, and `npm run db:types` runs after the owner applies it. One cast, in one
 * place, with the payload typed above — delete it the day the types are regenerated and the call becomes
 * `supabase.rpc("staff_match_offers", { p_request: … })` with no cast at all.
 */
type MatchRpc = (
  name: "staff_match_offers",
  args: { p_request: string },
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

export async function MatchingOffers({ personId, requestId }: { personId: string; requestId?: string | null }) {
  await requireStaff(CRM_READ_ROLES);
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "matching");

  if (access === "closed") {
    return (
      <Shell>
        <p className="text-sm leading-6 text-muted">
          موديول المطابقة مطفي، فما نجّمناش نحسبو العروض اللي تنفع لهذا الحريف. باش يخدم، شعّلو من{" "}
          <Link href="/admin/settings/modules" className="font-semibold text-forest underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>{" "}
          — حالة «داخلي فقط» تكفي: هذي شاشة فريق، ما تظهرش للزوّار.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  // Which demand we are matching: the one the reader arrived from, else the most recent. The offers of a demand
  // sent last year are not the offers of the demand sent this morning.
  const { data: demands } = await supabase
    .from("interest_requests")
    .select("id, request_no, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = demands ?? [];
  const demand = rows.find((row) => row.id === requestId) ?? rows[0] ?? null;
  if (!demand) {
    return (
      <Shell>
        <EmptyState>
          ما فماش مطلب مسجّل في هذا الملفّ، فما فماش شنوّة نطابقو. سجّل مطلب للحريف ومن بعد ترجع لهنا.
        </EmptyState>
      </Shell>
    );
  }

  const rpc = supabase.rpc as unknown as MatchRpc;
  const { data, error } = await rpc("staff_match_offers", { p_request: demand.id });
  if (error) {
    // THE MODULE IS ON BUT ITS DRAFT IS NOT APPLIED. That state is reachable — the owner can switch a module on
    // from /admin/settings/modules the moment its key is in IMPLEMENTED_MODULES, and applying the SQL is a
    // separate act. PostgREST answers a call to a function it cannot find with PGRST202, which carries no
    // business meaning, so intakeErrorMessage would fall back to «تحقق من اتصالك» and blame the network for an
    // unapplied migration. /admin/visits and /admin/reservations both name their own draft here; this says the
    // same thing about bb_22, so the reader is told what is actually missing and who can fix it.
    const notApplied = error.code === "PGRST202" || /staff_match_offers/.test(error.message);
    return (
      <Shell>
        <p role="alert" className="error-text">
          {notApplied ? (
            <>
              موديول المطابقة مشعول أما جداولو مازالت ما تركّبتش في قاعدة البيانات{" "}
              <span dir="ltr">(supabase/pending/bb_22_matching.sql)</span>. كلّم المسؤول باش يركّبها، ومن بعد حدّث
              الصفحة. وإذا تحبّ ترجع كيما كان، طفّي الموديول من الإعدادات ← الموديولات.
            </>
          ) : (
            intakeErrorMessage(error.message)
          )}
        </p>
      </Shell>
    );
  }

  const payload = data as MatchPayload | null;
  const offers = payload?.offers ?? [];

  return (
    <Shell requestNo={demand.request_no} isLatest={demand.id === rows[0]?.id}>
      {offers.length === 0 ? (
        <EmptyState>
          {payload && payload.offers_no_stock > 0
            ? `ما فماش عرض يتعرض توّا: ${formatCount(payload.offers_no_stock)} عرض ما بقاش فيه زيتونة متاحة. فكّ حجزاً قديماً، ولا رقّم زيتونات عرض جديد.`
            : payload && payload.offers_below_min_score > 0
              ? `فما ${formatCount(payload.offers_below_min_score)} عرض متاح أما حتّى واحد ما وصلش لعتبة المطابقة (${payload.min_score}٪). كلّم الحريف باش يوسّع في اختياراتو، ولا نقّص العتبة من الإعدادات.`
              : "ما فماش عرض منشور فيه زيتونات متاحة توّا."}
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {offers.map((offer) => (
            <li key={offer.project_id}>
              <OfferCard offer={offer} />
            </li>
          ))}
        </ol>
      )}

      {payload ? (
        <p className="hint">
          تفقّدنا <span className="tabular-nums">{formatCount(payload.offers_considered)}</span> عرض فيه زيتونات
          متاحة
          {payload.offers_below_min_score > 0 ? (
            <>
              ، منهم <span className="tabular-nums">{formatCount(payload.offers_below_min_score)}</span> تحت عتبة{" "}
              <span className="tabular-nums">{payload.min_score}</span>٪
            </>
          ) : null}
          {payload.offers_no_stock > 0 ? (
            <>
              ، و<span className="tabular-nums">{formatCount(payload.offers_no_stock)}</span> عرض ما بقاش فيه شنوّة
              يتباع
            </>
          ) : null}
          . الأوزان والعتبة وعدد العروض تتبدّلو من{" "}
          {/* The section that actually holds matching.weights / min_score / offers_limit is «قواعد داخلية»
              (settings/page.tsx: prefixes ["matching","audit"]), and it carries the anchor #internal. Naming a
              «المطابقة» tab sent the reader looking for a screen that does not exist. */}
          <Link href="/admin/settings#internal" className="underline underline-offset-4">
            الإعدادات ← قواعد داخلية
          </Link>
          .
          {payload.money ? null : " الأسعار ما تظهرش هنا: هي لفريق المالية والإدارة."}
        </p>
      ) : null}
    </Shell>
  );
}

function Shell({
  children,
  requestNo,
  isLatest,
}: {
  children: ReactNode;
  requestNo?: string;
  isLatest?: boolean;
}) {
  return (
    <section id="matching-offers" className="scroll-mt-24 space-y-3">
      <SectionHeader
        title="عروض تنفع لهذا الحريف"
        description={
          requestNo
            ? `محسوبة على المطلب ${requestNo}${isLatest ? " (آخر مطلب في الملفّ)" : ""}: الولاية، نوع المشروع، حالة الغراسة، عدد الزيتونات والخطّة اللي طلبها.`
            : "شنوّة نعرضلو، مرتّب حسب شنوّة طلب."
        }
      />
      {children}
    </section>
  );
}

function OfferCard({ offer }: { offer: MatchOffer }) {
  const place = [offer.governorate_ar, offer.production_status ? PRODUCTION_LABELS[offer.production_status] : null,
    offer.plantation_system ? PLANTATION_LABELS[offer.plantation_system] : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="card p-cozy">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link href={`/admin/projects/${offer.project_id}`} className="underline-offset-4 hover:underline">
              {offer.project_name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {offer.project_code ? (
              <span dir="ltr" className="inline-block tabular-nums">
                {offer.project_code}
              </span>
            ) : null}
            {offer.project_code && place ? " · " : null}
            {place}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-tight">
          {offer.is_requested_offer ? <StatusPill tone="brand">العرض اللي طلبو</StatusPill> : null}
          {offer.below_min_trees ? <StatusPill tone="warning">أقلّ عدد أكبر من طلبو</StatusPill> : null}
          {offer.partial ? <StatusPill tone="warning">كمية ناقصة</StatusPill> : null}
          {offer.status === "internal" ? <StatusPill tone="line">مازال داخلي</StatusPill> : null}
          {typeof offer.score === "number" ? (
            <StatusPill tone="success">
              <span className="tabular-nums">{offer.score}</span>٪ مطابقة
            </StatusPill>
          ) : (
            <StatusPill tone="line">بلا نتيجة</StatusPill>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-snug sm:grid-cols-4">
        <Figure label="زيتونات متاحة" value={formatCount(offer.trees_available)} />
        <Figure
          label="طلب"
          value={typeof offer.trees_requested === "number" ? formatCount(offer.trees_requested) : "ما حدّدش"}
        />
        {/* PRJ-03: these two arrive only for Finance and Admin. */}
        {typeof offer.price_per_tree_millimes === "number" ? (
          <Figure label="سعر الزيتونة" value={formatMillimes(offer.price_per_tree_millimes)} />
        ) : null}
        {typeof offer.monthly_millimes === "number" ? (
          <Figure label="القسط الشهري" value={formatMillimes(offer.monthly_millimes)} />
        ) : typeof offer.total_price_millimes === "number" ? (
          <Figure label="الجملة" value={formatMillimes(offer.total_price_millimes)} />
        ) : null}
      </dl>

      {offer.reasons.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-tight">
          {offer.reasons.map((reason) => (
            <li
              key={reason.key}
              className={`pill ring-1 ring-inset ${
                reason.hit
                  ? "bg-leaf-soft text-forest ring-leaf/30"
                  : reason.earned > 0
                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                    : "pill-line ring-0"
              }`}
            >
              {reason.hit ? "✓ " : reason.earned > 0 ? "~ " : "× "}
              {reason.label_ar}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint mt-3">
          هذا المطلب ما فيهش معطيات نطابقو بيها. كلّم الحريف واسألو على الولاية، نوع المشروع وعدد الزيتونات.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-tight">
        <Link href={`/admin/projects/${offer.project_id}`} className="btn btn-secondary btn-sm">
          افتح العرض
        </Link>
        {/* The hold itself stays where it already is: ReserveTreesCard, the only screen that calls
            staff_allocate_trees. This list proposes; it never allocates. */}
        <Link href="#reserve-trees" className="btn btn-ghost btn-sm">
          احجز من هنا
        </Link>
      </div>
    </article>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-sm text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
