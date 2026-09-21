import { LandingIcon, type LandingIconName } from "@/components/site/landing/hero";
import { optionsFor, settingText, type PublicConfig } from "@/lib/config";

type ServicesMapProps = {
  config: PublicConfig;
  /**
   * The governorates that actually hold a live offer today, by Arabic name — the page already derives them
   * from the offers' `governorate_id` through `config.governorates`. A marked chip is a row, not a caption.
   */
  offerPlaces?: string[];
};

/**
 * «إنت تستثمر، وإحنا نتلهاو» beside «وين تحب تكون أرضك؟» — the two cards that close the explaining half of
 * the landing page.
 *
 * Both lists are database rows: the services are `option_items` with list_key = "agrized_service", the places
 * are the active governorates. Neither is typed here, and neither is truncated to the six the reference
 * happens to draw — `site.coverage_text` promises «التسجيل مفتوح من كل الولايات», so printing six and hiding
 * eighteen would contradict the paragraph directly above them.
 *
 * `site.services_note` is load-bearing and is not decoration: report v3 §36 sells follow-up for a known fee,
 * and that line is what keeps the chip row from reading as «free».
 */
export function ServicesMap({ config, offerPlaces = [] }: ServicesMapProps) {
  // No title in settings, no services card — the rule the home page has always applied to this block.
  const servicesTitle = settingText(config, "site.services_title");
  const services = servicesTitle ? optionsFor(config, "agrized_service") : [];
  const servicesText = settingText(config, "site.services_text");
  const servicesNote = settingText(config, "site.services_note");

  const coverageTitle = settingText(config, "site.coverage_title");
  const coverageText = settingText(config, "site.coverage_text");
  const governorates = coverageTitle ? config.governorates : [];

  const cards = (servicesTitle ? 1 : 0) + (coverageTitle ? 1 : 0);
  if (cards === 0) return null;
  const live = new Set(offerPlaces);

  return (
    <section className="mx-auto max-w-6xl px-4 py-section sm:px-6">
      <div className={`grid gap-cozy ${cards === 2 ? "lg:grid-cols-2 lg:gap-roomy" : "max-w-3xl"}`}>
        {/* Services first, so on a phone the card that answers «what do I get for my money» comes before the
            one that asks where the visitor's land should be. */}
        {servicesTitle ? (
          <article className="card bg-gold-soft/40 p-card sm:p-roomy">
            <CardHead title={servicesTitle} icon="leaf" />
            {servicesText ? <p className="mt-snug leading-7 text-muted">{servicesText}</p> : null}

            {/* The reference draws an icon over every service. `option_items` has no icon column, so twelve
                Arabic labels would have to be mapped to twelve drawings in code — code holding content — and
                adding one is a migration. The services keep their words and are upgraded from a 12px badge to
                a full chip, which also stops the row reading as a set of tags. */}
            {services.length > 0 ? (
              <ul className="mt-cozy flex flex-wrap gap-tight">
                {services.map((service) => (
                  <li key={service.id}>
                    <span className="chip cursor-default">{service.label_ar}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {servicesNote ? <p className="mt-cozy text-caption leading-6 text-muted">{servicesNote}</p> : null}
          </article>
        ) : null}

        {coverageTitle ? (
          <article className="card relative isolate overflow-hidden bg-gold-soft/55 p-card sm:p-roomy">
            {/* The reference puts a dotted Tunisia silhouette behind these chips. We hold no map asset and the
                site has no map component, so it is NOT faked: what is drawn instead is a pin over a field
                pattern, in the brand's own line vocabulary, at 10 % — parcels, which is what we do have. */}
            <FieldsDecor />

            <div className="relative">
              <CardHead title={coverageTitle} icon="pin" />
              {coverageText ? <p className="mt-snug leading-7 text-muted">{coverageText}</p> : null}

              {governorates.length > 0 ? (
                <ul className="mt-cozy flex flex-wrap gap-tight">
                  {governorates.map((governorate) => {
                    const hasOffer = live.has(governorate.name_ar);
                    return (
                      <li key={governorate.id}>
                        {/* The filled one is the governorate that already holds land on offer — one chip
                            today, صفاقس, and it is a row rather than a decoration. The fill is the
                            reference's, not .chip's own leaf-soft tint, because at this size the tint does
                            not survive the warm ground the card sits on. */}
                        <span
                          aria-current={hasOffer ? "true" : undefined}
                          className={`chip cursor-default ${hasOffer ? "border-forest bg-forest text-paper" : ""}`}
                        >
                          {governorate.name_ar}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}

/**
 * A card heading. Unlike the centred heads of the sections above, here the mark LEADS — it sits at the start
 * of the title, which is how the reference draws it inside these two cards.
 */
function CardHead({ title, icon }: { title: string; icon: LandingIconName }) {
  return (
    <div className="flex items-center gap-snug">
      <LandingIcon name={icon} className="size-8 flex-none text-forest" />
      <h2 className="section-title text-2xl sm:text-3xl">{title}</h2>
    </div>
  );
}

/**
 * The backdrop of the coverage card: a pin standing over the rows of a grove.
 *
 * It sits at the card's END side, clipped by the card's own overflow, and never at a negative offset — in RTL
 * one widens the document. The rows are LINES, not little rectangles: a run of small boxes behind a run of
 * chips is read as broken chips, which is exactly what the first version of this drawing looked like.
 * Purely decorative and hidden from the accessibility tree.
 */
function FieldsDecor() {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 end-0 size-72 text-leaf/[0.09]"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path
        d="M100 18c-17 0-30.8 13.4-30.8 30 0 21.5 27.7 51 29 52.3 1 1 2.6 1 3.6 0 1.3-1.3 29-30.8 29-52.3 0-16.6-13.8-30-30.8-30Zm0 42a12 12 0 1 1 0-24 12 12 0 0 1 0 24Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M10 196c26-28 54-48 86-60M46 196c22-24 46-41 72-51M86 196c17-19 36-33 56-41M128 196c11-13 24-23 38-29" />
    </svg>
  );
}
