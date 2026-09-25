// فضاء «زيتونتي» — the client's own screen, in the shape the owner drew for it.
//
// 2026-09-21: rebuilt from the AgriZed app mock-up «حسابي / متابعتي» (owner: «focus on the mobile design for
// now»). What changed is the shape — a phone screen with a name, one card carrying what you hold, and the
// sections as a tapped list — and what did not change is the single fact this page has always been built on:
//
// IT HAS NO SIGN-IN, AND THAT IS THE DESIGN. No buyer can sign in today — no user carries the role 'client',
// persons.profile_id is written nowhere, and src/lib/auth.ts strips 'client' from every session. How a buyer
// signs in (a code by SMS? an e-mail? a link?) is a decision the owner has not made; it touches every client
// record, and inventing it inside a design pass would give AgriZed a second front door nobody reviewed. So
// there is no form here, no field, and nothing that asks a visitor for anything about themselves. Until that
// decision, the team reads the file (Back Office ← ملفات الحرفاء) and tells the client what is in it — which is
// exactly what settings zitounti.closed_note says on the card.
//
// WHERE THE FIGURES WILL COME FROM. The screen is handed a holder and their holdings and renders them; it
// reads nothing and computes no price. public.staff_zitounti_file() already answers exactly that payload for a
// person and is gated by app.can_see_person, so the day the owner decides how a buyer signs in, this page
// stops passing null and passes that file's `person` and `totals` instead. Nothing else on the screen moves.
//
// THE SAMPLE, AND WHY IT IS NOT A LIE. A design cannot be judged against five empty boxes, so in internal
// preview — staff only, flag `internal`, under the preview banner — the card carries the mock-up's own
// figures, with «مثال» on it. A visitor never reaches that state: the module is disabled, and even open to the
// public the card would show the closed note, not a number. Every word comes from the `zitounti` settings
// group; the order of the sections is v3 §39.

import type { Metadata } from "next";

import { AccountScreen, type AccountHoldings, type AccountIcon, type AccountRow } from "@/components/site/mobile/account-screen";
import { PreviewBanner } from "@/components/site/module-gate";
import { currentClient } from "@/lib/client-auth";

import { signOut } from "./actions";
import { ClientLoginForm } from "./login-form";
import { offersTitle } from "@/components/site/offers";
import { flagState, getPublicConfig, settingText } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "فضاء «زيتونتي»",
  description: "تتبّع زيتوناتك: أرقامها، شنوّة تعمل فيها، وشنوّة خرجت من صابة العام.",
};

/**
 * The ten sections v3 §39 names, in its order. The ORDER, the drawing and the module each one belongs to are
 * structure and live here; every word on the screen is a setting, so the owner writes them.
 *
 * `flag` is the module that WRITES that section's record. A section whose module is not public yet is marked
 * «يُبنى في دفعة قادمة» — the same wording the modules screen uses — rather than being hidden, because a
 * visitor who was promised a space deserves to see what it will hold.
 *
 * None of them carries an `href`: a section of the file is a part of this screen, not a route of its own, and
 * a row that opened nothing would be worse than a row that stays quiet.
 */
const SECTIONS: readonly { setting: string; flag: string | null; icon: AccountIcon }[] = [
  { setting: "zitounti.section_trees", flag: "zitounti", icon: "trees" },
  { setting: "zitounti.section_requests", flag: "interest_form", icon: "requests" },
  { setting: "zitounti.section_reservations", flag: "reservations", icon: "reservations" },
  { setting: "zitounti.section_visits", flag: "visits", icon: "visits" },
  { setting: "zitounti.section_payments", flag: "installments", icon: "payments" },
  { setting: "zitounti.section_contracts", flag: "contracts", icon: "contracts" },
  { setting: "zitounti.section_operations", flag: "agri_backoffice", icon: "operations" },
  { setting: "zitounti.section_subscription", flag: "subscriptions", icon: "subscription" },
  { setting: "zitounti.section_harvest", flag: "harvest", icon: "harvest" },
  { setting: "zitounti.section_documents", flag: null, icon: "documents" },
];

/**
 * The mock-up's own card, shown to staff previewing the design and to nobody else.
 *
 * Its figures are the drawing's, not the database's — 25 trees for 14,400 د.ت in طريق تنيور is not a client
 * AgriZed has. That is what makes it a sample and why the card wears «مثال» while it is on screen. It is
 * deliberately the only invented content in this file: the moment a client file can be read, this constant
 * stops being reached and can be deleted with the line that uses it.
 */
const MOCKUP_SAMPLE = {
  holder: { name: "لسعد", since: "2024-09-01" },
  holdings: { trees: 25, valueMillimes: 14_400_000, offerName: "مشروع طريق تنيور — صفاقس" },
} as const;

export default async function ZitountiPage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "zitounti");

  const title = settingText(config, "zitounti.title", "فضاء «زيتونتي»");

  /*
   * THE DOOR IS NOT THE ROOM, and that is the change here (owner, 2026-09-25: the account icon landed on
   * «قريباً»).
   *
   * This page used to answer `ComingSoon` the moment the `zitounti` flag was off — which meant the account
   * entry in the header and the phone's tab bar led to a dead end, because that flag is off. But a sign-in
   * is not a feature: it is how somebody proves who they are, and it has no business being switched off
   * with the module whose contents it guards. The flag still decides what a signed-in buyer SEES; it no
   * longer decides whether they may sign in at all.
   *
   * So: no session → the door. Session, module closed → their own name and the honest note that the space
   * is not open yet. Session, module open → their file.
   */
  const client = await currentClient();

  if (!client) {
    const help = settingText(config, "site.contact_phone");
    return (
      <div className="mx-auto w-full max-w-md px-4 py-section">
        <h1 className="font-display text-2xl font-bold text-forest-700">{title}</h1>
        <p className="mt-2 text-[0.95rem] leading-7 text-muted">
          {settingText(
            config,
            "zitounti.login_note",
            "ادخل بنمرة التلفون اللي سجّلت بيها، ونبعثولك رمز بالSMS.",
          )}
        </p>
        <div className="card mt-6 p-card">
          <ClientLoginForm helpPhone={help || null} />
        </div>
      </div>
    );
  }

  const later = settingText(config, "zitounti.section_later", "يُبنى في دفعة قادمة");
  const treesTitle = settingText(config, "zitounti.section_trees", "زيتوناتي");

  const rows: AccountRow[] = SECTIONS.flatMap((section) => {
    const label = settingText(config, section.setting);
    if (!label) return [];
    const ready = section.flag !== null && flagState(config, section.flag) === "public";
    return [{ key: section.setting, label, icon: section.icon, href: null, note: ready ? null : later }];
  });

  // The one door that is real for a reader with no file of their own, and only while the offers are published.
  const offers =
    flagState(config, "projects") === "public" ? { label: offersTitle(config), href: "/projects" } : null;

  const sample: AccountHoldings | null =
    access === "preview"
      ? { ...MOCKUP_SAMPLE.holdings, action: offers ? { ...offers, label: "عرض التفاصيل" } : null }
      : null;

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <AccountScreen
        title={settingText(config, "zitounti.screen_title", "حسابي")}
        // The signed-in buyer's own name, from public.persons — never the mock-up's «لسعد». The sample
        // holder survives only for the staff preview, which is what it was built for.
        holder={
          client.fullName
            ? { name: client.fullName, since: null }
            : sample
              ? { ...MOCKUP_SAMPLE.holder }
              : null
        }
        holdings={sample}
        holdingsTitle={treesTitle}
        treesLabel={settingText(config, "zitounti.tree_unit", "زيتونة")}
        rows={rows}
        emptyNote={settingText(
          config,
          "zitounti.closed_note",
          "الفضاء هذا مازال ما تفتحش للحرفاء. فريق AgriZed يقرالك ملفّك في التلفون ويعطيك كل رقم فيه.",
        )}
        emptyAction={offers}
        sampleLabel={sample ? "مثال" : null}
      />

      {settingText(config, "zitounti.share_note") ? (
        <p className="mx-auto max-w-md px-4 pt-2 text-caption leading-7 text-muted">
          {settingText(config, "zitounti.share_note")}
        </p>
      ) : null}

      {/* اخرج. A door that only opens is not a door — and on a shared phone it is a privacy fault, which is
          why this is not «a nice to have later»: the next person to pick up the handset would be looking at
          somebody else's trees, contracts and instalments. A plain form so it works without JavaScript and
          needs no client component of its own. */}
      <form action={signOut} className="mx-auto max-w-md px-4 pb-section pt-6">
        <button type="submit" className="btn btn-secondary w-full border-line">
          {settingText(config, "zitounti.sign_out_label", "اخرج من الحساب")}
        </button>
      </form>
    </>
  );
}
