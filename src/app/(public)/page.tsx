import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { GrowthIcon } from "@/components/site/growth-icon";
import { SitePhoto } from "@/components/site/site-photo";
import { flagState, getPublicConfig, optionsFor, settingJson, settingText, type PublicConfig } from "@/lib/config";

type Step = { title: string; text: string };
type Faq = { q: string; a: string };
type Fact = { value: string; label: string };
type ParcelExample = { title: string; area: string; trees: string; system: string; status: string };

export default async function HomePage() {
  const config = await getPublicConfig();

  const interestOpen = flagState(config, "interest_form") === "public";
  const simulatorOpen = flagState(config, "simulator_basic") === "public";
  const landOpen = flagState(config, "land_offers") === "public";

  const steps = settingJson<Step[]>(config, "site.how_it_works", []);
  const faq = settingJson<Faq[]>(config, "site.faq", []);
  const facts = settingJson<Fact[]>(config, "site.facts", []);
  const parcels = settingJson<ParcelExample[]>(config, "site.parcel_examples", []);
  const notice = settingText(config, "site.free_interest_notice");

  return (
    <>
      {/* 01 · Hero: the idea in one screen, with the register button and the free-of-charge notice (HOME-01) */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 -end-40 size-[30rem] rounded-full bg-[radial-gradient(circle,var(--color-gold-soft)_0%,transparent_68%)]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pb-16 md:pt-14">
          <div>
            {settingText(config, "site.hero_eyebrow") ? (
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-leaf-soft px-3.5 py-1.5 text-sm font-semibold text-forest">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-leaf" />
                {settingText(config, "site.hero_eyebrow")}
              </p>
            ) : null}

            <h1 className="font-display text-[2.5rem] font-bold leading-[1.15] text-balance text-forest sm:text-6xl">
              {settingText(config, "site.home_headline")}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
              {settingText(config, "site.home_subheadline")}
            </p>

            {interestOpen ? (
              <div className="mt-7">
                <Link href="/register" className="btn btn-primary min-h-14 w-full px-8 text-lg sm:w-auto">
                  سجّل اهتمامك
                </Link>
                {notice ? (
                  <p className="mt-3 flex items-center gap-2 text-sm font-medium text-forest">
                    <CheckIcon />
                    {notice}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {simulatorOpen ? (
                <Link href="/simulator" className="btn btn-secondary flex-auto whitespace-nowrap sm:flex-none">
                  احسب قدرتك
                </Link>
              ) : null}
              {landOpen ? (
                <Link href="/land" className="btn btn-secondary flex-auto whitespace-nowrap sm:flex-none">
                  عندك أرض أو ضيعة؟
                </Link>
              ) : null}
            </div>
          </div>

          {/* The photo carries the page; the sample request floats over it, as in the design board. */}
          <div className="relative">
            <SitePhoto
              config={config}
              slot="home.hero"
              priority
              sizes="(min-width: 768px) 46vw, 100vw"
              className="shadow-[0_28px_60px_-34px_rgba(31,74,44,0.55)] sm:rounded-3xl"
            />
            <div className="mt-4 lg:absolute lg:-bottom-10 lg:-start-10 lg:mt-0 lg:w-[17rem] xl:-start-14 xl:w-[19rem]">
              <SampleRequest config={config} />
            </div>
          </div>
        </div>
      </section>

      {facts.length > 0 ? (
        <section className="border-y border-line bg-surface">
          <ul className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
            {facts.map((fact) => (
              <li key={fact.label} className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                <p className="font-display text-4xl font-bold leading-none text-forest">{fact.value}</p>
                <p className="text-sm leading-6 text-muted">{fact.label}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 02 · How it works */}
      {steps.length > 0 ? (
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div className="lg:sticky lg:top-8">
              <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">كيف تعمل AgriZed؟</h2>
              <p className="mt-3 leading-7 text-muted">مسار واضح، خطوة بخطوة، بدون أي دفع في البداية.</p>
              <SitePhoto
                config={config}
                slot="home.journey"
                sizes="(min-width: 1024px) 34vw, 100vw"
                className="mt-6 hidden lg:block"
              />
            </div>

            <ol className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </section>
      ) : null}

      {/* 03 · What a parcel is. PARC-01/02: area, tree count, system and status are independent. */}
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

      {/* 04 · Where. Every governorate is open for registration; demand decides where AgriZed searches. */}
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

      {/* 05 · Plantation types */}
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

      {/* 06 · Simulator */}
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

      {/* 07 · Landowners */}
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

      {/* Closing band */}
      <section className="relative isolate overflow-hidden">
        <SitePhoto
          config={config}
          slot="home.closing"
          sizes="100vw"
          className="rounded-none [&_img]:brightness-[0.45] [&_svg]:brightness-[0.55] sm:max-h-[26rem]"
        />
        <div className="absolute inset-0 grid place-items-center bg-forest-700/45 px-4 text-center">
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

/** Shows what a request looks like, using the real option lists so values match the form. */
function SampleRequest({ config }: { config: PublicConfig }) {
  const rows = [
    ["المنطقة", config.governorates.find((g) => g.id === 34)?.name_ar ?? config.governorates[0]?.name_ar],
    [
      "نوع المشروع",
      config.projectTypes.find((t) => t.code === "productive")?.label_ar ?? config.projectTypes[0]?.label_ar,
    ],
    ["التسبقة", optionsFor(config, "down_payment")[1]?.label_ar],
    ["القسط الشهري", optionsFor(config, "monthly_installment")[3]?.label_ar],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <aside className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_0_var(--color-line),0_18px_40px_-24px_rgba(31,74,44,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">شكل الطلب</h2>
        <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-xs font-semibold text-forest">مثال</span>
      </div>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5 flex-none text-leaf"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
