import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { offerStocks } from "@/lib/backoffice/offers/stock";
import { readOfferTerms } from "@/lib/backoffice/reservations/read";

import { SellForm, type SellOffer } from "./sell-form";

export const metadata: Metadata = { title: "بيع" };

/**
 * البيع — the step the Back Office never had a screen for.
 *
 * Until now a commercial who had agreed a sale on the phone had to know that «reserve» lived on a tab of the
 * client's file in v1, that the offer had to be numbered first, and that the count was bounded by a minimum
 * kept on the offer. This screen asks the two questions that remain — which offer, how many — and refuses to
 * show an offer it cannot actually take trees from.
 *
 * AN OFFER WITH NO NUMBERED TREES IS NOT LISTED. staff_offer_stock answers `not_generated` for an offer whose
 * trees were never drawn, and its availability is unknown rather than zero. Listing it would offer a sale the
 * transaction is going to refuse a second later, with an error naming a table the reader has never heard of.
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

  // The guard lives here too, not only on the button that leads here: a bookmarked URL is a way in, and the
  // contract that follows this reservation names the buyer by CIN.
  if (!person.cin) {
    return (
      <div className="space-y-4">
        <h1 className="section-title">{person.full_name ?? "بلا اسم"}</h1>
        <p className="card p-6 text-center text-sm text-muted">
          ما ينجمش يتعمل بيع قبل ما تعمّر رقم بطاقة التعريف في الملف.
        </p>
        <Link href={`/admin/v2/files/${personId}`} className="btn btn-primary">
          عمّر الهوية
        </Link>
      </div>
    );
  }

  const { data: projects } = await supabase.from("projects").select("id, name").order("name");
  const rows = projects ?? [];
  const stocks = await offerStocks(
    supabase,
    rows.map((row) => row.id),
  );

  const sellable = rows.filter((row) => {
    const stock = stocks.get(row.id);
    return stock && stock.status !== "not_generated" && stock.trees_available >= 1;
  });

  // The عربون and the validity window belong to the OFFER, and a reservation snapshots them at the second it
  // is opened. Showing them before the press is the difference between a commercial who can answer «وقتاش
  // يلزمني نخلّص، وقدّاش؟» on the call and one who finds out afterwards.
  const terms = await Promise.all(sellable.map((row) => readOfferTerms(supabase, row.id)));

  const offers: SellOffer[] = sellable.map((row, index) => {
    const stock = stocks.get(row.id)!;
    const term = terms[index];
    return {
      id: row.id,
      name: row.name,
      available: stock.trees_available,
      min: Math.max(1, Math.min(stock.min_trees, stock.trees_available)),
      depositMillimes: term?.depositMillimes ?? 0,
      validDays: term?.validDays ?? 0,
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="section-title">بيع لـ {person.full_name ?? "بلا اسم"}</h1>
        <Link href={`/admin/v2/files/${personId}`} className="text-sm text-muted hover:text-forest">
          رجوع للملف
        </Link>
      </div>

      <SellForm personId={person.id} offers={offers} />
    </div>
  );
}
