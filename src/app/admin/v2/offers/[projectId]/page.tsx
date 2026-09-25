import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { offerStock } from "@/lib/backoffice/offers/stock";
import { requireStaff } from "@/lib/auth";
import { formatArea, formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Fact, Facts, Screen, Tile, Tiles } from "../../ui";

export const metadata: Metadata = { title: "العرض" };

/**
 * عرض — one offer, and what is left of it.
 *
 * THE FOUR COUNTS COME FROM staff_offer_stock, which counts rows in public.trees. They are never derived from
 * the offer's declared tree_count: that column is what the offer SAYS it has, and the difference between the
 * two is exactly the fault worth surfacing. When they disagree the screen says so rather than picking the
 * friendlier number.
 *
 * NUMBERING IS NOT DONE HERE. Generating an offer's trees is a write that belongs with the stock keeper's
 * screen in the old Back Office until its action moves into src/lib — and a button that half-works is worse
 * than a sentence saying where the button is. The codes themselves are searchable from الزيتونات, which is
 * what anyone opening this screen is usually reaching for.
 */
export default async function OfferPage({ params }: PageProps<"/admin/v2/offers/[projectId]">) {
  await requireStaff();
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, code, name, status, tree_count, total_area_m2, location_description, min_trees_per_order")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) notFound();

  const stock = await offerStock(supabase, project.id);
  const unnumbered = stock.status === "not_generated";

  // The first and last code of this offer, so a reader can recognise a number a client quotes.
  const { data: edges } = await supabase
    .from("trees")
    .select("code")
    .eq("project_id", project.id)
    .order("seq")
    .limit(1);
  const { data: lastEdge } = await supabase
    .from("trees")
    .select("code")
    .eq("project_id", project.id)
    .order("seq", { ascending: false })
    .limit(1);

  const first = edges?.[0]?.code ?? null;
  const last = lastEdge?.[0]?.code ?? null;

  return (
    <Screen
      title={project.name}
      action={
        <Link href="/admin/v2/offers" className="text-xs text-muted hover:text-forest">
          رجوع
        </Link>
      }
    >
      {unnumbered ? (
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          زيتونات هذا العرض ما ترقّمتش، ومعناها ما ينجمش يتباع منّو حتّى زيتونة. الترقيم يتعمل من العروض في
          الإدارة القديمة.
        </p>
      ) : null}

      {stock.status === "partial" ? (
        <p className="card border-gold/50 px-3 py-2.5 text-sm text-forest">
          عدد الزيتونات المرقّمة ({formatCount(stock.trees_total)}) ما يطابقش العدد المعلن (
          {formatCount(stock.trees_declared ?? 0)}).
        </p>
      ) : null}

      <Tiles>
        <Tile label="متاحة" value={unnumbered ? "—" : formatCount(stock.trees_available)} />
        <Tile label="محجوزة" value={unnumbered ? "—" : formatCount(stock.trees_reserved)} />
        <Tile label="مباعة" value={unnumbered ? "—" : formatCount(stock.trees_sold)} />
      </Tiles>

      <Facts>
        <Fact label="الكود">{project.code}</Fact>
        <Fact label="الحالة">{project.status}</Fact>
        <Fact label="العدد المعلن">
          {project.tree_count ? formatCount(project.tree_count) : undefined}
        </Fact>
        <Fact label="المساحة">
          {project.total_area_m2 ? formatArea(project.total_area_m2) : undefined}
        </Fact>
        <Fact label="أصغر طلب">
          {stock.min_trees ? `${formatCount(stock.min_trees)} زيتونة` : undefined}
        </Fact>
        <Fact label="الموقع">{project.location_description ?? undefined}</Fact>
        <Fact label="أوّل رقم">{first ? <span dir="ltr">{first}</span> : undefined}</Fact>
        <Fact label="آخر رقم">{last ? <span dir="ltr">{last}</span> : undefined}</Fact>
      </Facts>

      {first ? (
        <Link
          href={`/admin/v2/trees?q=${encodeURIComponent(first.replace(/-\d+$/, ""))}`}
          className="btn btn-secondary btn-sm"
        >
          شوف زيتونات هذا العرض
        </Link>
      ) : null}
    </Screen>
  );
}
