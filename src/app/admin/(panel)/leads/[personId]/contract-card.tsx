// «العقد والأقساط» on a client file — report v3 §28 (العقود) and §29-§31 (الجدول، الدفع، التأخير), and
// كراس الشروط v2 §34-§36. The act that turns a hold into a sale, landing where the client already is.
//
// HOW TO MOUNT IT. Two lines in src/app/admin/(panel)/leads/[personId]/page.tsx, and NOTHING ELSE — that file
// belongs to another session and this one does not touch it:
//
//   1 · in the Promise.all at :92-96, beside the other module reads:
//         moduleAccess(config, "contracts")
//   2 · in the mount block at :652-660, ONE line immediately after <ReservationCard/> (:657):
//         {contractsAccess !== "closed" && canContract ? (
//           <ContractCard personId={person.id} personName={person.full_name} />
//         ) : null}
//
// `canContract` is the flag already computed at :77-79 from that file's own TREE_CONTRACT_ROLES; a reader
// outside that list is not shown the section at all, and the database refuses the write regardless. The
// import is `import { ContractCard } from "./contract-card";`.
//
// IT READS ITS OWN DATA AND COMPUTES ITS OWN ROLE FLAGS, on purpose: an async Server Component that fetches
// what it needs is one line to mount and one line to remove, and the integrator does not thread six props
// through a 51KB page that several sessions are editing. It renders Client Components for the forms, which is
// the normal direction across the boundary; the shared types live in a plain module (../../contracts/
// contract-model) because a Server Component cannot import a VALUE from a "use client" module.
//
// WHY IT SITS BELOW «الحجز والعربون» AND NOT BESIDE IT. The order on the file is the order of the sale: the
// client asks, visits, holds, then signs. A contract section above the reservation that produced it would
// read as the beginning of the story.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not close or extend a reservation — that stays «الحجز والعربون»'s
// job and its screen. The one thing it does to a reservation is convert it, and that is the only doorway the
// database left open: public.reservation_status carries 'converted' and nothing else in the product writes
// it (0063:1090 refuses it by name), which is why the reservations screen already tells staff «تحويلو لعقد
// يصير من وحدة العقود كي تتبنى». It also does not show the schedule: eighty-four rows do not belong on a
// client file, and every block here links to the contract's own page.

import Link from "next/link";

import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { ContractBlock, type PaymentMethod } from "../../contracts/contract-block";
import { isOpen } from "../../contracts/contract-model";
import { readPersonContracts } from "../../contracts/read";
import { CONTRACT_ROLES } from "../../contracts/roles";
import { SignForm, type ContractKind } from "../../contracts/sign-form";

export type ContractCardProps = {
  personId: string;
  /** Printed in the signing form so the act names the person it is about. */
  personName: string;
};

export async function ContractCard({ personId, personName }: ContractCardProps) {
  const session = await requireStaff(CRM_READ_ROLES);
  const supabase = await createClient();

  const [config, data, { data: settingRows }] = await Promise.all([
    getPublicConfig(),
    // ONE read, not three. Which holds may become a contract is the database's decision — no contract on them
    // yet, still open, and the عربون settled when settings contracts.require_deposit_paid says so — and asking
    // separate questions is a chance for this screen and staff_create_contract to disagree about the answer.
    readPersonContracts(supabase, personId),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  // app.can_contract_trees() — legal · finance · admin. 0054:85: «A commercial may reserve for their own file
  // and no more.» The commercial who sold the deal cannot sign it, and the form says so instead of failing.
  const canSign = hasRole(session, CONTRACT_ROLES);
  // app.can_record_money() — Finance and Admin. Legal signs the paper and does not take the cash (0063:98).
  const canRecordMoney = hasRole(session, PRICE_ROLES);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const methods: PaymentMethod[] = optionsFor(config, "payment_method").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));
  // «عقد وعد بالبيع» and whatever the owner adds beside it, from الإعدادات ← القوائم. Left empty, the database
  // takes the first active row itself, so an empty list is not a dead end.
  const kinds: ContractKind[] = optionsFor(config, "contract_kind").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));

  // A failed read is said out loud rather than drawn as an empty section that looks like «this client has no
  // contract»: before the migration is applied there is no table to read at all.
  if (data === null) {
    return (
      <section id="contracts" className="scroll-mt-24 space-y-3">
        <h2 className="text-lg font-semibold">العقد والأقساط</h2>
        <p className="card p-cozy text-sm leading-6 text-muted">
          ما نجمناش نقراو العقود. إذا كانت هذي أول مرة، جداول العقود والأقساط مازالت ما تركّبتش في قاعدة
          البيانات (supabase/pending/bb_60_contracts_installments.sql). كلّم المسؤول باش يركّبها، ومن بعد حدّث
          الصفحة.
        </p>
      </section>
    );
  }

  // The module is not an access rule for the team (layout.tsx:47-54): the section is drawn either way, and the
  // controls are not, because the database refuses the write with module_closed. Both states come from the RPC
  // itself, so this screen and the refusal can never disagree about which switch is off.
  const contractsOpen = data.moduleState !== "disabled";
  const installmentsOpen = data.installmentsState !== "disabled";

  const open = data.contracts.filter(isOpen);
  const closed = data.contracts.filter((contract) => !isOpen(contract));

  return (
    <section id="contracts" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-tight">
        <h2 className="text-lg font-semibold">
          العقد والأقساط{data.contracts.length > 0 ? ` (${formatCount(data.contracts.length)})` : ""}
        </h2>
        <Link href="/admin/contracts" className="text-sm underline-offset-4 hover:underline">
          كل العقود
        </Link>
      </div>

      {open.map((contract) => (
        <ContractBlock
          key={contract.id}
          contract={contract}
          methods={methods}
          reasonMin={reasonMin}
          canRecordMoney={canRecordMoney}
          installmentsOpen={installmentsOpen}
        />
      ))}

      <SignForm
        personName={personName}
        choices={data.convertible}
        kinds={kinds}
        methods={methods}
        reasonMin={reasonMin}
        moduleOpen={contractsOpen}
        canSign={canSign}
        requireDepositPaid={data.requireDepositPaid}
      />

      {/* `.disclosure.card` carries its own padding (globals.css), so p-cozy would double it. */}
      {closed.length > 0 ? (
        <details className="card disclosure">
          <summary className="text-sm font-semibold">عقود سابقة ({formatCount(closed.length)})</summary>
          <div className="space-y-3">
            {closed.map((contract) => (
              <ContractBlock
                key={contract.id}
                contract={contract}
                methods={methods}
                reasonMin={reasonMin}
                canRecordMoney={canRecordMoney}
                installmentsOpen={installmentsOpen}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
