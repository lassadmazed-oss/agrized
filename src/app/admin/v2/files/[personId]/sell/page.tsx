import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { offerStocks } from "@/lib/backoffice/offers/stock";
import type { OfferTerms } from "@/lib/backoffice/reservations/model";
import { readOfferTerms, readPersonReservations } from "@/lib/backoffice/reservations/read";

import { Rows, Screen } from "../../../ui";

import { SellForm, type SellOffer } from "./sell-form";

export const metadata: Metadata = { title: "بيع" };

/**
 * البيع — two answers and a press, on one line each.
 *
 * WHAT THIS REPLACED. A screen head, then a card holding three labelled inputs stacked with their hints, then
 * a boxed two-row table of the terms, then the button: some 420px of page for a decision that is «which offer»
 * and «how many» (owner, 2026-09-23: «make sure stuff doesn't take that much space… the steps not useful»).
 * The same decision now fits in about 150px — the two inputs share one line, the عربون and the أجل are one
 * strip under them instead of a table, and the offer's conditions text, which nobody reads on nine visits out
 * of ten, is behind a button.
 *
 * THIS ROUTE STAYS, BUT IT IS ONE STEP TOO MANY. Nothing here needs a page of its own: it is a two-field act
 * on a client, and the client's file is where the commercial already is. Keeping the URL working costs
 * nothing and a bookmark or an old SMS link may hold it, so the guards below are still enforced here.
 *
 * ONLY OFFERS THE DATABASE WOULD ACTUALLY SELL ARE LISTED, and that is two rules, not one:
 *   · staff_offer_stock answers `not_generated` for an offer whose trees were never drawn — its availability is
 *     unknown rather than zero, and listing it offers a sale the transaction refuses a second later with an
 *     error naming a table the reader has never heard of.
 *   · an offer holding fewer trees than its OWN smallest basket cannot be sold at all. 0054's engine checks
 *     `p_trees < app.offer_min_trees(p_project)` and never looks at what is left, so an offer with a basket of
 *     10 and 4 trees free refuses 4 (below_min_trees) and refuses 10 (not_enough_trees) — every number is
 *     wrong. It is left out for the same reason as the first: a listed offer is a promise this screen keeps.
 * `min` is therefore passed through UNCLAMPED. Clamping it to what is left is how the button came to be
 * enabled on a count SQL was always going to refuse.
 *
 * THE TERMS ARE READ BEFORE THE PRESS, not after. The عربون and the validity window belong to the OFFER and a
 * reservation snapshots them the second it opens; a commercial on the phone is being asked «وقتاش يلزمني
 * نخلّص، وقدّاش؟» while this screen is open.
 *
 * THE DEMANDS COME FIRST, and they are the reason the reservation can name a مطلب. A hold written with
 * request_id = null leaves the demand it answers dangling for ever — no screen will ever connect the two
 * again — so the newest demand this person sent on each offer is carried to the form and sent with the press.
 *
 * WHAT THIS STILL COSTS, and what it is owed. One `staff_offer_stock` per project, because no bulk reader
 * exists: `staff_person_reservations` now supplies the terms of every offer this client has a demand on in a
 * single call (so the usual sale costs no terms call at all), and only the rest of the catalogue still pays one
 * `staff_reservation_terms` each. Making this ONE round trip needs a reader that answers stock+terms for many
 * offers at once — `staff_offer_stocks(uuid[])` beside staff_offer_stock in 0054, with offerStocks() calling it
 * — which is a migration and a change in src/lib/backoffice/offers/stock.ts, not something this screen can fix
 * from inside itself.
 */
export default async function SellPage({ params }: PageProps<"/admin/v2/files/[personId]/sell">) {
  await requireStaff();
  const { personId } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("persons")
    .select("id, full_name, cin")
    .eq("id", personId)
    .maybeSingle();

  if (!person) notFound();

  const name = person.full_name ?? "بلا اسم";
  const back = (
    <Link href={`/admin/v2/files/${personId}`} className="text-xs text-muted hover:text-forest">
      رجوع للملف
    </Link>
  );

  // The guard lives here too, not only on the button that leads here: a bookmarked URL is a way in, and the
  // contract that follows this reservation names the buyer by CIN. Both dead ends of this screen wear the same
  // surface — `Rows`' message state — so the screen looks like one screen; the way back is the head's link,
  // which already points at the file this sentence sends the reader to.
  if (!person.cin) {
    return (
      <Screen title={`بيع لـ ${name}`} action={back}>
        <Rows empty="البيع يلزمو رقم بطاقة التعريف. ارجع للملف وعمّرو من «الهوية»، ومن بعد ترجع تبيع." />
      </Screen>
    );
  }

  // One wave: the catalogue, the demands this person sent on a real offer, and — in a single RPC — the terms of
  // every offer he has a demand on. A demand that named no offer (a calculator simulation) can hold nothing.
  const [{ data: projects }, { data: demandRows }, personFile] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase
      .from("interest_requests")
      .select("id, request_no, project_id, offer_trees, created_at")
      .eq("person_id", personId)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false }),
    readPersonReservations(supabase, personId),
  ]);

  const rows = projects ?? [];
  const stocks = await offerStocks(
    supabase,
    rows.map((row) => row.id),
  );

  const sellable = rows.filter((row) => {
    const stock = stocks.get(row.id);
    if (!stock || stock.status === "not_generated") return false;
    return stock.trees_available >= Math.max(1, stock.min_trees);
  });

  // The demanded offers' terms arrived with the file; only what is left of the catalogue costs a call.
  const terms = new Map<string, OfferTerms>(personFile?.offerTerms ?? []);
  const uncovered = sellable.filter((row) => !terms.has(row.id));
  const fetched = await Promise.all(uncovered.map((row) => readOfferTerms(supabase, row.id)));
  uncovered.forEach((row, index) => {
    const term = fetched[index];
    if (term) terms.set(row.id, term);
  });

  // Newest first from the query, so the first demand seen on an offer is the one a sale should answer.
  const demands = new Map<string, { id: string; requestNo: string; askedTrees: number | null }>();
  for (const row of demandRows ?? []) {
    if (!row.project_id || demands.has(row.project_id)) continue;
    demands.set(row.project_id, {
      id: row.id,
      requestNo: row.request_no,
      askedTrees: typeof row.offer_trees === "number" ? row.offer_trees : null,
    });
  }

  const offers: SellOffer[] = sellable.map((row) => {
    const stock = stocks.get(row.id)!;
    const term = terms.get(row.id) ?? null;
    const demand = demands.get(row.id) ?? null;
    return {
      id: row.id,
      name: row.name,
      available: stock.trees_available,
      min: Math.max(1, stock.min_trees),
      requestId: demand?.id ?? null,
      requestNo: demand?.requestNo ?? null,
      askedTrees: demand?.askedTrees ?? null,
      depositMillimes: term?.depositMillimes ?? 0,
      validDays: term?.validDays ?? 0,
      conditions: term?.conditionsAr ?? null,
    };
  });

  // What he asked about, before what he never mentioned — the sale being made nine times out of ten is the
  // first option, and picking it is what attaches the demand. Sort is stable, so each group stays by name.
  offers.sort((a, b) => Number(b.requestId !== null) - Number(a.requestId !== null));

  return (
    <Screen title={`بيع لـ ${name}`} action={back}>
      {offers.length === 0 ? (
        <Rows empty="ما فماش عرض ينجم يتباع توّا: يا زيتوناتو ما ترقّمتش، يا اللي باقي فيه أقلّ من أصغر عدد يتباع فيه. رقّم زيتونات العرض من بطاقتو، ولا حرّر حجوزات قديمة." />
      ) : (
        <SellForm personId={person.id} personName={name} offers={offers} />
      )}
    </Screen>
  );
}
