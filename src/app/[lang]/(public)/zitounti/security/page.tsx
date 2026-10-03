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
//
// AND NO WORD EITHER: the headings are the owner's zitounti.* texts and the forms' words are ui.security.*,
// handed to them by <Texts> below — all in the page's language.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "@/components/site/link";
import { Texts } from "@/components/site/texts";
import { SectionHeader } from "@/components/ui";
import { currentClient, passwordPolicy } from "@/lib/client-auth";
import { getPublicConfig, t } from "@/lib/config";
import { localePath } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { ChangePasswordForm, ChangePhoneForm, SignOutOthersForm } from "./security-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return { title: `${t(config, "zitounti.security_label")} — ${t(config, "zitounti.title")}` };
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
 * and a disabled form, the way the door's action refuses: a minimum nobody set is not a rule to print. The
 * sentence comes back as the key of the owner's text — the same two the actions print for the same failure.
 */
async function readPolicy(): Promise<{ minLength: number; disabledReasonKey: string | null }> {
  const policy = await passwordPolicy();
  if (policy.ok) return { minLength: policy.minLength, disabledReasonKey: null };
  return {
    minLength: 0,
    disabledReasonKey:
      policy.reason === "not_applied" ? "ui.security.error_not_applied" : "ui.security.error_policy_unreadable",
  };
}

export default async function ZitountiSecurityPage() {
  const locale = await currentLocale();
  const client = await currentClient();
  if (!client) redirect(localePath(locale, "/zitounti"));

  const [config, own, policy] = await Promise.all([getPublicConfig(), readOwnRow(client.personId), readPolicy()]);

  // A buyer who has not chosen a password yet is sent to the account, where the set-password gate lives.
  // `null` means the column is not there yet (0108 pending), and the page then opens as it did before.
  if (own.passwordSet === false) redirect(localePath(locale, "/zitounti"));

  const title = t(config, "zitounti.security_label");
  const backLabel = t(config, "zitounti.back_label");

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
        {/* «Back» points the way the page reads from: right in Arabic, left in the four others. */}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current stroke-2 ltr:-scale-x-100">
          <path d="M9.5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {backLabel}
      </Link>

      <SectionHeader title={title} level={1} className="mt-cozy" />

      <Texts prefixes={["ui.security."]}>
        <div className="mt-roomy space-y-8">
          <section className="card p-card">
            <SectionHeader title={t(config, "zitounti.security_password_title")} level={2} />
            <p className="mt-2 text-caption leading-7 text-muted">{t(config, "zitounti.security_password_note")}</p>
            <div className="mt-5">
              <ChangePasswordForm
                minLength={policy.minLength}
                disabledReason={policy.disabledReasonKey ? t(config, policy.disabledReasonKey) : null}
              />
            </div>
          </section>

          <section className="card p-card">
            <SectionHeader title={t(config, "zitounti.security_phone_title")} level={2} />
            <p className="mt-2 text-caption leading-7 text-muted">{t(config, "zitounti.security_phone_note")}</p>
            <div className="mt-5">
              <ChangePhoneForm currentPhone={own.phone} />
            </div>
          </section>

          <section className="card p-card">
            <SectionHeader title={t(config, "zitounti.security_devices_title")} level={2} />
            <p className="mt-2 text-caption leading-7 text-muted">{t(config, "zitounti.security_devices_note")}</p>
            <div className="mt-5">
              <SignOutOthersForm label={t(config, "zitounti.sign_out_others_label")} />
            </div>
          </section>
        </div>
      </Texts>
    </div>
  );
}
