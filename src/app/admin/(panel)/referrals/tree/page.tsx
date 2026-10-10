import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { ActionForm } from "@/components/admin/action-form";
import { EmptyState, SectionHeader, StatTile } from "@/components/ui";
import { ADMIN_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import type { ReferralPerson, ReferralTree } from "@/lib/backoffice/referrals";
import { formatCount, formatDate, formatMillimes } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { setReferrer } from "../actions";

export const metadata: Metadata = { title: "شجرة التوصية" };

type Found = ReferralPerson & { direct: number; has_referrer: boolean };
type Node = ReferralTree["downline"][number];

/**
 * شجرة التوصية (§6 «يشوف شجرة الإحالات»): one client in the middle — who brought them, generation by
 * generation up to the rule's depth, and everyone below them down to the same depth, as a nested list. Search
 * by name, phone or referral code. An admin can correct who brought a client, with a reason; the commissions
 * already computed keep the chain they were computed on.
 */
export default async function ReferralTreePage({ searchParams }: PageProps<"/admin/referrals/tree">) {
  const session = await requireStaff(PRICE_ROLES);
  const isAdmin = hasRole(session, ADMIN_ROLES);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const personId = typeof params.person === "string" && z.uuid().safeParse(params.person).success ? params.person : null;

  const supabase = await createClient();
  const [foundRes, treeRes] = await Promise.all([
    query ? supabase.rpc("staff_referral_find", { p_query: query }) : Promise.resolve({ data: null, error: null }),
    personId ? supabase.rpc("staff_referral_tree", { p_person: personId }) : Promise.resolve({ data: null, error: null }),
  ]);
  const found = (foundRes.data as unknown as Found[] | null) ?? [];
  const tree = treeRes.data as unknown as ReferralTree | null;

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        level={1}
        title="شجرة التوصية"
        description="شكون جاب الحريف، وشكون جاو عن طريقو، جيل بجيل."
        actions={
          <Link href="/admin/referrals" className="btn btn-secondary">
            الكوميسيونات
          </Link>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 space-y-1">
          <span className="text-sm font-semibold">ابحث: الاسم، الهاتف ولا كود التوصية</span>
          <input name="q" defaultValue={query} minLength={2} maxLength={80} className="field field-sm w-full" />
        </label>
        <button type="submit" className="btn btn-primary">
          ابحث
        </button>
      </form>

      {query ? (
        found.length === 0 ? (
          <EmptyState size="sm">ما لقينا حتى حريف بهذا البحث.</EmptyState>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {found.map((person) => (
              <li key={person.id} className="card flex flex-wrap items-baseline justify-between gap-2 p-cozy text-sm">
                <Link href={`/admin/referrals/tree?person=${person.id}`} className="font-semibold hover:underline">
                  {person.full_name}
                </Link>
                <span className="text-muted" dir="ltr">
                  {person.phone_e164}
                  {person.referral_code ? ` · ${person.referral_code}` : ""}
                </span>
                <span className="w-full text-xs text-muted">
                  جاب {formatCount(person.direct)} مباشرة{person.has_referrer ? " · عندو Parrain" : ""}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {personId && !tree ? <EmptyState size="sm">الحريف هذا ما عادش موجود.</EmptyState> : null}

      {tree ? (
        <div className="space-y-6">
          <section className="card space-y-2 p-cozy">
            <p className="text-lg font-bold">{tree.person.full_name}</p>
            <p className="text-sm text-muted" dir="ltr">
              {tree.person.phone_e164}
              {tree.person.referral_code ? ` · ${tree.person.referral_code}` : ""}
            </p>
            {tree.person.referred_at ? (
              <p className="text-xs text-muted">
                تسجّل برابط توصية في {formatDate(tree.person.referred_at)}
                {typeof tree.person.referral_meta?.channel === "string" && tree.person.referral_meta.channel === "staff"
                  ? " (تصحيح من الإدارة)"
                  : ""}
              </p>
            ) : null}
          </section>

          <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
            <StatTile size="sm" label="في الانتظار" value={formatMillimes(tree.earnings.pending_millimes)} />
            <StatTile size="sm" label="مؤكّدة" value={formatMillimes(tree.earnings.validated_millimes)} />
            <StatTile size="sm" label="مخلّصة" value={formatMillimes(tree.earnings.paid_millimes)} />
            <StatTile size="sm" label="يلزم ترجع" value={formatMillimes(tree.earnings.reversed_millimes)} quiet={tree.earnings.reversed_millimes === 0} />
          </div>

          <section className="space-y-2">
            <SectionHeader title="شكون جابو" description={`حتى ${formatCount(tree.depth)} أجيال للفوق.`} />
            {tree.upline.length === 0 ? (
              <EmptyState size="sm">ما عندوش Parrain.</EmptyState>
            ) : (
              <ol className="space-y-1 text-sm">
                {tree.upline.map((person) => (
                  <li key={person.id}>
                    <span className="text-muted">الجيل {formatCount(person.generation)}: </span>
                    <Link href={`/admin/referrals/tree?person=${person.id}`} className="font-semibold hover:underline">
                      {person.full_name}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
            {isAdmin ? (
              <details className="card p-cozy text-sm">
                <summary className="cursor-pointer font-semibold">صلّح شكون جابو</summary>
                <p className="mt-2 text-xs text-muted">
                  اكتب كود التوصية متاع الـParrain الصحيح، ولا خلّيه فارغ باش تنحّي الـParrain. الكوميسيونات اللي تحسبت قبل
                  تبقى كيف ما هي.
                </p>
                <ActionForm action={setReferrer.bind(null, tree.person.id)} submitLabel="سجّل التصحيح" className="mt-3 space-y-2">
                  <input name="referrer_code" maxLength={20} dir="ltr" placeholder="K7M2QX" className="field field-sm w-full" />
                  <input name="reason" required minLength={3} maxLength={1000} placeholder="السبب (إجباري)" className="field field-sm w-full" />
                </ActionForm>
              </details>
            ) : null}
          </section>

          <section className="space-y-2">
            <SectionHeader
              title="شكون جاو عن طريقو"
              description={`${formatCount(tree.downline.length)} شخص على ${formatCount(tree.depth)} أجيال.`}
            />
            {tree.downline.length === 0 ? (
              <EmptyState size="sm">حتى حدّ ما سجّل بالرابط متاعو.</EmptyState>
            ) : (
              <Downline nodes={tree.downline} parent={tree.person.id} />
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

/** The people below, nested under the one who brought each of them. */
function Downline({ nodes, parent }: { nodes: readonly Node[]; parent: string }) {
  const children = nodes.filter((node) => node.parent_id === parent);
  if (children.length === 0) return null;
  return (
    <ul className="space-y-1 border-s border-line ps-4">
      {children.map((node) => (
        <li key={node.id} className="text-sm">
          <span className="text-xs text-muted">ج{formatCount(node.generation)} · </span>
          <Link href={`/admin/referrals/tree?person=${node.id}`} className="font-semibold hover:underline">
            {node.full_name}
          </Link>
          <span className="text-xs text-muted">
            {node.referred_at ? ` · ${formatDate(node.referred_at)}` : ""}
            {node.contracts > 0 ? ` · ${formatCount(node.contracts)} عقد` : ""}
          </span>
          <Downline nodes={nodes} parent={node.id} />
        </li>
      ))}
    </ul>
  );
}
