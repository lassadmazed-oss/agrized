"use client";

import type { ReactNode } from "react";

import { PAYMENT_MODE_LABELS, REQUEST_KIND_LABELS } from "@/lib/backoffice/leads/filters";
import { PRODUCTION_LABELS } from "@/lib/crm";
import { formatArea, formatCount, formatDate, formatMillimes } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

import { Popup } from "../popup";

/**
 * الطلب — what the client answered — plus the three lists that used to flood the file underneath it.
 *
 * THE ANSWERS ARE THE SCREEN'S REASON TO EXIST. The file once printed a request number and a date, and
 * everything the person typed — how many trees, what spacing, cash or instalments, what he can pay a month,
 * when he wants to be called — was in the row and on no screen (owner, 2026-09-23: «I am not getting the form
 * details the client filled, which is a big problem»). A commercial phoning a lead had to guess, or open v1
 * and read a table of sixty columns.
 *
 * WHAT CHANGED. They were printed as a bordered box with its own header bar and twenty label/value lines
 * stacked in two columns — one box per demand, so a client who filled the form three times was three boxes
 * and some 900px of page, each of them mostly empty either side of a four-word answer. Now the newest demand
 * is one grid with no header bar (the number, the kind and the date are the first three cells — a 44px bar to
 * carry what a cell carries is 44px spent on nothing), and the older demands are behind one button.
 *
 * THE GRID IS TWO COLUMNS ON A PHONE, three from `sm`, four from `lg`. That is the honest figure: a
 * calculator demand answers twenty fields, so with the three identity cells the grid holds up to 23 cells —
 * twelve rows on a 375px phone (~400px, one thumb-scroll), eight at 640px, six at 1024px. It is NOT «six rows
 * everywhere»; a single-column phone grid was, and that was the twenty stacked rows this redesign existed to
 * remove.
 *
 * NOTHING IS TRUNCATED. The cells are local to this module rather than ui.tsx's <Fact>, whose value line is
 * `truncate`: the longest answers here are exactly the ones a commercial calls about — a joined list of up to
 * 24 ولاية, a full offer name, the project types — and `truncate` cut them to «صفاقس، سوسة، المنس…». A
 * `title` tooltip does not exist on the phone this screen is designed for, so the value wraps instead — fully
 * readable on a touch screen, with no press to recover it — and from `sm` the three list-valued answers take
 * two columns rather than wrapping.
 *
 * EVERY VALUE HERE IS A SNAPSHOT THE INTAKE WROTE, never a figure recomputed now. `tree_count_label_ar`,
 * `spacing_label_ar`, the prices, the percentage — public.interest_requests keeps the words and the amounts as
 * they stood the day the form was sent, so an offer repriced next week cannot rewrite what this client was
 * quoted. This prints them and nothing else.
 *
 * A ROW WITH NO ANSWER IS NOT DRAWN. An offer request answers eight of these fields and a calculator request
 * answers twenty; printing «—» for the rest would turn a short, readable grid into a long one made mostly of
 * dashes, which is exactly the «too much, hard to read» the owner asked to be rid of. <AnswerCell> drops an
 * empty value by itself, so nothing here has to test twice.
 *
 * WHY THIS MODULE IS THE CLIENT HALF. Opening a list is state, so the popups cannot live in page.tsx, which
 * stays a server component that only reads and hands over plain data. That is also why the governorate names
 * arrive as an object keyed by id: it crosses the boundary as JSON, and a Map would have to survive
 * serialisation for no gain.
 */

/**
 * The demand, as the generated types know it — not a hand-written copy of them.
 *
 * It used to be a literal type widened to nullable everywhere, which forced `as unknown as RequestDetails[]`
 * in page.tsx, and a double cast erases the `SelectQueryError` supabase-js puts in `data`'s type when a column
 * in the select string does not exist. A renamed column then shipped green and every cell arrived `undefined`,
 * i.e. the file rendered a grid of three cells. Picking off the Row keeps that check switched on: the select
 * string and this list have to agree, or page.tsx stops compiling.
 */
export type RequestDetails = Pick<
  Database["public"]["Tables"]["interest_requests"]["Row"],
  | "id"
  | "request_no"
  | "created_at"
  | "request_kind"
  | "project_name"
  | "project_code"
  | "price_per_tree_millimes"
  | "production_statuses"
  | "source"
  | "offer_trees"
  | "tree_count_label_ar"
  | "desired_area_label_ar"
  | "spacing_label_ar"
  | "area_per_tree_m2"
  | "total_area_m2"
  | "payment_mode"
  | "total_price_millimes"
  | "down_payment_percent"
  | "down_payment_amount_millimes"
  | "monthly_millimes"
  | "duration_label_ar"
  | "duration_months"
  | "budget_label_ar"
  | "priority_label_ar"
  | "goal_label_ar"
  | "down_payment_label_ar"
  | "installment_label_ar"
  | "wants_visit"
  | "wants_bank_financing"
  | "contact_channel"
  | "contact_time_label_ar"
  | "residence_governorate_id"
  | "invest_governorate_ids"
  | "invest_anywhere"
  | "scenario_labels"
>;

/** One olive tree this client holds, as public.trees knows it. */
export type TreeHeld = { id: string; code: string };

/** One line of call history. */
export type FileNote = { id: string; body: string; created_at: string };

/** Governorate id → name_ar, keyed as text because that is what JSON does to a numeric key anyway. */
export type Governorates = Record<string, string>;

const CHANNELS: Record<string, string> = {
  phone: "تلفون",
  whatsapp: "واتساب",
  email: "إيميل",
  // public.contact_channel is ('phone', 'whatsapp', 'both') — 0002. «both» was missing, so the commonest
  // answer of the three printed the English word «both» on the client's file.
  both: "تلفون وواتساب",
};

/**
 * Where a demand came from, in words.
 *
 * `source` is whatever the intake put in a jsonb column — a landing path and, when the visit carried them, the
 * utm parameters. «/» is the landing page, and printing it as «/» is how a field that took three years of
 * traffic ends up meaning nothing to the person reading it. The campaign comes first when there is one,
 * because that is the half somebody is actually asking about.
 */
function sourceLabel(source: unknown): string | null {
  if (!source || typeof source !== "object") return null;
  const row = source as { landing_path?: unknown; utm_source?: unknown; utm_campaign?: unknown };

  const path = String(row.landing_path ?? "").trim();
  const where = path === "" ? null : path === "/" ? "الصفحة الرئيسية" : path;
  const campaign = [row.utm_source, row.utm_campaign]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  return [campaign || null, where].filter(Boolean).join(" · ") || null;
}

function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return REQUEST_KIND_LABELS[kind as keyof typeof REQUEST_KIND_LABELS] ?? kind;
}

/**
 * One answered field. `wide` marks the joined lists and the offer name — the answers worth two columns.
 *
 * `estimate` marks the six that are MONEY: the price per tree, the mode, the total, the down payment, the
 * monthly and the duration. Those are not answers in the way «how many trees» is an answer — they are the
 * output of a simulator the visitor was moving sliders on. Printed bare on a client's file, beside a name and
 * a phone number, they read as terms this company agreed to. They are kept (the client saw them, and that is
 * worth knowing before you ring) but separated and captioned, so nobody can mistake a simulation for a deal.
 */
type Answer = { label: string; value: string; wide?: boolean; estimate?: boolean };

/** The answered fields of one demand, in the order a commercial reads them: what, then how much, then how to reach him. */
function answered(request: RequestDetails, governorates: Governorates): Answer[] {
  const yesNo = (value: boolean | null) => (value === null ? null : value ? "إي" : "لا");
  const months = request.duration_months;

  const investing = request.invest_anywhere
    ? "أي ولاية"
    : (request.invest_governorate_ids ?? [])
        .map((id) => governorates[String(id)])
        .filter(Boolean)
        .join("، ") || null;

  const rows: Array<{ label: string; value: string | null; wide?: boolean; estimate?: boolean }> = [
    { label: "العرض", value: request.project_name, wide: true },
    { label: "كود العرض", value: request.project_code },
    {
      label: "سعر الزيتونة",
      value: request.price_per_tree_millimes ? formatMillimes(request.price_per_tree_millimes) : null,
      estimate: true,
    },
    {
      label: "حالة الإنتاج",
      // The codes are `none | starting | producing` (a check constraint, 0010 — not an owner-editable list),
      // and they were printed raw: a client's file said «producing» in the middle of an Arabic screen. The
      // Arabic for all three has been in src/lib/crm.ts since v1.
      value: (request.production_statuses ?? []).map((code) => PRODUCTION_LABELS[code] ?? code).join("، ") || null,
    },
    {
      // Where the lead actually came from: the calculator, an offer page, a campaign link. It was in
      // every row since the first intake and on no screen — and then it was on the screen as «/», which is
      // a true answer nobody can read. A path is turned into the page's name, and the campaign is printed
      // beside it when there is one, because «facebook · الصفحة الرئيسية» is the whole point of storing it.
      label: "جا من",
      value: sourceLabel(request.source),
    },
    {
      label: "عدد الزيتونات",
      value: request.tree_count_label_ar ?? (request.offer_trees ? `${formatCount(request.offer_trees)} زيتونة` : null),
    },
    {
      label: "المساحة لكل زيتونة",
      value: request.spacing_label_ar ?? (request.area_per_tree_m2 ? formatArea(request.area_per_tree_m2) : null),
    },
    { label: "المساحة الجملية", value: request.total_area_m2 ? formatArea(request.total_area_m2) : null },
    { label: "المساحة اللي يحبها", value: request.desired_area_label_ar },
    { label: "نوع المشروع", value: (request.scenario_labels ?? []).join("، ") || null, wide: true },
    {
      label: "طريقة الدفع",
      value: request.payment_mode ? (PAYMENT_MODE_LABELS[request.payment_mode] ?? request.payment_mode) : null,
      estimate: true,
    },
    { label: "السعر الجملي", value: request.total_price_millimes ? formatMillimes(request.total_price_millimes) : null, estimate: true },
    {
      label: "التسبقة",
      value: request.down_payment_amount_millimes
        ? `${request.down_payment_percent ? `${request.down_payment_percent}% · ` : ""}${formatMillimes(request.down_payment_amount_millimes)}`
        : request.down_payment_label_ar,
      estimate: true,
    },
    {
      label: "القسط الشهري",
      /*
       * A PLAN THAT COULD NOT BE PRICED SAYS SO, and this is not a cosmetic choice.
       *
       * When a client picks instalments over a duration the pricing table cannot quote — the global
       * financing_markups start at 36 months while the calculator offers 12 and 24 — the intake stores
       * payment_mode = 'installments' and leaves monthly, financed total and down-payment amount null
       * (verified on AGZ-2026-000045, submitted through the real form). Rendering nothing there is
       * indistinguishable from a cash sale, so a commercial phones a client who was quoted a monthly on
       * screen with no idea what he was told. The row now states the gap instead of hiding it.
       */
      value: request.monthly_millimes
        ? formatMillimes(request.monthly_millimes)
        : request.installment_label_ar ?? (request.payment_mode === "installments" ? "ما تحسبش" : null),
      estimate: true,
    },
    { label: "مدة الدفع", value: request.duration_label_ar ?? (months ? `${formatCount(months)} شهر` : null), estimate: true },
    { label: "الميزانية", value: request.budget_label_ar },
    { label: "الأولوية", value: request.priority_label_ar },
    { label: "الهدف", value: request.goal_label_ar },
    { label: "يحب زيارة", value: yesNo(request.wants_visit) },
    { label: "تمويل بنكي", value: yesNo(request.wants_bank_financing) },
    { label: "وقت الاتصال", value: request.contact_time_label_ar },
    {
      label: "يحب نتصلو بيه بـ",
      value: request.contact_channel ? (CHANNELS[request.contact_channel] ?? request.contact_channel) : null,
    },
    {
      label: "ولاية الإقامة",
      value: request.residence_governorate_id ? (governorates[String(request.residence_governorate_id)] ?? null) : null,
    },
    { label: "يحب يستثمر في", value: investing, wide: true },
  ];

  return rows.filter((row): row is Answer => Boolean(row.value));
}

/** The price a demand is about, for a one-line summary of it. */
function priceLabel(request: RequestDetails): string | null {
  if (request.total_price_millimes) return formatMillimes(request.total_price_millimes);
  if (request.monthly_millimes) return `${formatMillimes(request.monthly_millimes)} / شهر`;
  return null;
}

/**
 * Two columns on a phone, three from `sm`, four from `lg` — see the note on truncation above.
 *
 * `grid-flow-row-dense` is not decoration: a two-column cell cannot start in the last column, so without it
 * every wide answer leaves a half-cell hole beside the answer before it. Dense flow pulls a later short answer
 * into that hole — it can only move an answer that would otherwise sit next to empty space, and at phone width
 * there are no wide cells at all, so the reading order holds where the screen is tightest.
 */
function AnswerGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="card grid grid-flow-row-dense grid-cols-2 gap-x-6 gap-y-2.5 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-4">
      {children}
    </dl>
  );
}

/** `wide` only from `sm`: at two columns the value just wraps to a second line, which costs less than a hole. */
function AnswerCell({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[0.6875rem] leading-tight text-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold leading-snug text-ink">{value}</dd>
    </div>
  );
}

/** The newest demand, as the body of the file: identity in the first three cells, answers after them. */
export function RequestFacts({
  request,
  governorates,
}: {
  request: RequestDetails;
  governorates: Governorates;
}) {
  const answers = answered(request, governorates);
  const asked = answers.filter((answer) => !answer.estimate);
  const estimate = answers.filter((answer) => answer.estimate);

  return (
    <div className="space-y-2">
      <AnswerGrid>
        <AnswerCell label="الطلب" value={<span dir="ltr">{request.request_no}</span>} />
        <AnswerCell label="نوعو" value={kindLabel(request.request_kind)} />
        <AnswerCell label="تاريخو" value={formatDate(request.created_at)} />

        {asked.map((answer) => (
          <AnswerCell key={answer.label} label={answer.label} value={answer.value} wide={answer.wide} />
        ))}
      </AnswerGrid>

      {/*
        THE MONEY IS QUOTED, NOT STATED (owner, 2026-09-23: «no sale, only gather the information … I don't
        want the admin to consider that as a sale»).

        These five figures came out of a simulator the visitor was moving sliders on. Printed in the same grid,
        in the same weight, as «عدد الزيتونات» and «ولاية الإقامة», they read as terms this company agreed to —
        and a commercial glancing at a file before dialling would have every reason to believe the client has
        been promised 130 د.ت a month for seven years. Nobody promised anything.

        They are kept, because what the client SAW is worth knowing before you ring them, and because the
        contract honours the price they were shown. But they are kept as a quotation: their own block, their own
        sentence saying what they are, and values in muted weight so the eye reads them as background rather
        than as the deal.
      */}
      {estimate.length > 0 ? (
        <section className="card border-dashed px-3 py-2.5 sm:px-4">
          <p className="text-[0.6875rem] leading-tight text-muted">
            {/* The sentence says only what is TRUE TODAY. An earlier draft added «وما يمشيش للعقد وحدو» — it
                does not reach the contract by itself — which the database contradicts: staff_create_contract
                still falls back to these figures when the arrangement form is left blank (0072). Printing a
                promise the server does not keep is how the confirmation screen came to say «تنجم تكمّل» over a
                sale the server refused. When the fallbacks go, this sentence earns that clause. */}
            <b className="font-semibold text-forest">تقدير المحاكي</b> — هذا اللي عمّرو الحريف وشافو في
            الفورمولير. موش عرض وموش سعر متّفق عليه.
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            {estimate.map((answer) => (
              <div key={answer.label} className="min-w-0">
                <dt className="text-[0.6875rem] leading-tight text-muted">{answer.label}</dt>
                <dd className="break-words text-sm font-semibold leading-snug text-muted">{answer.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

/** «باينين أول 200 من 340» — said where the list is, because the button says the total. */
function Cut({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <p className="border-b border-line px-4 py-2 text-[0.6875rem] text-muted">
      باينين أول {formatCount(shown)} من {formatCount(total)}.
    </p>
  );
}

/**
 * The three lists nobody reads before dialling: the trees he holds, the call history, the older demands.
 *
 * EACH ONE IS A COUNT ON A BUTTON. They used to be three sections with three grey headings — «الزيتونات متاعو
 * (12)» over a card of up to 200 code pills, «الطلبات» over the stack, «الملاحظات» over ten boxes — and the
 * heading said exactly what the button now says while the card stayed open under it forever. A list that is
 * consulted once a week does not get to sit between the reader and the phone number.
 *
 * THE COUNT ON THE BUTTON IS THE TOTAL, not the page. The queries are capped (200 trees, 10 notes, 20
 * demands), and a parenthesised number on a closed button reads as stock: «زيتوناتو (200)» for a client
 * holding 340 is the same class of lie as counting his trees off his demand. The totals come from the count
 * head of each query, and the panel says so on top when what it holds is only the first page.
 *
 * THE READING BUTTON IS «سجل المكالمات», NOT «ملاحظات», because the neighbouring row has «ملاحظة» — the button
 * that writes one. Two adjacent 44px buttons differing by one letter is a coin toss; the words for reading the
 * history and for adding to it have to look different.
 *
 * AN OLD DEMAND IS ONE LINE. Printing each one's full answer list inside the panel rebuilt, behind a scroll,
 * the very stack this module was written to delete — nineteen demands × twenty answers ≈ 380 rows in a 480px
 * panel. Each is now a <details>: number, kind, price, date on one 40px line, and the answers only for the one
 * pressed. No state, no client-side store — the element does it.
 *
 * AN EMPTY LIST HAS NO BUTTON AT ALL, so a fresh file is not three affordances that open «ما فماش…».
 */
export function FileLists({
  trees,
  treesTotal,
  notes,
  notesTotal,
  older,
  olderTotal,
  governorates,
}: {
  trees: TreeHeld[];
  treesTotal: number;
  notes: FileNote[];
  notesTotal: number;
  older: RequestDetails[];
  olderTotal: number;
  governorates: Governorates;
}) {
  return (
    <>
      {trees.length > 0 ? (
        <Popup title="الزيتونات متاعو" label={`زيتوناتو (${formatCount(treesTotal)})`} variant="ghost">
          {() => (
            <div className="-m-4">
              <Cut shown={trees.length} total={treesTotal} />
              <ul className="flex flex-wrap gap-1.5 p-4">
                {trees.map((tree) => (
                  <li key={tree.id} dir="ltr" className="pill pill-line tabular-nums">
                    {tree.code}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Popup>
      ) : null}

      {notes.length > 0 ? (
        <Popup title="سجل المكالمات" label={`سجل المكالمات (${formatCount(notesTotal)})`} variant="ghost">
          {() => (
            // -m-4 so the hairlines reach the edges of the panel instead of floating inside its padding.
            <div className="-m-4">
              <Cut shown={notes.length} total={notesTotal} />
              <ul className="divide-y divide-line">
                {notes.map((note) => (
                  <li key={note.id} className="px-4 py-2.5">
                    <p className="whitespace-pre-line text-sm leading-snug text-ink">{note.body}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted">{formatDate(note.created_at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Popup>
      ) : null}

      {older.length > 0 ? (
        <Popup title="الطلبات القديمة" label={`طلبات قديمة (${formatCount(olderTotal)})`} variant="ghost">
          {() => (
            <div className="-m-4">
              <Cut shown={older.length} total={olderTotal} />
              <ul className="divide-y divide-line">
                {older.map((request) => {
                  const kind = kindLabel(request.request_kind);
                  const price = priceLabel(request);
                  return (
                    <li key={request.id}>
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-2.5 transition-colors hover:bg-paper [&::-webkit-details-marker]:hidden">
                          <span
                            aria-hidden
                            className="inline-block text-[0.625rem] text-muted transition-transform group-open:rotate-180"
                          >
                            ▾
                          </span>
                          <span dir="ltr" className="text-sm font-semibold text-ink">
                            {request.request_no}
                          </span>
                          {kind ? <span className="pill pill-line">{kind}</span> : null}
                          {price ? (
                            <span className="text-xs font-semibold tabular-nums text-forest">{price}</span>
                          ) : null}
                          <span className="ms-auto shrink-0 text-[0.6875rem] text-muted">
                            {formatDate(request.created_at)}
                          </span>
                        </summary>

                        {/* One column here, not the page's grid: the panel is 480px wide, and three columns in
                            it would be three cramped answers. Values wrap; nothing is cut. */}
                        <dl className="divide-y divide-line/60 border-t border-line/60 px-4 pb-2.5">
                          {/* Same rule as the newest demand above: what he asked for, then — under its own
                              line — what the simulator showed him. An older demand is even likelier to be
                              misread as a standing offer, because its numbers are months stale. */}
                          {[...answered(request, governorates)]
                            .sort((a, b) => Number(a.estimate ?? false) - Number(b.estimate ?? false))
                            .map((answer, index, list) => (
                              <div key={answer.label}>
                                {answer.estimate && !list[index - 1]?.estimate ? (
                                  <p className="pt-1.5 text-[0.625rem] font-semibold text-muted">
                                    تقدير المحاكي — موش عرض
                                  </p>
                                ) : null}
                                <div className="flex items-baseline justify-between gap-3 py-1">
                                  <dt className="shrink-0 text-[0.6875rem] text-muted">{answer.label}</dt>
                                  <dd
                                    className={`min-w-0 break-words text-end text-xs font-semibold ${
                                      answer.estimate ? "text-muted" : "text-ink"
                                    }`}
                                  >
                                    {answer.value}
                                  </dd>
                                </div>
                              </div>
                            ))}
                        </dl>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Popup>
      ) : null}
    </>
  );
}
