// «وين وصل مطلبي؟» — the public follow-up, for somebody who sent a demand and has not signed in.
//
// WHAT WAS MISSING. The intake ends by handing a visitor a request number (AGZ-2026-000045) and a text
// message, and until now that number opened nothing anywhere on the site: the only way to learn what had
// happened to a demand was to ring the office, and the only screen that could answer was the Back Office.
// A number a product gives you and then cannot read back is not a reference, it is a receipt for a promise.
//
// IT IS DELIBERATELY NOT THE SIGN-IN. فضاء «زيتونتي» (/zitounti) is the buyer's own room — a session, their
// name, their trees, their money — and it is the better answer for anybody who has one. This page is the
// narrow door for everybody else: no account, no session, nothing remembered, and nothing shown but where one
// demand stands. A person who submitted a form yesterday should not have to be a client to find out whether
// anybody has called them. The line at the foot of this page sends whoever can use the room to the room.
//
// IT IS NOT GATED ON A MODULE, AND THAT IS A DECISION. `interest_form` decides whether a NEW demand may be
// sent; it has nothing to say about the demands already in the table. Switching the intake off the day the
// season ends must not turn every reference number AgriZed handed out into a dead end — the door is not the
// room, the same argument /zitounti settled on 2026-09-25 for the account icon.
//
// EVERY WORD IS A SETTING, in the visitor's language (0109), so the owner writes this page in الإعدادات and
// nothing here has to change: the page's own texts (track.*) travel to the form as props, and the form's and the
// result card's microcopy, the failure sentences included (ui.track.*), are handed to them by <Texts> below.

import type { Metadata } from "next";

import Link from "@/components/site/link";
import { Texts } from "@/components/site/texts";
import { getPublicConfig, settingText, t } from "@/lib/config";

import { TrackForm } from "./track-form";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: t(config, "track.meta_title"),
    description: t(config, "track.meta_description"),
  };
}

export default async function TrackPage() {
  const config = await getPublicConfig();

  const title = t(config, "track.title");
  const intro = t(config, "track.intro");
  // The room, for whoever has one. Its own title comes from the setting that names it everywhere else on the
  // site — the header's account icon and the phone's tab bar read the same key — so renaming it renames it here.
  const accountLabel = t(config, "zitounti.screen_title");
  const helpPhone = settingText(config, "site.contact_phone");

  return (
    // max-w-md and the phone's own measure: this is one short form and one vertical path, and stretching
    // either across a desk would put thirteen labels on thirteen very wide lines. `pb-section` clears the
    // phone's tab bar the way every other page in this folder does.
    <div className="mx-auto w-full max-w-md px-4 pb-section pt-section">
      <h1 className="font-display text-2xl font-bold text-forest-700">{title}</h1>
      {intro ? <p className="mt-2 text-[0.95rem] leading-7 text-muted">{intro}</p> : null}

      <div className="mt-6">
        <Texts prefixes={["ui.track."]}>
          <TrackForm
            requestLabel={t(config, "track.request_label")}
            requestHint={t(config, "track.request_hint")}
            phoneLabel={t(config, "track.phone_label")}
            phoneHint={t(config, "track.phone_hint")}
            submitLabel={t(config, "track.submit_label")}
            resultNote={t(config, "track.result_note") || null}
            helpPhone={helpPhone || null}
          />
        </Texts>
      </div>

      <p className="mt-6 text-center text-caption leading-7 text-muted">
        {t(config, "track.account_note")}{" "}
        <Link href="/zitounti" className="font-semibold text-forest underline-offset-4 hover:underline">
          {accountLabel}
        </Link>
      </p>
    </div>
  );
}
