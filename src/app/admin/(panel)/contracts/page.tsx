import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile } from "@/components/ui";
import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { ContractBlock, type PaymentMethod } from "./contract-block";
import { CONTRACT_FILTERS, FILTER_LABELS, FILTER_NOTES, type ContractFilter } from "./contract-model";
import { parseFilter, readContracts } from "./read";

export const metadata: Metadata = { title: "العقود ووعد البيع" };

/**
 * العقود ووعد البيع — report v3 §28-§31 and كراس الشروط v2 §34-§36.
 *
 * WHAT IT LEADS WITH. A contract list sorted by date created is a filing cabinet. The three questions this
 * screen exists to answer are «شنوّة تمضى», «شنوّة مستنّي إمضاء» and «شنوّة تأخّر», so the default view is the
 * open contracts and the order inside it is the order of attention — §31's critical files first, then the
 * merely late, then the drafts waiting for a signature, then the rest. That order is decided by
 * staff_contracts and is not re-sorted here. Each tile is a link into its own filter, so «3 فيها تأخير» is
 * not a figure to admire but a way in.
 *
 * THE LADDER IS A READ, NOT A JOB. §31's rungs — Reminder, Overdue, Late Payment 1, Critical/Contract Review
 * — are computed by app.contract_money at query time from the due dates, the live payments and the settings
 * under `installments.`, and nothing on this screen or behind it changes a contract's state on a timer. Both
 * documents forbid that in the same words: «لا يوجد فسخ آلي» (v2 §36) and «ما نخليوش النظام يلغي الملكية أو
 * العقد قانونياً وحده» (v3 §31). What the software does is put the file in front of a human.
 *
 * WHY THE SCREEN OPENS WHILE THE MODULE IS OFF. src/app/admin/(panel)/layout.tsx:47-54 states the rule: the
 * flag says what VISITORS see and is not an access rule for the team — the Back Office is where a module is
 * prepared before it is published. So the page reads and renders with `contracts` disabled, says so in one
 * line with a link to the switch, and draws no control the database would refuse. Turning it on is the
 * owner's own act. Both flag states come from the RPC itself, so the sentence and the refusal can never
 * disagree about which module is off.
 *
 * NOTHING ON THIS PAGE IS COMPUTED. The counts, the ordering, the balances, the lateness and the Arabic of
 * every status all arrive decided from Postgres.
 */
export default async function ContractsPage({ searchParams }: PageProps<"/admin/contracts">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const filter: ContractFilter = parseFilter(params.filter);

  const supabase = await createClient();
  const [config, list, { data: settingRows }] = await Promise.all([
    getPublicConfig(),
    readContracts(supabase, filter),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  // app.can_record_money(): recording an instalment is Finance's and Admin's. Legal signs and does not take
  // cash — 0063:98, «signing the contract and taking the cash are two different desks».
  const canRecordMoney = hasRole(session, PRICE_ROLES);

  // The methods the owner keeps in الإعدادات ← القوائم, never a list written here. v3 §30 names four channels
  // and the seeded list holds four different ones; that divergence is correct — it is the owner's list.
  const methods: PaymentMethod[] = optionsFor(config, "payment_method").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));

  const contractsOff = list !== null && list.moduleState === "disabled";
  const installmentsOff = list !== null && list.installmentsState === "disabled";

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title="العقود ووعد البيع"
        description="كل عقد: مع شكون، على أنا أرض، قدّاش زيتونة، بشحال، وعلى قدّاش من قسط. الترتيب حسب اللي يلزمو تدخّل اليوم."
      />

      {contractsOff || installmentsOff ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">
            {contractsOff && installmentsOff
              ? "موديولا «العقود ووعد البيع» و«الأقساط» معطّلين."
              : contractsOff
                ? "موديول «العقود ووعد البيع» معطّل."
                : "موديول «الأقساط» معطّل."}
          </span>{" "}
          الشاشة هاذي مفتوحة للفريق باش تحضّرها، أما{" "}
          {contractsOff ? "كتابة العقد وإمضاؤه " : ""}
          {contractsOff && installmentsOff ? "و" : ""}
          {installmentsOff ? "تسجيل الأقساط وتوليد الجدول " : ""}
          موقّفين في قاعدة البيانات روحها. كي تكون جاهز، شغّلهم من{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>
          : «داخلي فقط» تكفي باش يخدم بيهم الفريق.
        </p>
      ) : null}

      {list === null ? (
        <EmptyState title="ما نجمناش نقراو العقود.">
          إذا كانت هذي أول مرة، جداول العقود والأقساط مازالت ما تركّبتش في قاعدة البيانات
          (supabase/pending/bb_60_contracts_installments.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث الصفحة.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={FILTER_LABELS.late}
              value={list.counts.late}
              href="/admin/contracts?filter=late"
              emphasis={list.counts.late > 0}
              quiet={list.counts.late === 0}
              note={FILTER_NOTES.late}
            />
            <StatTile
              label={FILTER_LABELS.draft}
              value={list.counts.draft}
              href="/admin/contracts?filter=draft"
              quiet={list.counts.draft === 0}
              note={FILTER_NOTES.draft}
            />
            <StatTile
              label={FILTER_LABELS.signed}
              value={list.counts.signed}
              href="/admin/contracts?filter=signed"
              quiet={list.counts.signed === 0}
              note={FILTER_NOTES.signed}
            />
            <StatTile
              label={FILTER_LABELS.owned}
              value={list.counts.owned}
              href="/admin/contracts?filter=owned"
              quiet={list.counts.owned === 0}
              note={FILTER_NOTES.owned}
            />
          </div>

          <nav aria-label="فرز العقود" className="flex flex-wrap gap-tight">
            {CONTRACT_FILTERS.map((key) => (
              <Link
                key={key}
                href={`/admin/contracts?filter=${key}`}
                // .chip in globals.css styles the selected one from aria-current="true"; no second class.
                aria-current={key === filter ? "true" : undefined}
                className="chip"
              >
                {FILTER_LABELS[key]}
                <span className="ms-1 tabular-nums text-muted">{formatCount(list.counts[key])}</span>
              </Link>
            ))}
          </nav>

          <p className="hint">{FILTER_NOTES[filter]}</p>

          {list.rows.length === 0 ? (
            <EmptyState title="ما فماش عقود في هذا الفرز.">
              العقد يتكتب من ملفّ الحريف، على حجز موجود: افتح الملفّ، شوف قسم «العقد والأقساط» واكتب العقد من
              هناك. الحجز يتسكّر وحدو كي يولّي عقد.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {list.rows.map((contract) => (
                <ContractBlock
                  key={contract.id}
                  contract={contract}
                  methods={methods}
                  reasonMin={reasonMin}
                  canRecordMoney={canRecordMoney}
                  installmentsOpen={list.installmentsState !== "disabled"}
                  showPerson
                />
              ))}
            </div>
          )}

          {list.capped ? (
            <p className="hint">
              نعرضو أول <span className="tabular-nums">{formatCount(list.limit)}</span> عقد برك من{" "}
              <span className="tabular-nums">{formatCount(list.matched)}</span>. ضيّق الفرز باش تشوف البقية.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
