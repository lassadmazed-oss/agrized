// ملفات الحرفاء — everyone who holds at least one olive tree, and the way into their «زيتونتي» file.
//
// EMPTY IS THE NORMAL STATE TODAY, not an edge case: all 8 600 trees of the three published offers are
// `available` and not one is held. A tree becomes a client's when the Back Office marks it sold to them in the
// offer's card, so the empty screen says exactly that instead of showing a blank page.
//
// The list is filtered row by row inside public.staff_zitounti_holders() through app.can_see_person, so a
// commercial sees the holders in their own files and this never becomes a directory of every buyer AgriZed has.

import type { Metadata } from "next";

import { DataTable, EmptyState, SectionHeader, StatTile } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, settingText } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { FAILURE_MESSAGES, zitountiCopy, zitountiHolders, type Holder } from "./read";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ملفات الحرفاء" };

export default async function ZitountiHoldersPage() {
  await requireStaff(CRM_READ_ROLES);

  const supabase = await createClient();
  const config = await getPublicConfig();
  const [access, copy] = await Promise.all([moduleAccess(config, "zitounti"), zitountiCopy(supabase)]);

  const title = copy("zitounti.title", "فضاء «زيتونتي»");
  const soldLabel = settingText(config, "offers.stock_sold_label", "المباعة");
  const reservedLabel = settingText(config, "offers.stock_reserved_label", "المحجوزة");

  const header = <SectionHeader level={1} title={title} description={copy("zitounti.intro")} />;

  if (access === "closed") {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState>{FAILURE_MESSAGES.closed}</EmptyState>
      </div>
    );
  }

  const result = await zitountiHolders(supabase);
  if (!result.ok) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState>{FAILURE_MESSAGES[result.reason]}</EmptyState>
      </div>
    );
  }

  const holders = result.holders;
  const totals = holders.reduce(
    (sum, row) => ({
      trees: sum.trees + row.trees,
      sold: sum.sold + row.trees_sold,
      reserved: sum.reserved + row.trees_reserved,
    }),
    { trees: 0, sold: 0, reserved: 0 },
  );

  const columns = [
    {
      key: "name",
      header: "الحريف",
      cell: (row: Holder) => row.full_name,
      className: "font-semibold",
      numeric: false,
      mobile: "title" as const,
    },
    {
      key: "phone",
      header: "الهاتف",
      cell: (row: Holder) => (
        <span dir="ltr" className="tabular-nums">
          {formatPhone(row.phone_e164)}
        </span>
      ),
      mobile: "meta" as const,
    },
    {
      key: "governorate",
      header: "الولاية",
      cell: (row: Holder) => row.governorate ?? "—",
      numeric: false,
    },
    {
      key: "trees",
      header: "عدد الزيتونات",
      cell: (row: Holder) => formatCount(row.trees),
      numeric: true,
      align: "end" as const,
      mobile: "aside" as const,
    },
    {
      key: "sold",
      header: soldLabel,
      cell: (row: Holder) => formatCount(row.trees_sold),
      numeric: true,
      align: "end" as const,
    },
    {
      key: "reserved",
      header: reservedLabel,
      cell: (row: Holder) => formatCount(row.trees_reserved),
      numeric: true,
      align: "end" as const,
    },
    {
      key: "offers",
      header: "العروض",
      cell: (row: Holder) => row.offer_codes.join("، "),
      numeric: false,
    },
  ];

  return (
    <div className="space-y-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="الحرفاء" value={holders.length} quiet={holders.length === 0} />
        <StatTile label="الزيتونات" value={totals.trees} quiet={totals.trees === 0} />
        <StatTile label={soldLabel} value={totals.sold} quiet={totals.sold === 0} />
      </div>

      <DataTable
        caption="الحرفاء اللي عندهم زيتونات مسجّلة باسمهم"
        columns={columns}
        rows={holders}
        rowKey={(row) => row.person_id}
        rowHref={(row) => `/admin/persons/${row.person_id}`}
        minWidth="56rem"
        empty={
          <EmptyState title="مازال حتى حريف ما عندوش زيتونات باسمه">
            {copy(
              "zitounti.empty_trees",
              "الزيتونة تولّي متاع الحريف كي تتسجّل «مباعة» باسمه في بطاقة العرض، من صفحة العروض ← الزيتونات.",
            )}
          </EmptyState>
        }
      />
    </div>
  );
}
