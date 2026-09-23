import type { Metadata } from "next";

import { offerStocks } from "@/lib/backoffice/offers/stock";
import { readOfferTerms } from "@/lib/backoffice/reservations/read";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { Screen } from "../ui";

import { SellStart, type Candidate, type SellOffer } from "./sell-start";

export const metadata: Metadata = { title: "بيع" };

/**
 * بيع — the page a sale starts on.
 *
 * It exists because selling used to begin inside a lead's file, which quietly required every customer to
 * have filled a form first (owner, 2026-09-23). Most do not. From here the person is an input: an existing
 * file chosen by name and number, or one opened on the spot through staff_create_person (0083).
 *
 * AN OFFER WITH NO NUMBERED TREES IS NOT OFFERED. staff_offer_stock reports `not_generated` for one whose
 * trees were never drawn, and its stock is UNKNOWN rather than zero — listing it would promise a sale the
 * transaction refuses a second later, naming a table the reader has never heard of.
 *
 * THE TERMS ARE READ PER OFFER and shown before the press: the عربون and how long the hold lasts are the two
 * things a commercial is asked on the call, and they are snapshotted onto the reservation the instant it
 * opens, so what is shown here is what the client will owe.
 */
export default async function SellPage() {
  await requireStaff();
  const supabase = await createClient();

  const [{ data: projects }, { data: people }] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase
      .from("persons")
      .select("id, full_name, phone_e164, cin")
      .order("last_request_at", { ascending: false, nullsFirst: false })
      .limit(100),
  ]);

  const rows = projects ?? [];
  const stocks = await offerStocks(
    supabase,
    rows.map((row) => row.id),
  );

  const sellable = rows.filter((row) => {
    const stock = stocks.get(row.id);
    return stock && stock.status !== "not_generated" && stock.trees_available >= 1;
  });

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
    <Screen title="بيع زيتونات">
      <SellStart offers={offers} recent={(people ?? []) as Candidate[]} />
    </Screen>
  );
}
