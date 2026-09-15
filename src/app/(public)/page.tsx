import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { GrowthIcon } from "@/components/site/growth-icon";
import { MillionCounter, millionCounterCopy } from "@/components/site/million-counter";
import { MillionStart } from "@/components/site/million-start";
import { primaryCta } from "@/components/site/site-header";
import { SitePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, optionsFor, settingJson, settingText } from "@/lib/config";
import { getMillionProgress } from "@/lib/million";

type Step = { title: string; text: string };
type Faq = { q: string; a: string };
type Fact = { value: string; label: string };
type ParcelExample = { title: string; area: string; trees: string; system: string; status: string };

// The counter moves as requests arrive, so the page is rebuilt at most once a minute (MIL-01).
export const revalidate = 60;

export default async function HomePage() {
  const config = await getPublicConfig();
  // §54: this page is prerendered for everyone, so reading the session for an "internal" preview would break
  // its regeneration; only a public module shows here, and million_progress() refuses visitors otherwise.
  const progress = flagState(config, "public_statistics") === "public" ? await getMillionProgress() : null;

  const interestOpen = flagState(config, "interest_form") === "public";
  const simulatorOpen = flagState(config, "simulator_basic") === "public";
  const landOpen = flagState(config, "land_offers") === "public";

  const steps = settingJson<Step[]>(config, "site.how_it_works", []);
  const faq = settingJson<Faq[]>(config, "site.faq", []);
  const facts = settingJson<Fact[]>(config, "site.facts", []);
  const parcels = settingJson<ParcelExample[]>(config, "site.parcel_examples", []);
  const notice = settingText(config, "site.free_interest_notice");
  const treeCounts = optionsFor(config, "tree_count");
  // Report v3 §17: the main button opens the tree question first (v2 §5). «شوف العروض» replaces the steps link
  // only once offers are public, so it never leads to a «قريباً» page.
  const cta = primaryCta(config);
  const offersLabel = flagState(config, "projects") === "public" ? settingText(config, "site.cta_offers_label") : "";
  const secondaryCta: { label: string; href: "/projects" | "/#how" } = offersLabel
    ? { label: offersLabel, href: "/projects" }
    : { label: settingText(config, "site.cta_secondary_label", "اكتشف كيفاش تخدم AgriZed"), href: "/#how" };

  return (
    <>
      {/* 01 · One wide, quiet olive grove, the name of the project, and one thing to do (HOME-01) */}
      <section className="relative isolate grid min-h-[30rem] items-center overflow-hidden sm:min-h-[34rem]">
        <SitePhoto config={config} slot="home.hero" fill priority sizes="100vw" />
        <div className="absolute inset-0 bg-linear-to-t from-forest-700/85 via-forest-700/60 to-forest-700/35" />
        <div className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="max-w-2xl text-paper">
              {settingText(config, "site.hero_eyebrow") ? (
                <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-paper/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-bright" />
                  {settingText(config, "site.hero_eyebrow")}
                </p>
              ) : null}

              <h1 className="font-display text-[2.75rem] font-bold leading-[1.1] text-balance sm:text-7xl">
                {settingText(config, "site.home_headline")}
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-8 text-paper/90 sm:text-xl">
                {settingText(config, "site.home_subheadline")}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {interestOpen && cta.label ? (
                  <Link
                    href={cta.href}
                    className="btn min-h-14 bg-gold-bright px-8 text-lg text-forest-700 hover:bg-gold-soft"
                  >
                    {cta.label}
                  </Link>
                ) : null}
                {secondaryCta.label ? (
                  <Link
                    href={secondaryCta.href}
                    className="btn min-h-14 border-2 border-paper/40 px-6 text-paper hover:border-paper hover:bg-paper/10"
                  >
                    {secondaryCta.label}
                  </Link>
                ) : null}
              </div>

              {notice ? <p className="mt-4 text-sm font-medium text-paper/85">{notice}</p> : null}
            </div>
          </div>
        </div>
      </section>

      {/* 02 · Where the project stands. Counts of real rows only, one tile per stage (spec v2 §6). */}
      {progress ? <MillionCounter progress={progress} copy={millionCounterCopy(config)} /> : null}

      {/* 03 · The million starts with one olive tree */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">
              {settingText(config, "site.start_title", "المليون تبدأ بزيتونة")}
            </h2>
            <p className="mt-3 max-w-xl text-lg leading-8 text-muted">{settingText(config, "site.start_text")}</p>

            {facts.length > 0 ? (
              <ul className="mt-7 grid gap-4 sm:grid-cols-3">
                {facts.map((fact) => (
                  <li key={fact.label}>
                    <p className="font-display text-3xl font-bold leading-none text-forest">{fact.value}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{fact.label}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <SitePhoto config={config} slot="home.journey" sizes="(min-width: 1024px) 36vw, 100vw" />
        </div>
      </section>

      {/* 04 · The tree question; a card click opens /start with that tier chosen (MIL-01, spec v2 §7) */}
      {interestOpen && treeCounts.length > 0 ? (
        <MillionStart
          treeCounts={treeCounts}
          treesQuestion={settingText(config, "site.trees_question", "قدّاش زيتونة تحب تبدا بيهم؟")}
          subtitle={settingText(
            config,
            "site.trees_subtitle",
            "اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب.",
          )}
          taglines={settingJson(config, "start.tier_taglines", {})}
          otherCardLabel={settingText(config, "site.trees_other_card_label", "عدد آخر")}
          otherLink={settingText(config, "site.trees_other_link")}
        />
      ) : null}

      {/* 05 · How it works */}
      {steps.length > 0 ? (
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">كيفاش تخدم AgriZed؟</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted">مسار واضح، خطوة بخطوة، بدون أي دفع في البداية.</p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-line bg-surface p-5">
                <span className="grid size-10 place-items-center rounded-full bg-gold-soft font-display text-xl font-bold text-gold tabular-nums">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* 06 · What a parcel is. PARC-01/02: area, tree count, system and status are independent. */}
      {parcels.length > 0 ? (
        <section id="parcels" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">
                {settingText(config, "site.parcels_title")}
              </h2>
              <p className="mt-3 leading-7 text-muted">{settingText(config, "site.parcels_text")}</p>
            </div>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {parcels.slice(0, 3).map((parcel, index) => (
                <li key={parcel.title} className="overflow-hidden rounded-2xl border border-line bg-paper">
                  <SitePhoto
                    config={config}
                    slot={`home.parcel_${"abc"[index] ?? "a"}`}
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
                    className="rounded-none"
                  />
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-ink">{parcel.title}</h3>
                      <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-xs font-semibold text-forest">
                        مثال توضيحي
                      </span>
                    </div>
                    <dl className="mt-4 space-y-2 text-sm">
                      <ParcelRow label="المساحة" value={parcel.area} />
                      <ParcelRow label="عدد الزيتونات" value={parcel.trees} />
                      <ParcelRow label="نوع الغراسة" value={parcel.system} />
                      <ParcelRow label="حالة الإنتاج" value={parcel.status} />
                    </dl>
                  </div>
                </li>
              ))}
            </ul>

            {settingText(config, "legal.parcel_card_note") ? (
              <p className="mt-6 max-w-3xl rounded-xl bg-gold-soft/50 px-4 py-3 text-sm leading-6 text-ink/80">
                {settingText(config, "legal.parcel_card_note")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 07 · Where. Every governorate is open; demand decides where AgriZed searches next. */}
      <section id="where" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">
              {settingText(config, "site.coverage_title")}
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-muted">{settingText(config, "site.coverage_text")}</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {config.governorates.map((governorate) => (
                <li
                  key={governorate.id}
                  className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink"
                >
                  {governorate.name_ar}
                </li>
              ))}
            </ul>
          </div>
          <SitePhoto config={config} slot="home.coverage" sizes="(min-width: 1024px) 36vw, 100vw" />
        </div>
      </section>

      {/* 08 · Plantation types */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">من أين تبدأ؟</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            أربع نقاط انطلاق، من الأرض البيضاء إلى الضيعة المنتجة. تختار اللي يناسب قدرتك وصبرك.
          </p>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {config.projectTypes.map((type) => (
              <li key={type.id} className="overflow-hidden rounded-2xl border border-line bg-paper">
                {type.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote host is set per project, not known at build time
                  <img
                    src={type.image_url}
                    alt={type.image_alt_ar ?? ""}
                    className="aspect-4/3 w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
                <div className="p-5">
                  <GrowthIcon code={type.code} className="size-10 text-leaf" />
                  <h3 className="mt-4 text-lg font-semibold text-ink">{type.label_ar}</h3>
                  {type.description_ar ? (
                    <p className="mt-1 text-sm leading-6 text-muted">{type.description_ar}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 09 · Simulator */}
      {simulatorOpen ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 rounded-3xl bg-forest px-6 py-10 text-paper sm:px-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">احسب قدرتك</h2>
              <p className="mt-2 max-w-xl leading-7 text-paper/80">
                اختر التسبقة والقسط الشهري، ونوريك قدرتك التقديرية على مدد مختلفة، بدون تسجيل.
              </p>
            </div>
            <Link href="/simulator" className="btn min-h-14 bg-gold-bright px-8 text-forest-700 hover:bg-gold-soft">
              جرّب المحاكي
            </Link>
          </div>
        </section>
      ) : null}

      {/* 10 · Landowners */}
      {landOpen ? (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid items-center gap-8 rounded-3xl border border-gold/25 bg-gold-soft/50 p-6 sm:p-10 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h2 className="font-display text-2xl font-bold text-forest sm:text-3xl">عندك أرض أو ضيعة زيتون؟</h2>
              <p className="mt-3 max-w-xl leading-7 text-ink/80">{settingText(config, "site.land_section_text")}</p>
              <Link href="/land" className="btn btn-primary mt-6">
                ابعث معلومات عقارك
              </Link>
            </div>
            <SitePhoto config={config} slot="home.land" sizes="(min-width: 1024px) 40vw, 100vw" />
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      {faq.length > 0 ? (
        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
          <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">أسئلة شائعة</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {faq.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="text-2xl leading-none text-gold transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 leading-7 text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {/* 11 · Ask once more, plainly */}
      {interestOpen ? (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="rounded-3xl border border-line bg-surface px-6 py-12 text-center sm:px-10">
            <h2 className="font-display text-3xl font-bold text-balance text-forest sm:text-4xl">
              {settingText(config, "site.final_cta_title", "سجّل مطلبك في مشروع المليون زيتونة")}
            </h2>
            {cta.label ? (
              <Link href={cta.href} className="btn btn-primary mt-7 min-h-14 px-10 text-lg">
                {cta.label}
              </Link>
            ) : null}
            <p className="mt-3 text-sm text-muted">{settingText(config, "site.final_cta_note")}</p>
          </div>
        </section>
      ) : null}

      {/* Closing band */}
      <section className="relative isolate grid min-h-[22rem] place-items-center overflow-hidden sm:min-h-[26rem]">
        <SitePhoto
          config={config}
          slot="home.closing"
          fill
          sizes="100vw"
          className="[&_img]:brightness-[0.45] [&_svg]:brightness-[0.55]"
        />
        <div className="absolute inset-0 bg-forest-700/45" />
        <div className="relative px-4 py-16 text-center">
          <div>
            <Wordmark onDark className="text-4xl sm:text-6xl" />
            <p className="mt-4 font-display text-3xl font-bold text-paper sm:text-5xl">
              {settingText(config, "site.closing_title", settingText(config, "site.vision_title"))}
            </p>
            <p className="mt-3 text-paper/85 sm:text-lg">{settingText(config, "site.vision_text")}</p>
            {settingText(config, "brand.tagline_fr") ? (
              <p dir="ltr" className="mt-5 text-xs uppercase tracking-[0.28em] text-gold-bright sm:text-sm">
                {settingText(config, "brand.tagline_fr")}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

function ParcelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
