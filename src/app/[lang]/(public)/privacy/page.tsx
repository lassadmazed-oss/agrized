// سياسة الخصوصية — the page Google Play will not accept an app without, and the first public legal page
// this site has had.
//
// WHY IT WAS BUILT (2026-10-12). Play requires a privacy policy URL before ANY release track, closed testing
// included, for any app that collects personal data — and the app collects a name, a phone number, a
// governorate and a goal. Without this page there is no listing, no testers, no release.
//
// NOT ONE SENTENCE OF IT IS IN THIS FILE. Every heading and every paragraph is a settings row seeded by
// 0140, for the same reason as the rest of the site and more sharply here: this is the document most likely
// to need correcting — the day a lawyer reads it, the day a new field is collected, the day the company's
// legal name is registered — and a policy hard-coded in a .tsx is one the owner cannot correct without a
// deploy. `legal.privacy_sections` is a list of {title, body}; he adds, removes and rewrites them in
// الإعدادات and this file does not change.
//
// THE CONTROLLER'S NAME FALLS BACK TO THE BRAND. `legal.entity_name` is seeded empty because nobody has told
// us the registered name yet, and «AgriZed» is true and verifiable in the meantime. The moment that row is
// filled the page says the legal entity instead, everywhere it appears.
//
// IT IS NOT GATED ON A MODULE AND IT IS NOT NOINDEXED. A privacy policy that can be switched off, or that a
// store's crawler cannot read, is not a privacy policy. It answers for every language the site has, because
// the store listing may be read in any of them.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicConfig, settingJson, settingText, t } from "@/lib/config";
import { isLocale } from "@/lib/i18n/locales";

type Section = { title?: string; body?: string };

export async function generateMetadata(props: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await props.params;
  const config = await getPublicConfig(isLocale(lang) ? lang : undefined);
  return {
    title: t(config, "legal.privacy_title"),
    description: settingText(config, "legal.privacy_intro") || undefined,
  };
}

export default async function PrivacyPage(props: PageProps<"/[lang]/privacy">) {
  const { lang } = await props.params;
  // The layout above already refuses an unknown language, but a page that reads params narrows them itself:
  // generateMetadata runs before the layout and would otherwise type-error on the same value.
  if (!isLocale(lang)) notFound();
  const config = await getPublicConfig(lang);

  const title = t(config, "legal.privacy_title");
  const intro = settingText(config, "legal.privacy_intro");
  const updated = settingText(config, "legal.privacy_updated_at");
  const sections = settingJson<Section[]>(config, "legal.privacy_sections", []).filter(
    (section) => section && (section.title || section.body),
  );

  // The controller, and the address to write to. Both fall back rather than printing an empty line: a policy
  // with a blank where the contact belongs is worse than one that names the brand and the general address.
  const entity = settingText(config, "legal.entity_name") || "AgriZed";
  const email = settingText(config, "legal.privacy_email") || settingText(config, "site.contact_email");
  const address = settingText(config, "site.contact_address");
  const contactLine = settingText(config, "legal.privacy_contact");

  return (
    // `max-w-2xl`, wider than the forms and narrower than the home: this is prose, and prose read across a
    // desk needs a measure. `pb-section` clears the phone's tab bar as every page in this folder does.
    <div className="mx-auto w-full max-w-2xl px-4 pb-section pt-section">
      <h1 className="font-display text-3xl font-bold text-forest-700">{title}</h1>

      {updated ? (
        <p className="mt-1 text-caption text-muted">
          <span dir="ltr">{updated}</span>
        </p>
      ) : null}

      {intro ? <p className="mt-4 text-[0.95rem] leading-8 text-ink">{intro}</p> : null}

      <p className="mt-2 text-[0.95rem] leading-8 text-muted">{entity}</p>

      {sections.map((section, index) => (
        <section key={`${section.title ?? "section"}-${index}`} className="mt-8">
          {section.title ? <h2 className="font-display text-xl font-bold text-forest">{section.title}</h2> : null}
          {/*
            A body is written in الإعدادات as plain text, and a blank line or a newline there is a paragraph
            break here. Splitting rather than rendering HTML is deliberate: the owner is writing sentences in
            a textarea, not markup, and a settings row that could inject markup into every visitor's page is
            a hole that does not need to exist.
          */}
          {section.body
            ? section.body
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, lineIndex) => (
                  <p key={lineIndex} className="mt-3 text-[0.95rem] leading-8 text-ink">
                    {line}
                  </p>
                ))
            : null}
        </section>
      ))}

      <section className="card mt-10 p-card">
        {contactLine ? <p className="text-[0.95rem] leading-8 text-ink">{contactLine}</p> : null}
        {email ? (
          <p className="mt-1">
            <a className="font-semibold text-forest underline-offset-4 hover:underline" href={`mailto:${email}`} dir="ltr">
              {email}
            </a>
          </p>
        ) : null}
        {address ? <p className="mt-2 text-caption leading-7 text-muted">{address}</p> : null}
      </section>
    </div>
  );
}
