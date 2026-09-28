// الأمان وكلمة السرّ — the client's own keys: change the password, change the number, put other devices out.
//
// WHY A PAGE OF ITS OWN. The account screen is the list of what a client HOLDS; what protects it is a different
// conversation, opened from one link beside «اخرج من الحساب». The owner's spec (2026-09-28) names exactly three
// things that may happen here, and the third — an SMS to the NEW number before it replaces the old — is the
// «sensitive action» check the spec asks for: nobody keeps a number they cannot read a code from.
//
// THE DOOR IS THE SAME DOOR. No session → back to /zitounti, whose sign-in form is the only way in; there is no
// second copy of it here to drift. A session whose password was never chosen goes back too: /zitounti insists on
// «أنشئ كلمة سرّ» first, and a change-password form with no current password to check is a form that can only
// fail.
//
// THREE FORMS, THREE ACTIONS, THREE INPUT NAME SETS (security-forms.tsx). Every limit a form checks — the
// minimum password length, the attempts allowed, the code's lifetime — is a setting under auth.* and is read
// through the service-role RPCs in security-actions.ts; nothing here decides a number.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SectionHeader } from "@/components/ui";
import { currentClient, passwordPolicy } from "@/lib/client-auth";
import { getPublicConfig, settingText } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

import { ChangePasswordForm, ChangePhoneForm, SignOutOthersForm } from "./security-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  const space = settingText(config, "zitounti.title", "فضاء «زيتونتي»");
  const label = settingText(config, "zitounti.security_label", "الأمان وكلمة السرّ");
  return { title: `${label} — ${space}` };
}

/**
 * The buyer's own row, read by the session's person id with the service role — public.persons is narrowed to
 * staff, and the narrowing that matters here is the id match. `password_set_at` arrives with 0108; until it is
 * applied the column is absent and the read tolerates that rather than blanking the page.
 */
async function readOwnRow(personId: string): Promise<{ phone: string | null; passwordSet: boolean | null }> {
  const admin = createAdminClient();
  const { data } = await admin.from("persons").select("*").eq("id", personId).maybeSingle();
  if (!data) return { phone: null, passwordSet: null };

  const row = data as Record<string, unknown>;
  const stamp = row.password_set_at;
  return {
    phone: typeof row.phone_e164 === "string" ? row.phone_e164 : null,
    passwordSet: stamp === undefined ? null : stamp !== null,
  };
}

/**
 * The minimum length the owner set (auth.client_password_min_length), read once for the form's hint — and
 * NO number of this file's own when it cannot be read. A policy that fails to read is a sentence on the form
 * and a disabled form, the way the door's action refuses: a minimum nobody set is not a rule to print.
 */
async function readPolicy(): Promise<{ minLength: number; disabledReason: string | null }> {
  const policy = await passwordPolicy();
  if (policy.ok) return { minLength: policy.minLength, disabledReason: null };
  return {
    minLength: 0,
    disabledReason:
      policy.reason === "not_applied"
        ? "خدمة الأمان مازالت ما تفعّلتش. لازم تتطبّق supabase/migrations/0108 قبل."
        : "تعذّر قراءة شروط كلمة السرّ توّا. حاول مرّة أخرى، وإذا تعاود المشكل كلّم الفريق.",
  };
}

export default async function ZitountiSecurityPage() {
  const client = await currentClient();
  if (!client) redirect("/zitounti");

  const [config, own, policy] = await Promise.all([getPublicConfig(), readOwnRow(client.personId), readPolicy()]);

  // A buyer who has not chosen a password yet is sent to the account, where the set-password gate lives.
  // `null` means the column is not there yet (0108 pending), and the page then opens as it did before.
  if (own.passwordSet === false) redirect("/zitounti");

  const title = settingText(config, "zitounti.security_label", "الأمان وكلمة السرّ");
  const backLabel = settingText(config, "zitounti.back_label", "رجوع لحسابي");

  return (
    /* `data-phone-screen` takes the site header off below md, the way the account screen and its sections do:
       this page opens with its own title and the way back. */
    <div
      data-phone-screen=""
      className="mx-auto min-h-dvh w-full max-w-md bg-surface px-4 pb-section pt-cozy font-sans"
    >
      <Link
        href="/zitounti"
        className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2">
          <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {backLabel}
      </Link>

      <SectionHeader title={title} level={1} className="mt-cozy" />

      <div className="mt-roomy space-y-8">
        <section className="card p-card">
          <SectionHeader
            title={settingText(config, "zitounti.security_password_title", "بدّل كلمة السرّ")}
            level={2}
          />
          <p className="mt-2 text-caption leading-7 text-muted">
            {settingText(
              config,
              "zitounti.security_password_note",
              "اكتب كلمة السرّ الحالية، وبعد الجديدة مرّتين. الدخول القادم يكون بالجديدة.",
            )}
          </p>
          <div className="mt-5">
            <ChangePasswordForm minLength={policy.minLength} disabledReason={policy.disabledReason} />
          </div>
        </section>

        <section className="card p-card">
          <SectionHeader title={settingText(config, "zitounti.security_phone_title", "بدّل نمرة التلفون")} level={2} />
          <p className="mt-2 text-caption leading-7 text-muted">
            {settingText(
              config,
              "zitounti.security_phone_note",
              "نبعثو رمز بالSMS للنمرة الجديدة. كي تأكّدو، تولّي هي النمرة اللي تدخل بيها.",
            )}
          </p>
          <div className="mt-5">
            <ChangePhoneForm currentPhone={own.phone} />
          </div>
        </section>

        <section className="card p-card">
          <SectionHeader title={settingText(config, "zitounti.security_devices_title", "الأجهزة الأخرى")} level={2} />
          <p className="mt-2 text-caption leading-7 text-muted">
            {settingText(
              config,
              "zitounti.security_devices_note",
              "إذا دخلت من تلفون ولا حاسوب موش متاعك، اخرج منهم الكل من هوني. الجهاز هذا يبقى داخل.",
            )}
          </p>
          <div className="mt-5">
            <SignOutOthersForm
              label={settingText(config, "zitounti.sign_out_others_label", "اخرج من الأجهزة الأخرى")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
