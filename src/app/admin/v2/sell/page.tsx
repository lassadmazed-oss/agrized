import type { Metadata } from "next";

import { offerStocks } from "@/lib/backoffice/offers/stock";
import { readOfferTerms } from "@/lib/backoffice/reservations/read";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { Screen } from "../ui";

import { SellForm, type Candidate, type SellOffer, type TreeRun } from "./sell-form";

export const metadata: Metadata = { title: "بيع" };

/**
 * البيع — the first of the three screens the owner described (2026-09-23): «a form for the client information
 * that I am going to sell for — who? — in the same sell form, how many trees … the trees are numbered … then
 * to register a sale, in the same form, under there is a field for العربون».
 *
 * SO IT IS ONE FORM, and it ends with a sale that exists. Who, which trees, how much عربون, a note — one
 * press. What it deliberately does NOT ask is anything about how the client will pay: that is the second
 * screen, after the client has agreed, and asking it here would be asking a seller to guess at the moment they
 * are least able to.
 *
 * THE TREES ARE TYPED, NOT COUNTED. «5-11» and «5، 10، 15» are both sentences a seller says out loud, so the
 * box takes both (trees.ts). The free numbers of the chosen offer are listed under it, because a seller who
 * can see that 120–144 is gone does not type it.
 *
 * AN OFFER WITH NO NUMBERED TREES IS NOT OFFERED: staff_offer_stock reports `not_generated` for one whose
 * trees were never drawn, and its stock is UNKNOWN rather than zero — listing it would promise a sale the
 * transaction refuses a second later.
 */
export default async function SellPage({ searchParams }: PageProps<"/admin/v2/sell">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;
  const wanted = typeof params.person === "string" ? params.person : "";

  const [{ data: projects }, { data: people }] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase
      .from("persons")
      .select("id, full_name, phone_e164, cin")
      .order("last_request_at", { ascending: false, nullsFirst: false })
      .limit(200),
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

  const [terms, runs] = await Promise.all([
    Promise.all(sellable.map((row) => readOfferTerms(supabase, row.id))),
    Promise.all(
      sellable.map(async (row) => {
        const { data } = await supabase.rpc("staff_offer_tree_runs", { p_project: row.id, p_limit: 20 });
        return (data ?? []) as unknown as TreeRun[];
      }),
    ),
  ]);

  const offers: SellOffer[] = sellable.map((row, index) => {
    const stock = stocks.get(row.id)!;
    return {
      id: row.id,
      name: row.name,
      available: stock.trees_available,
      min: Math.max(1, Math.min(stock.min_trees, stock.trees_available)),
      depositMillimes: terms[index]?.depositMillimes ?? 0,
      validDays: terms[index]?.validDays ?? 0,
      runs: runs[index] ?? [],
    };
  });

  // A client sent here from الطلبات. One that is not among the recent files is fetched by id rather than
  // silently falling back to whoever is at the top of the list.
  let recent = (people ?? []) as Candidate[];
  let preselected = recent.find((row) => row.id === wanted) ?? null;
  if (wanted && !preselected) {
    const { data } = await supabase
      .from("persons")
      .select("id, full_name, phone_e164, cin")
      .eq("id", wanted)
      .maybeSingle();
    preselected = (data as Candidate | null) ?? null;
    if (preselected) recent = [preselected, ...recent];
  }

  return (
    <Screen title="بيع زيتونات">
      <SellForm offers={offers} recent={recent} preselectedId={preselected?.id ?? null} />
    </Screen>
  );
}
