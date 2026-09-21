"use client";

// The things a human may decide about a contract that already exists: that it was signed, that its schedule
// should now be written, that the legal conditions completed, and that it is over.
//
// THE PLATFORM SIGNS NOTHING. v2 §34 asks a contract for a «Signature Date» and a «Legal document reference»
// — a DATE and a TEXT — and neither document says who signs, whether the platform captures a signature, or
// what its role in signing is. v3 §45 gives the commercial «Generate Contract Request»: a request, not an
// issuance. So «إمضاء» here is a human recording what happened on paper, the database never infers it from a
// click, and there is no e-signature anywhere in this module.
//
// OWNERSHIP IS A THIRD MOMENT. v2 §38 puts it «بعد اكتمال الشروط القانونية», which is neither the signature
// nor the last instalment; the spec separates three moments and public.tree_state can express only one
// (0054:217 records that a fourth state was considered and left out). So ownership is a date on the contract,
// it is what opens «زيتونتي», and the tree stays `sold` from the day the contract was written.
//
// THERE IS NO «MARK COMPLETED» BUTTON. app.contract_settle_state flips a contract to 'completed' when its
// last millime arrives, so being paid off is something that HAPPENS, not something somebody declares. A
// button for it would let a contract be closed with money still owed.
//
// ENDING A CONTRACT IS ALWAYS A HUMAN ACT. «لا يوجد فسخ آلي» (v2 §36), «ما نخليوش النظام يلغي… وحده» (v3
// §31). This records a decision Legal already took under the contract and the law; nothing in the software
// reaches it on a timer, and §31's stages only put a file in front of a person.

import { useState, type FormEvent } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { formatCount } from "@/lib/format";

import { cancelContract, generateSchedule, setOwned, signContract } from "./actions";
import { formatAmount, isOpen, type Contract } from "./contract-model";
import { useAct } from "./use-act";

type Act = "sign" | "schedule" | "owned" | "cancel";

export function ContractActs({
  contract,
  reasonMin,
  moduleOpen,
  installmentsOpen,
  canSign,
  canCancel,
}: {
  contract: Contract;
  reasonMin: number;
  /** The `contracts` flag is not «معطّل» — app.assert_contracts_open() gates every act below. */
  moduleOpen: boolean;
  /** The `installments` flag: generating the schedule needs it, and signing writes it only when it is on. */
  installmentsOpen: boolean;
  /** app.can_contract_trees(): legal · finance · admin · super_admin. */
  canSign: boolean;
  /** can_contract_trees ∩ can_manage_trees ∩ can_see_person → finance · admin · super_admin. */
  canCancel: boolean;
}) {
  const [open, setOpen] = useState<Act | null>(null);
  const close = () => setOpen(null);

  // A closed contract takes no more decisions, and with the module off every act below raises module_closed —
  // so neither draws a control. The page already says which switch is off and where it lives; a row of dead
  // buttons beside that sentence would be worse than none.
  if (!isOpen(contract) || !moduleOpen) return null;

  const acts: { key: Act; label: string; show: boolean; tone: string }[] = [
    { key: "sign", label: "سجّل الإمضاء", show: canSign && contract.status === "draft", tone: "btn-primary" },
    {
      key: "schedule",
      label: "ولّد جدول الأقساط",
      show: canSign && contract.schedulePending && installmentsOpen,
      tone: "btn-primary",
    },
    { key: "owned", label: "سجّل «ولّى مالك»", show: canSign && !contract.ownedAt, tone: "btn-secondary" },
    { key: "cancel", label: "افسخ العقد", show: canCancel && !contract.ownedAt, tone: "btn-ghost" },
  ];
  const drawn = acts.filter((act) => act.show);
  if (drawn.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-tight">
        {drawn.map((act) => (
          <button
            key={act.key}
            type="button"
            onClick={() => setOpen((current) => (current === act.key ? null : act.key))}
            className={`btn ${act.tone} btn-sm`}
          >
            {act.label}
          </button>
        ))}
      </div>

      {open === "sign" ? <SignatureForm contract={contract} reasonMin={reasonMin} installmentsOpen={installmentsOpen} onDone={close} /> : null}
      {open === "schedule" ? <ScheduleForm contract={contract} reasonMin={reasonMin} onDone={close} /> : null}
      {open === "owned" ? <OwnedForm contract={contract} reasonMin={reasonMin} onDone={close} /> : null}
      {open === "cancel" ? <CancelForm contract={contract} reasonMin={reasonMin} onDone={close} /> : null}
    </div>
  );
}

/** v2 §34's «Signature Date» and «Legal document reference», both typed by a human. */
function SignatureForm({
  contract,
  reasonMin,
  installmentsOpen,
  onDone,
}: {
  contract: Contract;
  reasonMin: number;
  installmentsOpen: boolean;
  onDone: () => void;
}) {
  const { error, pending, run } = useAct(onDone);
  const installments = contract.paymentMode === "installments";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      signContract({
        contractId: contract.id,
        signedOn: String(form.get("signed_on") ?? "") || null,
        legalDocumentRef: String(form.get("legal_ref") ?? ""),
        firstDueOn: String(form.get("first_due_on") ?? "") || null,
        reason: String(form.get("reason") ?? ""),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">سجّل إمضاء العقد</p>

      <div className="grid gap-tight sm:grid-cols-2">
        <label className="block">
          <span className="label-sm">تاريخ الإمضاء</span>
          <input type="date" name="signed_on" disabled={pending} dir="ltr" className="field field-sm" />
          <span className="hint mt-1 block">
            التاريخ اللي تمضات فيه الورقة. خلّيه فارغ باش ياخذ تاريخ اليوم.
          </span>
        </label>

        <label className="block">
          <span className="label-sm">مرجع الوثيقة القانونية</span>
          <input
            type="text"
            name="legal_ref"
            maxLength={120}
            defaultValue={contract.legalDocumentRef ?? ""}
            disabled={pending}
            placeholder="رقم العقد عند العدل ولا في السجل"
            className="field field-sm"
          />
          <span className="hint mt-1 block">وين تلقى الورقة. رقم العقد عندنا يتولّد وحدو وما يتبدّلش.</span>
        </label>

        {installments ? (
          <label className="block sm:col-span-2">
            <span className="label-sm">تاريخ أول قسط</span>
            <input type="date" name="first_due_on" disabled={pending} dir="ltr" className="field field-sm" />
            {/* Neither document says on what date the first instalment falls due, and every stage of §31
                counts from it, so the database ASKS instead of guessing: it raises first_due_date_required
                until the owner picks a rule in settings installments.first_due_rule. */}
            <span className="hint mt-1 block">
              كل تواريخ الجدول تتحسب من هنا، وعليها يتحسب التأخير. إذا ما فماش قاعدة محدّدة في الإعدادات،
              لازم تكتبو — النظام ما يخمّنوش.
            </span>
          </label>
        ) : null}
      </div>

      {installments && !installmentsOpen ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          موديول «الأقساط» معطّل، فالعقد يتمضى والجدول ما يتولّدش توّا. كي تشغّلو، ولّد الجدول من نفس الصفحة —
          الإمضاء ما يتمسّش.
        </p>
      ) : null}

      <ReasonField minLength={reasonMin} id={`sign-reason-${contract.id}`} label="سبب التسجيل" />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التسجيل…" : "سجّل الإمضاء"}
      </button>
    </form>
  );
}

/** §29 as its own act, for a contract signed while `installments` was still off. Idempotent in the database. */
function ScheduleForm({ contract, reasonMin, onDone }: { contract: Contract; reasonMin: number; onDone: () => void }) {
  const { error, pending, run } = useAct(onDone);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => generateSchedule({ contractId: contract.id, reason: String(form.get("reason") ?? "") }));
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">ولّد جدول الأقساط</p>
      <p className="text-sm leading-6 text-muted">
        الجدول يتولّد من اللي تجمّد في العقد — القسط{" "}
        {contract.monthlyMillimes !== null ? (
          <span className="tabular-nums">{formatAmount(contract.monthlyMillimes)}</span>
        ) : null}{" "}
        وعدد الأقساط {contract.planInstallmentsCount ?? "—"} — وما يتحسبش من جديد. يتولّد مرة وحدة برك.
      </p>

      <ReasonField minLength={reasonMin} id={`schedule-reason-${contract.id}`} label="سبب التوليد" />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التوليد…" : "ولّد الجدول"}
      </button>
    </form>
  );
}

/** v2 §38 · «بعد اكتمال الشروط القانونية: Owned ويتفتح للحريف: زيتونتي». */
function OwnedForm({ contract, reasonMin, onDone }: { contract: Contract; reasonMin: number; onDone: () => void }) {
  const { error, pending, run } = useAct(onDone);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      setOwned({
        contractId: contract.id,
        ownedOn: String(form.get("owned_on") ?? "") || null,
        reason: String(form.get("reason") ?? ""),
      }),
    );
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">سجّل أنّ الحريف ولّى مالك</p>
      <p className="text-sm leading-6 text-muted">
        هذا موش الإمضاء وموش آخر قسط: هذا نهار كمّلت الشروط القانونية. كي يتسجّل، يتفتح للحريف فضاء «زيتونتي»
        على {formatCount(contract.treesCount)} زيتونة.
      </p>

      <label className="block">
        <span className="label-sm">تاريخ التملّك</span>
        <input type="date" name="owned_on" disabled={pending} dir="ltr" className="field field-sm" />
        <span className="hint mt-1 block">خلّيه فارغ باش ياخذ تاريخ اليوم.</span>
      </label>

      <ReasonField minLength={reasonMin} id={`owned-reason-${contract.id}`} label="سبب التسجيل" />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ التسجيل…" : "سجّل التملّك"}
      </button>
    </form>
  );
}

/** §31 · Recording a decision already taken outside the software. The system never takes it. */
function CancelForm({ contract, reasonMin, onDone }: { contract: Contract; reasonMin: number; onDone: () => void }) {
  const { error, pending, run } = useAct(onDone);
  const [release, setRelease] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => cancelContract({ contractId: contract.id, release, reason: String(form.get("reason") ?? "") }));
  }

  return (
    <form onSubmit={submit} className="panel p-cozy space-y-3">
      <p className="section-title">افسخ العقد</p>
      <p className="text-sm leading-6 text-muted">
        النظام ما يفسخش عقد وحدو. القرار يتاخذ برّا، حسب العقد والقانون، وهنا يتسجّل برك — مع سببو وشكون
        سجّلو.
      </p>

      {contract.money.totalPaidMillimes > 0 ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          هذا الحريف خلّص <span className="tabular-nums">{formatAmount(contract.money.totalPaidMillimes)}</span>.
          الوصولات تبقى في السجلّ كيما هي؛ شنوّة يترجّعلو وشنوّة لا يتقرّر برّا النظام.
        </p>
      ) : null}

      <label className="choice">
        <input
          type="checkbox"
          checked={release}
          onChange={(event) => setRelease(event.target.checked)}
          disabled={pending}
        />
        <span>
          رجّع الزيتونات متاحة
          <span className="hint block">
            كي تحيّد العلامة، {formatCount(contract.treesCount)} زيتونة يبقاو «مباعة» على هذا الحريف وأنت
            تقرّر فيهم من بعد. وكي ترجّعهم، عدّاد الصفحة الرئيسية ينقص بيهم.
          </span>
        </span>
      </label>

      <ReasonField
        minLength={reasonMin}
        id={`cancel-reason-${contract.id}`}
        label="سبب الفسخ"
        hint="يتسجّل في سجل العمليات وفي العقد روحو، وما يتبدّلش."
      />

      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "جارٍ الفسخ…" : "افسخ العقد"}
      </button>
    </form>
  );
}
