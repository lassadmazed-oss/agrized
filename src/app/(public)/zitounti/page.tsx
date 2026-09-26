// فضاء «زيتونتي» — the client's own screen, in the shape the owner drew for it, with the client's own figures.
//
// 2026-09-21: rebuilt from the AgriZed app mock-up «حسابي / متابعتي» — a phone screen with a name, one card
// carrying what you hold, and the sections as a tapped list.
// 2026-09-25: the door was built (0096). A buyer signs in with a code by SMS, and persons.profile_id points at
//             their auth user.
// 2026-09-26: THE ROOM BEHIND THE DOOR. Until today this screen was still the design and not the file: every
//             row carried `href: null` and the note «يُبنى في دفعة قادمة», and the card showed either nothing or
//             a mock-up's 25 trees. A buyer could sign in and then read no figure of their own anywhere, which
//             is what the owner has been looking at and calling unbuilt.
//
//             The rows were never missing. public.staff_zitounti_file has answered the whole file since 0068
//             and its last three sections since 0095 — but it is gated on app.is_staff() AND
//             app.can_see_person(), so the one person who could not call it was the buyer whose file it is.
//             public.my_zitounti_file() is the same payload from the same app.zitounti_* readers, resolving the
//             person from auth.uid() and taking NO argument, so there is no id for a caller to tamper with.
//             src/lib/zitounti.ts reads it; this page hands it to the screen the owner drew.
//
// WHAT THIS PAGE DECIDES, AND WHAT IT DOES NOT. It decides nothing about the data: every count, every amount
// and every status arrives computed, and src/lib/format.ts renders them. What it decides is which rows may be
// OPENED — a section with rows gets a route and its count, a section whose module is off keeps the owner's
// «coming soon» note, a section whose table does not exist yet says so in different words — because «ما عندك
// حتى حجز» and «الوحدة مازالت ما تفتحتش» are different statements about a client's money and must not share a
// sentence.
//
// THE DOOR IS NOT THE ROOM. No session → the sign-in form, whatever the `zitounti` flag says: a sign-in is how
// somebody proves who they are and has no business being switched off with the module whose contents it guards
// (the account icon in the header and the phone's tab bar both lead here). Session but the module closed → the
// database refuses with module_closed and the card says so in the owner's own words. Session and the module
// open → their file.

import type { Metadata } from "next";

import { AccountScreen, type AccountHoldings, type AccountIcon, type AccountRow } from "@/components/site/mobile/account-screen";
import { PreviewBanner } from "@/components/site/module-gate";
import { offersTitle } from "@/components/site/offers";
import { currentClient } from "@/lib/client-auth";
import { flagState, getPublicConfig, settingText } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import {
  readClientFile,
  ZITOUNTI_FAILURE_MESSAGES,
  ZITOUNTI_SECTION_SETTING,
  type ZitountiFile,
  type ZitountiSectionKey,
} from "@/lib/zitounti";

import { signOut } from "./actions";
import { ClientLoginPanel } from "./sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "فضاء «زيتونتي»",
  description: "تتبّع زيتوناتك: أرقامها، شنوّة تعمل فيها، وشنوّة خرجت من صابة العام.",
};

/**
 * The ten rows v3 §39 names, in its order. The ORDER, the drawing and the payload key each one reads are
 * structure and live here; every word on the screen is a setting, so the owner writes them.
 *
 * `key` is the section of the payload the row reports on, and it is the URL segment behind it — /zitounti/trees,
 * /zitounti/payments. The key is code because a route branches on it; the label beside it is data, read through
 * ZITOUNTI_SECTION_SETTING so this list and the section's own heading cannot name the row differently.
 *
 * `also` is the second section a row speaks for. The owner's label for the contracts row is «العقود والأقساط»,
 * one line covering two sections of the payload, so the row opens when either holds rows and its count is the
 * pair's. /zitounti/installments still reaches the schedule on its own.
 *
 * `flag` is gone from this table on purpose. It used to decide whether a row was «ready», which meant the
 * screen was guessing from a switch what the database already states per section: `status` is 'closed' exactly
 * when the module that writes that record is off, and it arrives with the rows. One answer, from the side that
 * knows.
 */
const SECTIONS: readonly { key: ZitountiSectionKey; also?: ZitountiSectionKey; icon: AccountIcon }[] = [
  { key: "trees", icon: "trees" },
  { key: "requests", icon: "requests" },
  { key: "reservations", icon: "reservations" },
  { key: "visits", icon: "visits" },
  { key: "payments", icon: "payments" },
  { key: "contracts", also: "installments", icon: "contracts" },
  { key: "operations", icon: "operations" },
  { key: "subscription", icon: "subscription" },
  { key: "harvest", icon: "harvest" },
  { key: "documents", icon: "documents" },
];

/**
 * The mock-up's own card, shown to staff previewing the DESIGN and to nobody else — and now only when there is
 * no real file to draw in its place.
 *
 * Its figures are the drawing's, not the database's: 25 trees for 14,400 د.ت in طريق تنيور is not a client
 * AgriZed has. That is what makes it a sample and why the card wears «مثال» while it is on screen. A signed-in
 * buyer can never reach it — if their file read succeeds they see their own figures, and if it fails they see
 * the reason, because a mock-up's money on a real client's screen is the one thing worse than an empty card.
 */
const MOCKUP_SAMPLE = {
  holder: { name: "لسعد", since: "2024-09-01" },
  holdings: { trees: 25, valueMillimes: 14_400_000, offerName: "مشروع طريق تنيور — صفاقس" },
} as const;

/**
 * What the summary card says, from the file's own totals.
 *
 * `paid_millimes` and not the contracts' `money.paid_millimes`: the card is «what you have handed over», which
 * includes a عربون on a hold that never became a contract. Null means «we are not saying» — both money modules
 * are off — and the card then draws no amount rather than a zero, which would be a false statement about a
 * client's money. Nothing is added up here; both figures arrive summed.
 */
function holdingsFrom(file: ZitountiFile, action: AccountHoldings["action"]): AccountHoldings {
  const groups = file.trees.items;
  const offerName =
    groups.length === 1
      ? (groups[0].project_name ?? groups[0].project_code)
      : file.totals.offers > 1
        ? `${formatCount(file.totals.offers)} عروض`
        : null;

  return {
    trees: file.totals.trees,
    valueMillimes: file.totals.paid_millimes,
    offerName,
    action,
  };
}

export default async function ZitountiPage() {
  const config = await getPublicConfig();
  const access = await moduleAccess(config, "zitounti");
  const title = settingText(config, "zitounti.title", "فضاء «زيتونتي»");

  const client = await currentClient();
  if (!client) {
    return <ClientLoginPanel config={config} title={title} />;
  }

  /*
   * The file, read with the BUYER'S OWN session and not the admin client — the whole point is that the
   * database decides what they may see, and my_zitounti_file() answers auth.uid(). A failure is not a blank
   * screen: each reason has its own sentence and its own next step (src/lib/zitounti.ts), and the screen keeps
   * its shape around it so the reader still knows where they are.
   */
  const supabase = await createClient();
  const result = await readClientFile(supabase);
  const file = result.ok ? result.file : null;

  const later = settingText(config, "zitounti.section_later", "يُبنى في دفعة قادمة");
  // «مازال ما تركّبش» is a DIFFERENT answer from «يُبنى في دفعة قادمة»: the first is a record the database does
  // not hold yet, the second a module the owner has not opened. Read from the owner's own row when he writes
  // one; the fallback is a short sentence rather than nothing, because a row with no note reads as ready.
  const notBuilt = settingText(config, "zitounti.section_not_built", "مازال ما تركّبش");
  const emptyWord = settingText(config, "zitounti.section_empty", "ما فمّاش");
  const treesTitle = settingText(config, "zitounti.section_trees", "زيتوناتي");

  /*
   * A row on a screen with no file behind it. The card above already carries the reason, so the list says only
   * what it can back up: «قريباً» when the module really is closed — that is the owner's own word and it is
   * true — and nothing at all for any other failure, because a note there would be a guess about why. The rows
   * stay on the screen either way: a reader who was promised a space is owed the shape of it.
   */
  const noteWithNoFile = !result.ok && result.reason === "closed" ? later : null;

  const rows: AccountRow[] = SECTIONS.flatMap((section): AccountRow[] => {
    const label = settingText(config, ZITOUNTI_SECTION_SETTING[section.key]);
    if (!label) return [];

    const base = { key: section.key, label, icon: section.icon };

    if (!file) return [{ ...base, href: null, note: noteWithNoFile }];

    const primary = file[section.key];
    const extra = section.also ? file[section.also] : null;
    const count = primary.count + (extra?.count ?? 0);
    // The best of the pair: a row speaking for two sections is openable when either is, and reports «closed»
    // only while both are.
    const status = primary.status === "ok" || extra?.status === "ok" ? "ok" : primary.status;

    if (status === "ok") {
      return count > 0
        ? [{ ...base, href: `/zitounti/${section.key}`, note: formatCount(count) }]
        : [{ ...base, href: null, note: emptyWord }];
    }
    return [{ ...base, href: null, note: status === "not_built" ? notBuilt : later }];
  });

  // The one door that is real for a reader with no file of their own, and only while the offers are published.
  const offers =
    flagState(config, "projects") === "public" ? { label: offersTitle(config), href: "/projects" } : null;

  /*
   * The card. Three states, in the order they are decided:
   *   · a file with trees in it   → the client's own count and the money they have handed over;
   *   · no file (a refused read)  → the reason, in the buyer's language, with the next step in it;
   *   · a staff design preview    → the mock-up, wearing «مثال», which only a reader with no file can reach.
   */
  const treesAction =
    file && file.trees.count > 0 ? { label: "عرض التفاصيل", href: "/zitounti/trees" } : offers;

  const holdings: AccountHoldings | null =
    file && file.totals.trees > 0
      ? holdingsFrom(file, treesAction)
      : !file && access === "preview"
        ? { ...MOCKUP_SAMPLE.holdings, action: offers ? { ...offers, label: "عرض التفاصيل" } : null }
        : null;

  const sampleLabel = holdings !== null && file === null ? "مثال" : null;

  /*
   * What the card says when it carries no figures. A refused read says why — that sentence is the whole reason
   * the failure reasons are named — and a client whose file is simply empty gets the owner's own note.
   */
  const emptyNote = result.ok
    ? settingText(
        config,
        "zitounti.empty_client_note",
        "مازال ما عندكش زيتونات مسجّلة باسمك. كي تتسجّل، تلقاها هوني برموزها.",
      )
    : ZITOUNTI_FAILURE_MESSAGES[result.reason];

  return (
    <>
      {access === "preview" ? <PreviewBanner /> : null}

      <AccountScreen
        title={settingText(config, "zitounti.screen_title", "حسابي")}
        // The signed-in buyer's own name and the date their file was opened, from public.persons — never the
        // mock-up's «لسعد», which survives only for a staff preview with no file of its own.
        holder={
          file
            ? { name: file.person.full_name, since: file.person.created_at }
            : client.fullName
              ? { name: client.fullName, since: null }
              : access === "preview"
                ? { ...MOCKUP_SAMPLE.holder }
                : null
        }
        holdings={holdings}
        holdingsTitle={treesTitle}
        treesLabel={settingText(config, "zitounti.tree_unit", "زيتونة")}
        rows={rows}
        emptyNote={emptyNote}
        emptyAction={offers}
        sampleLabel={sampleLabel}
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
