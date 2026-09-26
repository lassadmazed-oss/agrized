// وين وصل مطلبي — the answer, drawn for the person who sent the demand.
//
// THE SHAPE OF THE LOOKUP, AND WHY THE STATE LIVES HERE. `actions.ts` is a `"use server"` file, and such a
// file may export ONLY async functions: `export const TRACK_INITIAL = {…}` there compiles, typechecks and
// passes `next build`, then throws at runtime the first time the form is submitted («A "use server" file can
// only export async functions»). src/app/(public)/zitounti/login-state.ts exists for exactly that reason and
// says so. So the state and its initial value sit beside the component that draws them, in a module that is
// NEITHER "use server" NOR "use client": the action imports the value on the server, the form imports it in
// the browser, and there is one definition.
//
// IT DECIDES NOTHING. The stage, its rank, the owner's Arabic label for it (settings journey.stage_<key>) and
// the thirteen-stage path with what this demand reached all arrive from public.track_request, which derives
// them with app.request_stage and app.journey_spine — the same two functions the Back Office reads. This file
// chooses layout and colour and nothing else, which is the rule src/lib/journey.ts states for itself.
//
// WHAT IT CANNOT PRINT, BY CONSTRUCTION. A request number can be forwarded, screenshotted or guessed at, so
// public.track_request answers a stranger holding one with no money, no full name, no phone and no ids — it
// even deletes `proof.id` and `proof.ref` from 0094's stage before sending it. The types below are narrowed
// the same way, on purpose and not only for tidiness: this screen has no FIELD to draw a row id into, so the
// day that function starts sending one again nothing here renders it. A screen that cannot name a thing
// cannot leak it.

import { StatusPill } from "@/components/ui/status-pill";
import { formatCount, formatDate } from "@/lib/format";
import { journeyProgress, stageText, stageTone, type JourneyStage, type JourneySpineStage } from "@/lib/journey";

/**
 * The current stage, narrowed to what a stranger may see.
 *
 * `Omit<JourneyStage, "proof">` and then a proof of its own, rather than one hand-written list: the day a
 * stage grows a new display field this follows without an edit, while the two members that carry a handle into
 * another table — `id` and `ref` — are named nowhere in this file and so can never be drawn.
 *
 * WHAT SURVIVES OF THE PROOF, AND WHY IT IS WORTH KEEPING. `person_scoped` is the flag 0094 sets on «تم
 * الاتصال»: public.contact_attempts carries no request_id — an agent dials a person, not a demand — so that
 * one stage is proven by a call to the CLIENT and not by a call about the row on screen. Saying so is the
 * difference between a page that can be trusted and one that quietly overstates this particular demand, which
 * is exactly the caveat the Back Office band prints for the same reason.
 */
export type TrackStage = Omit<JourneyStage, "proof"> & {
  proof?: { kind: JourneyStage["proof"]["kind"]; at: string | null; person_scoped?: boolean };
};

/** One stage of the path. The same shape the Back Office band draws, because it is the same spine. */
export type TrackSpineStage = JourneySpineStage;

/** Exactly what public.track_request answers on a match. Nothing here is computed in the browser. */
export type TrackFound = {
  request_no: string;
  created_at: string | null;
  /** The offer the demand was sent about, as the intake recorded it. Null when it named none. */
  offer_name: string | null;
  /**
   * Carried and NOT drawn, on purpose. The code is what /projects/<code> is addressed by, so it is the hinge
   * for the obvious next step — «شوف العرض» under the path. That link is not built yet because the offer this
   * demand names may be closed, internal, or no longer published, and a public card must not send a reader to
   * a 404 to prove it has a link. It is kept in the payload so building it later costs one anchor and no
   * change to the contract; it is a code, not a fact about anybody, so holding it leaks nothing.
   */
  offer_code: string | null;
  /** How many olive trees THIS demand asked for. */
  trees: number | null;
  stage: TrackStage;
  spine: TrackSpineStage[];
  /** The owner's word for «no fact decides this», from settings journey.unknown_label. */
  unknown: string;
};

/**
 * The form's whole state, returned by the Server Action and re-drawn by the form.
 *
 * The two fields travel back so a failed lookup does not empty them — somebody re-reading a request number
 * off a text message should not have to retype it because the phone was the half they got wrong. And there is
 * exactly one source of truth: no client-side copy of either value to fall out of step with the answer.
 */
export type TrackState = {
  requestNo: string;
  phone: string;
  error: string | null;
  found: TrackFound | null;
};

export const TRACK_INITIAL: TrackState = { requestNo: "", phone: "", error: null, found: null };

/**
 * THE PATH, as a list and not as the Back Office's thirteen dashes.
 *
 * The band in src/components/admin/request-stage.tsx is right for a staff screen: an agent reads a queue and
 * needs the shape of the file at a glance, with the words on hover. Neither of those holds here. This reader
 * has one file — their own — they are on a phone where there is no hover, and the question they came with is
 * «شنوّة صار وشنوّة باقي», which is a list of named steps and not a progress bar. So every stage is printed.
 *
 * Four ways to draw one, and the difference is the whole point:
 *   · CURRENT — filled, named, and marked «توّا هنا». Where the demand actually is.
 *   · REACHED — filled and ticked. Behind the current one, and something in the database proves it.
 *   · HOLLOW  — behind the current one but `has_fact: false`, so NOTHING can prove it. Drawn as a dashed
 *               outline with the owner's «unknown» word beside it, because filling it in would be inventing
 *               a fact. Two of the thirteen are like this today (v3 §29: «مؤهَّل» and «موعد العقد محدد»).
 *   · AHEAD   — not reached. Quiet, and still printed: a person who was promised a path deserves to see
 *               where it goes.
 */
function Path({ spine, unknown }: { spine: readonly TrackSpineStage[]; unknown: string }) {
  return (
    <ol className="relative mt-4" aria-label="مسار المطلب">
      {spine.map((stage, index) => {
        const proven = stage.reached && stage.has_fact;
        const hollow = stage.reached && !stage.has_fact;
        const last = index === spine.length - 1;

        return (
          <li key={stage.key} aria-current={stage.current ? "step" : undefined} className="flex gap-3">
            {/* The rail. Drawn per row rather than as one absolute line behind the list, so it stops at the
                last dot instead of hanging below it, and so it never depends on the row height staying put.
                `bg-leaf/50` above the current stage, hairline below: the line carries the same answer the
                dots do, which is what makes the list readable without reading a single word. */}
            <div className="flex flex-none flex-col items-center">
              <span
                aria-hidden="true"
                className={[
                  "mt-1.5 size-3 flex-none rounded-full",
                  stage.current
                    ? "bg-forest ring-4 ring-leaf-soft"
                    : proven
                      ? "bg-leaf/70"
                      : hollow
                        ? "border border-dashed border-leaf/60 bg-transparent"
                        : "bg-line",
                ].join(" ")}
              />
              {!last ? (
                <span
                  aria-hidden="true"
                  className={`mt-1 w-px flex-1 ${stage.reached && !stage.current ? "bg-leaf/40" : "bg-line"}`}
                />
              ) : null}
            </div>

            <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-4"}`}>
              <p
                className={[
                  "text-[0.9375rem] leading-6",
                  stage.current ? "font-bold text-forest" : stage.reached ? "font-medium text-ink" : "text-muted",
                ].join(" ")}
              >
                {/* THE STAGE'S NAME IS PRINTED EVEN WHERE NOTHING PROVES IT, and that is not a claim: the name
                    is a fixed part of the path the owner published, not an assertion that this demand passed
                    it. What must never be claimed is the FACT — so the sentence under it, and the pill at the
                    top of the card, go through stageText() and say the owner's «unknown» word instead. */}
                {stage.label}
                {stage.current ? (
                  <span className="ms-2 align-middle text-caption font-semibold text-leaf">توّا هنا</span>
                ) : null}
              </p>
              {hollow ? (
                <p className="text-caption leading-6 text-muted">{stageText(stage, unknown)}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type TrackResultProps = {
  found: TrackFound;
  /** The number to ring when the path is not the answer somebody needed. Null while no setting holds one. */
  helpPhone?: string | null;
  /** The owner's closing line for this screen, from settings. Nothing is printed when he wrote none. */
  note?: string | null;
  /*
   * THE TWO WORDS THIS CARD PRINTS THAT ARE THE OWNER'S, NOT THE CODE'S. Both were literals here, which made
   * them the one part of the screen he could not rewrite: `track.request_label` already names the form field
   * above, so the card was free to disagree with it, and «زيتونة» is the unit the whole product reads from
   * `zitounti.tree_unit`. Passed in rather than read here so this stays a pure renderer with no config.
   */
  requestLabel: string;
  treeUnit: string;
};

/** The card: which demand this is, where it stands, and the whole path under it. */
export function TrackResult({ found, helpPhone = null, note = null, requestLabel, treeUnit }: TrackResultProps) {
  const progress = journeyProgress(found.spine);
  // The same call the Back Office band makes, for the same reason: ranks 3 and 10 have no fact anywhere in
  // the database, so a stage that could not be proven prints the owner's word and not its own name.
  const label = stageText(found.stage, found.unknown);

  return (
    <div className="card p-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-caption text-muted">
          {requestLabel}{" "}
          <span dir="ltr" className="font-semibold tabular-nums text-ink">
            {found.request_no}
          </span>
        </p>
        {found.created_at ? (
          <p className="text-caption text-muted">تسجّل في {formatDate(found.created_at)}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusPill toneClass={stageTone(found.stage.key)}>{label}</StatusPill>
        <span className="text-caption tabular-nums text-muted">
          المرحلة {formatCount(found.stage.rank)} من {formatCount(progress.total)}
        </span>
      </div>

      {/* THE ONE HONEST CAVEAT, and it belongs here even more than it does on the staff screen. «تم الاتصال»
          is proven by a call on the CLIENT's file, because a call carries no request number — so on a person
          who sent two demands, this stage is true of them and not necessarily of the demand on screen. A
          client who was rung about their other request should not read this as «somebody called me about this
          one» and then wonder why nobody mentioned it. */}
      {found.stage.proof?.person_scoped ? (
        <p className="mt-2 text-caption leading-6 text-muted">
          المكالمة كانت مع الحريف — موش بالضرورة على هذا المطلب بالذات.
        </p>
      ) : null}

      {/* What the demand was about. Only ever the offer's own name and the number of trees the intake wrote
          down — no price, no instalment, no name, no number. See the note at the top of this file. */}
      {found.offer_name || found.trees ? (
        <p className="mt-2 text-[0.9375rem] leading-7 text-muted">
          {found.offer_name ? <span className="text-ink">{found.offer_name}</span> : null}
          {found.offer_name && found.trees ? " — " : null}
          {found.trees ? <span className="tabular-nums">{formatCount(found.trees)} {treeUnit}</span> : null}
        </p>
      ) : null}

      <Path spine={found.spine} unknown={found.unknown} />

      {note ? <p className="mt-5 border-t border-line pt-4 text-caption leading-7 text-muted">{note}</p> : null}

      {helpPhone ? (
        <p className="mt-2 text-caption leading-7 text-muted">
          عندك سؤال على مطلبك؟ كلّمنا على{" "}
          <a
            href={`tel:${helpPhone.replace(/\s/g, "")}`}
            dir="ltr"
            className="font-semibold text-forest underline-offset-4 hover:underline"
          >
            {helpPhone}
          </a>
        </p>
      ) : null}
    </div>
  );
}
