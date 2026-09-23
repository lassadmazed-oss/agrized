"use client";

import type { ReactNode } from "react";

import { PAYMENT_MODE_LABELS, REQUEST_KIND_LABELS } from "@/lib/backoffice/leads/filters";
import { formatArea, formatCount, formatDate, formatMillimes } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

import { Popup } from "../../popup";

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
};

function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return REQUEST_KIND_LABELS[kind as keyof typeof REQUEST_KIND_LABELS] ?? kind;
}

/** One answered field. `wide` marks the joined lists and the offer name — the answers worth two columns. */
type Answer = { label: string; value: string; wide?: boolean };

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

  const rows: Array<{ label: string; value: string | null; wide?: boolean }> = [
    { label: "العرض", value: request.project_name, wide: true },
    { label: "كود العرض", value: request.project_code },
    {
      label: "سعر الزيتونة",
      value: request.price_per_tree_millimes ? formatMillimes(request.price_per_tree_millimes) : null,
    },
    { label: "حالة الإنتاج", value: (request.production_statuses ?? []).join("، ") || null },
    {
      // Where the lead actually came from: the calculator, an offer page, a campaign link. It was in
      // every row since the first intake and on no screen.
      label: "جا من",
      value:
        request.source && typeof request.source === "object" && "landing_path" in request.source
          ? String((request.source as { landing_path?: unknown }).landing_path ?? "") || null
          : null,
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
    },
    { label: "السعر الجملي", value: request.total_price_millimes ? formatMillimes(request.total_price_millimes) : null },
    {
      label: "التسبقة",
      value: request.down_payment_amount_millimes
        ? `${request.down_payment_percent ? `${request.down_payment_percent}% · ` : ""}${formatMillimes(request.down_payment_amount_millimes)}`
        : request.down_payment_label_ar,
    },
    {
      label: "القسط الشهري",
      value: request.monthly_millimes ? formatMillimes(request.monthly_millimes) : request.installment_label_ar,
    },
    { label: "مدة الدفع", value: request.duration_label_ar ?? (months ? `${formatCount(months)} شهر` : null) },
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
  return (
    <AnswerGrid>
      <AnswerCell label="الطلب" value={<span dir="ltr">{request.request_no}</span>} />
      <AnswerCell label="نوعو" value={kindLabel(request.request_kind)} />
      <AnswerCell label="تاريخو" value={formatDate(request.created_at)} />

      {answered(request, governorates).map((answer) => (
        <AnswerCell key={answer.label} label={answer.label} value={answer.value} wide={answer.wide} />
      ))}
    </AnswerGrid>
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
                          {answered(request, governorates).map((answer) => (
                            <div key={answer.label} className="flex items-baseline justify-between gap-3 py-1">
                              <dt className="shrink-0 text-[0.6875rem] text-muted">{answer.label}</dt>
                              <dd className="min-w-0 break-words text-end text-xs font-semibold text-ink">
                                {answer.value}
                              </dd>
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
