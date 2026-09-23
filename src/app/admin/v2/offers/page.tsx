import type { Metadata } from "next";

import { offerStocks } from "@/lib/backoffice/offers/stock";
import { requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Row, Rows, Screen, Tile, Tiles } from "../ui";

export const metadata: Metadata = { title: "العروض" };

/**
 * العروض — the inventory, read as stock rather than as a catalogue.
 *
 * WHAT A READER COMES HERE FOR is one number per offer: how many trees are still free. The public catalogue
 * already shows what an offer IS; this screen answers what is left of it, which is the only question that
 * decides whether a commercial can promise anything on a call.
 *
 * «ما ترقّمتش» IS NOT ZERO, and the distinction is the whole reason staff_offer_stock reports a status. An
 * offer whose trees were never generated has UNKNOWN stock: it cannot be sold from, and a «0» beside it would
 * read as sold out — the opposite of «nobody has numbered these yet, go press the button». A mismatch between
 * the rows in public.trees and the offer's declared count is reported the same way, because §46 forbids the
 * system from quietly selling 501 of 500.
 */
export default async function OffersPage() {
  await requireStaff();
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, code, name, status")
    .order("name");

  const rows = projects ?? [];
  const stocks = await offerStocks(
    supabase,
    rows.map((row) => row.id),
  );

  const totals = rows.reduce(
    (acc, row) => {
      const stock = stocks.get(row.id);
      if (!stock) return acc;
      acc.available += stock.trees_available;
      acc.reserved += stock.trees_reserved;
      acc.sold += stock.trees_sold;
      if (stock.status === "not_generated") acc.unnumbered += 1;
      return acc;
    },
    { available: 0, reserved: 0, sold: 0, unnumbered: 0 },
  );

  return (
    <Screen title="العروض" count={rows.length}>
      <Tiles>
        <Tile label="متاحة" value={formatCount(totals.available)} note="زيتونة تنجم تتباع اليوم" />
        <Tile label="محجوزة" value={formatCount(totals.reserved)} />
        <Tile
          label="مباعة"
          value={formatCount(totals.sold)}
          note={totals.unnumbered > 0 ? `${formatCount(totals.unnumbered)} عرض ما ترقّمش` : undefined}
          tone={totals.unnumbered > 0 ? "danger" : undefined}
        />
      </Tiles>

      <Rows empty={rows.length === 0 ? "ما فماش عروض." : undefined}>
        {rows.map((project) => {
          const stock = stocks.get(project.id);
          const unnumbered = !stock || stock.status === "not_generated";
          const mismatch = stock?.status === "partial";
          return (
            <Row
              key={project.id}
              href={`/admin/v2/offers/${project.id}`}
              title={project.name}
              subtitle={project.code}
              middle={
                unnumbered
                  ? "ما ترقّمتش"
                  : `${formatCount(stock.trees_total)} زيتونة${mismatch ? " · ما تطابقش" : ""}`
              }
              middleSub={
                stock && !unnumbered
                  ? `محجوزة ${formatCount(stock.trees_reserved)} · مباعة ${formatCount(stock.trees_sold)}`
                  : undefined
              }
              end={unnumbered ? "—" : formatCount(stock.trees_available)}
              endSub={unnumbered ? "ما ترقّمتش" : "متاحة"}
              tone={unnumbered || mismatch ? "danger" : undefined}
            />
          );
        })}
      </Rows>
    </Screen>
  );
}
