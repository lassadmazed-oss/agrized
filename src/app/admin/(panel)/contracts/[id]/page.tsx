import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataList, DataRow, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { ContractActs } from "../contract-acts";
import {
  CONTRACT_TONES,
  daysLateLabel,
  isOpen,
  nextLine,
  planLine,
  progressLabel,
  STAGE_TONES,
  stageWorthShowing,
  type Contract,
  formatAmount,
} from "@/lib/backoffice/contracts/model";
import { DownPaymentCard, type PaymentMethod } from "../payment-forms";
import { readContract } from "@/lib/backoffice/contracts/read";
import { CANCEL_ROLES, CONTRACT_ROLES } from "@/lib/backoffice/contracts/roles";
import { PaymentLines, ScheduleList } from "../schedule-list";

export const metadata: Metadata = { title: "العقد" };

/**
 * ONE CONTRACT, READ AS A DOCUMENT — report v3 §28-§31, كراس الشروط v2 §34-§36 and §38.
 *
 * THE SHAPE IS THE POINT. A contract is a statement, so the screen is a statement: with whom, on what land,
 * for how many trees, at what price, over how long, signed when and recorded where. The eight fields v2 §34
 * requires of a contract — Customer · Parcel · Total Price · Down Payment · Payment Plan · Payment Method ·
 * Legal document reference · Signature Date — are all in the first block, in that order, because §34 states
 * them without «مثلاً» and they are the acceptance test for this page. A reader should be able to say the
 * whole thing down the phone without opening anything else.
 *
 * THE عربون IS PRINTED BESIDE THE TSABQA AND NEVER SUMMED WITH IT BY THIS PAGE. Neither document says whether
 * the deposit already paid is deducted from the down payment still owed or is a separate fee on top, and that
 * single question decides the one number a client is asked for at signature. app.contract_money answers it
 * once, from the `deposit_credited_millimes` frozen into the contract when it was written, and both figures
 * are printed with the rule that was in force — so a wrong answer is visible instead of silent.
 *
 * WHAT IS NOT HERE, ON PURPOSE. No file upload: v3 §28's document shelf («لازم يكون لكل حريف Documents
 * section») has no table and no private bucket anywhere in this database, and bolting half of one onto
 * contracts would make this module carry a feature the whole product needs. v2 §34's own field — «Legal
 * document reference» — records where the paper is, which is what the spec asked for. No receipt PDF either:
 * §59 asks for a traceable record, and that is the payments row with its AGZ-PAY number.
 */
export default async function ContractPage({ params }: PageProps<"/admin/contracts/[id]">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const { id } = await params;

  const supabase = await createClient();
  const [config, contract, { data: settingRows }] = await Promise.all([
    getPublicConfig(),
    readContract(supabase, id),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  // Null is «does not exist, or you may not see this person's file» — app.can_see_person decides, not this
  // page. 404 is the right answer to both: naming a contract a reader may not open would leak that it exists.
  if (!contract) notFound();

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const contractsOpen = flagState(config, "contracts") !== "disabled";
  const installmentsOpen = flagState(config, "installments") !== "disabled";
  const canRecordMoney = hasRole(session, PRICE_ROLES);
  const canSign = hasRole(session, CONTRACT_ROLES);
  const canCancel = hasRole(session, CANCEL_ROLES);

  const methods: PaymentMethod[] = optionsFor(config, "payment_method").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));

  const money = contract.money;
  const plan = planLine(contract, formatAmount);
  const progress = progressLabel(contract);
  const late = daysLateLabel(nextLine(contract)?.daysLate ?? null);
  // A receipt names «القسط 7» rather than a uuid. The map is the schedule the payload already carried.
  const lineBySeq = new Map(money.lines.map((line) => [line.id, line.seq] as const));

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title={contract.kindLabel ?? "عقد"}
        description={
          <>
            <span dir="ltr" className="inline-block font-semibold tabular-nums text-ink">
              {contract.referenceNo}
            </span>
            {contract.legalDocumentRef ? (
              <>
                {" · مرجع الوثيقة "}
                <span dir="ltr" className="inline-block tabular-nums">
                  {contract.legalDocumentRef}
                </span>
              </>
            ) : null}
          </>
        }
        badge={
          <span className="flex flex-wrap items-center gap-tight">
            <StatusPill tone={CONTRACT_TONES[contract.status]}>{contract.statusLabel}</StatusPill>
            {stageWorthShowing(money.stage) ? (
              <StatusPill tone={STAGE_TONES[money.stage]}>{money.stageLabel}</StatusPill>
            ) : null}
            {contract.ownedAt ? <StatusPill tone="brand">ولّى مالك</StatusPill> : null}
          </span>
        }
        actions={
          <Link href="/admin/contracts" className="text-sm underline-offset-4 hover:underline">
            كل العقود
          </Link>
        }
      />

      {!contractsOpen ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">موديول «العقود ووعد البيع» معطّل.</span> الصفحة مفتوحة للقراية، أما
          الإمضاء وتسجيل التملّك والفسخ موقّفين في قاعدة البيانات روحها.{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            شغّلو من الإعدادات ← الموديولات
          </Link>
          .
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- the document itself */}
      <section aria-labelledby="contract-terms" className="card p-cozy space-y-3">
        <SectionHeader id="contract-terms" level={2} title="شنوّة تفاهمنا عليه" />

        <DataList variant="divided">
          <DataRow label="الحريف" numeric={false}>
            <Link href={`/admin/leads/${contract.personId}`} className="underline-offset-4 hover:underline">
              {contract.personName ?? "—"}
            </Link>
            {contract.personPhone ? (
              <span dir="ltr" className="ms-2 inline-block text-sm font-normal tabular-nums text-muted">
                {formatPhone(contract.personPhone)}
              </span>
            ) : null}
          </DataRow>

          <DataRow label="الأرض / العرض" numeric={false}>
            <Link href={`/admin/projects/${contract.projectId}`} className="underline-offset-4 hover:underline">
              {contract.offerName ?? "—"}
            </Link>
            {contract.offerCode ? (
              <span dir="ltr" className="ms-2 inline-block text-sm font-normal tabular-nums text-muted">
                {contract.offerCode}
              </span>
            ) : null}
          </DataRow>

          <DataRow label="الزيتونات">
            {formatCount(contract.treesCount)}
            {contract.firstCode ? (
              <span dir="ltr" className="ms-2 inline-block text-sm font-normal tabular-nums text-muted">
                {contract.firstCode === contract.lastCode
                  ? contract.firstCode
                  : `${contract.firstCode} … ${contract.lastCode}`}
              </span>
            ) : null}
          </DataRow>

          <DataRow label="ثمن الزيتونة">{formatAmount(contract.pricePerTreeMillimes)}</DataRow>

          <DataRow label="الثمن بالحاضر">{formatAmount(contract.totalPriceMillimes)}</DataRow>

          <DataRow label={money.downPaymentKindLabel}>
            {formatAmount(money.downPaymentMillimes)}
            {contract.downPaymentPercent !== null ? (
              <span className="ms-2 inline-block text-sm font-normal text-muted">
                {contract.downPaymentPercent}%
              </span>
            ) : null}
          </DataRow>

          {/* The open question, printed rather than resolved. */}
          {contract.reservationDepositMillimes > 0 ? (
            <DataRow label="عربون الحجز">
              {formatAmount(contract.reservationDepositMillimes)}
              <span className="ms-2 inline-block text-sm font-normal text-muted">
                {money.depositCreditedMillimes > 0
                  ? `محسوب من ${money.downPaymentKindLabel}`
                  : `زايد على ${money.downPaymentKindLabel}`}
              </span>
            </DataRow>
          ) : null}

          <DataRow label="خطة الخلاص" numeric={false}>
            {contract.paymentMode === "cash" ? (
              "بالحاضر"
            ) : plan ? (
              <span className="tabular-nums">{plan}</span>
            ) : (
              <span className="text-muted">ما تحدّدتش</span>
            )}
          </DataRow>

          {contract.paymentMode === "installments" && contract.totalFinancedMillimes !== null ? (
            <DataRow label="الجملة بالتقسيط">
              {formatAmount(contract.totalFinancedMillimes)}
              {contract.markupBp !== null ? (
                <span className="ms-2 inline-block text-sm font-normal text-muted">
                  زيادة التقسيط {contract.markupBp / 100}%
                </span>
              ) : null}
            </DataRow>
          ) : null}

          <DataRow label="طريقة الدفع" numeric={false}>
            {contract.methodLabel ?? <span className="text-muted">ما تحدّدتش</span>}
          </DataRow>

          <DataRow label="مرجع الوثيقة القانونية" numeric={false}>
            {contract.legalDocumentRef ? (
              <span dir="ltr" className="inline-block tabular-nums">
                {contract.legalDocumentRef}
              </span>
            ) : (
              <span className="text-muted">مازال ما تسجّلش</span>
            )}
          </DataRow>

          <DataRow label="تاريخ الإمضاء" numeric={false}>
            {contract.signedOn ? (
              <span className="tabular-nums">{formatDate(contract.signedOn)}</span>
            ) : (
              <span className="text-muted">مازال ما تمضاش</span>
            )}
            {contract.signedBy ? (
              <span className="ms-2 inline-block text-sm font-normal text-muted">{contract.signedBy}</span>
            ) : null}
          </DataRow>

          <DataRow label="تاريخ التملّك" numeric={false}>
            {contract.ownedAt ? (
              <span className="tabular-nums">{formatDate(contract.ownedAt)}</span>
            ) : (
              <span className="text-muted">مازالت الشروط القانونية ما كمّلتش</span>
            )}
            {contract.ownedBy ? (
              <span className="ms-2 inline-block text-sm font-normal text-muted">{contract.ownedBy}</span>
            ) : null}
          </DataRow>
        </DataList>

        {contract.note ? <p className="text-sm leading-6">{contract.note}</p> : null}

        {contract.treesStillReserved > 0 ? (
          <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
            فمّا <span className="tabular-nums">{formatCount(contract.treesStillReserved)}</span> زيتونة مازالت
            متعلّمة «محجوزة» ورا هذا العقد بدل «مباعة». شوف تبويب «الزيتونات» متاع العرض قبل ما تكلّم الحريف.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- where the money stands */}
      <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="الجملة المطلوبة"
          value={formatAmount(money.totalDueMillimes)}
          note={
            contract.paymentMode === "installments"
              ? `${money.downPaymentKindLabel} + الأقساط، كيما تجمّدت نهار العقد.`
              : "بالحاضر، كيما تجمّد نهار العقد."
          }
        />
        <StatTile
          label="اللي وصل"
          value={formatAmount(money.totalPaidMillimes)}
          note="كل الوصولات الحيّة على هذا العقد؛ الموقّفة ما تتحسبش."
        />
        <StatTile
          label="الباقي"
          value={formatAmount(money.totalLeftMillimes)}
          quiet={money.totalLeftMillimes === 0}
          note={progress ?? "بلا جدول أقساط."}
        />
        <StatTile
          label="التأخير"
          value={formatCount(money.missedCount)}
          emphasis={money.missedCount > 0}
          quiet={money.missedCount === 0}
          note={
            late
              ? `${late} · مهلة السماح ${formatCount(money.graceDays)} يوم.`
              : `ما فماش قسط متأخّر. مهلة السماح ${formatCount(money.graceDays)} يوم.`
          }
        />
      </div>

      {money.stage === "critical" ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm leading-6 text-danger">
          <span className="font-semibold">حالة حرجة (البند 31).</span> فات{" "}
          <span className="tabular-nums">{formatCount(money.late2Missed)}</span> قسط ولا أكثر. النظام ما يفسخش
          عقد وحدو ولا ينحّي ملكية: الملفّ يمشي للقانوني والإدارة، والقرار يتاخذ حسب العقد والقانون، ومن بعد
          يتسجّل هنا بسببو.
        </p>
      ) : null}

      <ContractActs
        contract={contract}
        reasonMin={reasonMin}
        moduleOpen={contractsOpen}
        installmentsOpen={installmentsOpen}
        canSign={canSign}
        canCancel={canCancel}
      />

      {!isOpen(contract) ? (
        <p className="card p-cozy text-sm leading-6">
          {contract.status === "cancelled" ? (
            <>
              العقد تفسخ يوم {contract.cancelledAt ? formatDateTime(contract.cancelledAt) : "—"}
              {contract.treesReleased ? " · والزيتونات رجعت متاحة." : " · والزيتونات باقية مباعة على الحريف."}
              {contract.cancelReason ? ` · ${contract.cancelReason}` : null}
            </>
          ) : (
            <>كمّل خلاصو يوم {contract.settledAt ? formatDateTime(contract.settledAt) : "—"}.</>
          )}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- the schedule.
          A CASH CONTRACT GETS NO SCHEDULE SECTION AT ALL, not an empty one. v3 §51 makes «Prix cash» a real
          case and public.interest_requests already carries payment_mode='cash'; what distinguishes the two is
          the PRESENCE of schedule rows and not a flag, so the screen reads the same fact the schema does. A
          heading saying «جدول الأقساط» above «ما فماش» would invite somebody to go and generate one. */}
      {contract.paymentMode === "installments" ? (
        <section aria-labelledby="contract-schedule" className="space-y-3">
          <SectionHeader
            id="contract-schedule"
            level={2}
            title="جدول الأقساط"
            description={
              contract.planInstallmentsCount !== null
                ? `${formatCount(contract.planInstallmentsCount)} قسط${
                    // Said out loud, because a count shorter than the duration LOOKS like a bug and is not:
                    // app.financed_quote rounds the monthly up, then recomputes the count from it.
                    contract.planShortened && contract.durationMonths !== null
                      ? ` — أقصر من ${formatCount(contract.durationMonths)} شهر، خاطر القسط يتقرّب للفوق وآخر واحد يشدّ الباقي.`
                      : ""
                  }${contract.firstDueOn ? ` · أول قسط يوم ${formatDate(contract.firstDueOn)}` : ""}`
                : undefined
            }
          />
          <ScheduleList
            contract={contract}
            methods={methods}
            reasonMin={reasonMin}
            canRecordMoney={canRecordMoney}
            installmentsOpen={installmentsOpen}
          />
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- the signature payment.
          ALWAYS drawn, even with nothing recorded yet: on a cash contract this is the only place the money
          can be taken, so hiding it until a first receipt exists would hide the act that creates one. */}
      <section aria-labelledby="contract-down" className="space-y-3">
        <SectionHeader
          id="contract-down"
          level={2}
          title={contract.paymentMode === "cash" ? "الخلاص بالحاضر" : money.downPaymentKindLabel}
          description={
            contract.paymentMode === "cash"
              ? "عقد بالحاضر: الثمن الكامل يتسجّل هنا، وما فماش جدول أقساط."
              : "اللي يتخلّص نهار الإمضاء، قبل ما تبدا الأقساط."
          }
        />
        <DownPaymentCard
          contract={contract}
          methods={methods}
          reasonMin={reasonMin}
          canRecordMoney={canRecordMoney}
          installmentsOpen={installmentsOpen}
        />
      </section>

      {/* ---------------------------------------------------------------- every receipt, in full */}
      {contract.payments.length > 0 ? (
        <section aria-labelledby="contract-payments" className="space-y-3">
          <SectionHeader
            id="contract-payments"
            level={2}
            title="كل الوصولات"
            description="كل دفعة على هذا العقد، الجديدة الأولى — بمرجعها، وشكون سجّلها. التوقيف يصير من هنا."
          />
          <PaymentLines
            payments={contract.payments}
            personId={contract.personId}
            reasonMin={reasonMin}
            canVoid={installmentsOpen && canRecordMoney}
            lineBySeq={lineBySeq}
          />
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- where this came from */}
      <section aria-labelledby="contract-origin" className="card p-cozy space-y-3">
        <SectionHeader id="contract-origin" level={3} title="من وين جاء هذا العقد" />
        <DataList variant="grid" columns={2}>
          <DataRow label="الحجز" layout="stacked" numeric={false}>
            {contract.reservationNo ? (
              <Link
                href="/admin/reservations?filter=closed"
                dir="ltr"
                className="inline-block tabular-nums underline-offset-4 hover:underline"
              >
                {contract.reservationNo}
              </Link>
            ) : (
              "—"
            )}
          </DataRow>
          <DataRow label="المطلب" layout="stacked" numeric={false}>
            {contract.requestNo ? (
              <span dir="ltr" className="inline-block tabular-nums">
                {contract.requestNo}
              </span>
            ) : (
              <span className="text-muted">بلا مطلب — حريف تعرّفنا عليه مباشرة</span>
            )}
          </DataRow>
          <DataRow label="تحرّر يوم" layout="stacked" numeric={false}>
            <span className="tabular-nums">{contract.createdAt ? formatDateTime(contract.createdAt) : "—"}</span>
          </DataRow>
          <DataRow label="كتبو" layout="stacked" numeric={false}>
            {contract.createdBy ?? "—"}
          </DataRow>
        </DataList>
        <p className="hint">
          العقد الواحد يمشي مع حجز واحد (كراس الشروط v2، البند 49). حريف عندو زوز حجوزات يتعملولو زوز عقود، كلّ
          واحد على زيتوناتو.
        </p>
      </section>

      <OwnershipNote contract={contract} />
    </div>
  );
}

/**
 * The three moments the spec separates, said once at the bottom of the page, because the difference between
 * them is the thing staff will get wrong: a tree is `sold` from the day the contract was written (0054:83 and
 * the public counter both read that state), the signature is a date on paper, and ownership is a third thing
 * that comes «بعد اكتمال الشروط القانونية» (v2 §38) and is what opens «زيتونتي».
 */
function OwnershipNote({ contract }: { contract: Contract }) {
  return (
    <p className="hint">
      {formatCount(contract.treesCount)} زيتونة تعلّمت «مباعة» نهار ما تكتب العقد، ومن ساعتها تتحسب في عدّاد
      الصفحة الرئيسية «زيتونات تمّ التعاقد عليها».
      {contract.ownedAt
        ? ` والملكية تسجّلت يوم ${formatDate(contract.ownedAt)}، وفضاء «زيتونتي» مفتوح للحريف.`
        : " الملكية حاجة أخرى: تتسجّل كي تكمل الشروط القانونية، وهي اللي تفتح «زيتونتي» للحريف."}
    </p>
  );
}
