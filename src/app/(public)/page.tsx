import { ArrowDown, ArrowLeft, Calculator, ChevronLeft, LandPlot, Lock, TreeDeciduous } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { FactTile } from "@/components/site/fact-tile";
import { GrowthIcon } from "@/components/site/growth-icon";
import { MillionCounter } from "@/components/site/million-counter";
import { MillionStart } from "@/components/site/million-start";
import { OliveBranch } from "@/components/site/olive-decor";
import { SiteIcon } from "@/components/site/site-icon";
import { SitePhoto } from "@/components/site/site-photo";
import { TunisiaMap } from "@/components/site/tunisia-map";
import { flagState, getPublicConfig, optionsFor, settingJson, settingText } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { getMillionProgress } from "@/lib/million";

type Step = { title: string; text: string; icon?: string };
type Faq = { q: string; a: string };
type Fact = { value: string; label: string };
type ParcelExample = { title: string; area: string; trees: string; system: string; status: string };
type ValueItem = { ar: string; icon?: string };

/** Icon of each step when the stored step names none, in the order of the board's five steps. */
const STEP_ICONS = ["document", "chart", "pin", "handshake", "sprout"];
/** Steps whose icon sits on the gold plate, as on the board. */
const GOLD_STEPS = new Set([1, 2]);

// The counter moves as requests arrive, so the page is rebuilt at most once a minute (MIL-01).
export const revalidate = 60;

export default async function HomePage() {
  const [config, progress] = await Promise.all([getPublicConfig(), getMillionProgress()]);

  const interestOpen = flagState(config, "interest_form") === "public";
  const simulatorOpen = flagState(config, "simulator_basic") === "public";
  const landOpen = flagState(config, "land_offers") === "public";

  const steps = settingJson<Step[]>(config, "site.how_it_works", []);
  const faq = settingJson<Faq[]>(config, "site.faq", []);
  const facts = settingJson<Fact[]>(config, "site.facts", []);
  const parcels = settingJson<ParcelExample[]>(config, "site.parcel_examples", []);
  const values = settingJson<ValueItem[]>(config, "start.values", []);
  const notice = settingText(config, "site.free_interest_notice");
  const tagline = settingText(config, "brand.tagline_ar");
  const treeCounts = optionsFor(config, "tree_count");
  const downPayments = optionsFor(config, "down_payment").slice(0, 4);

  const heroBar =
    progress && progress.goal > 0 && progress.treesRequested > 0
      ? Math.max(Math.min(progress.treesRequested / progress.goal, 1) * 100, 0.8)
      : 0;

  return (
    <>
      {/* 01 · The coast, the groves, the name of the project and one thing to do (HOME-01) */}
      <section className="relative isolate overflow-hidden bg-forest-800 text-white">
        <SitePhoto
          config={config}
          slot="home.hero_wide"
          fill
          priority
          sizes="100vw"
          fallback={{ src: "/brand/hero-coast.webp" }}
          className="-z-20"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-l from-forest-800/90 via-forest-800/45 to-transparent" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-linear-to-t from-forest-800/75 to-transparent" />

        <div className="mx-auto max-w-7xl px-4 pb-36 pt-36 sm:px-6 sm:pb-44 sm:pt-44 lg:px-8">
          <div className="max-w-2xl">
            {settingText(config, "site.hero_eyebrow") ? (
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-semibold backdrop-blur-sm">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-gold-bright" />
                {settingText(config, "site.hero_eyebrow")}
              </p>
            ) : null}

            <h1 className="font-serif text-[3.25rem] font-bold leading-[1.02] text-balance drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)] sm:text-7xl lg:text-[5.5rem]">
              {settingText(config, "site.home_headline")}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/90 sm:text-xl">
              {settingText(config, "site.home_subheadline")}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              {interestOpen ? (
                <Link href="/register" className="btn btn-gold min-h-14 px-8 text-lg">
                  سجّل مطلبك
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Link>
              ) : null}
              <Link href="/#how" className="btn btn-light min-h-14 ps-2.5 pe-6 text-lg">
                <span className="grid size-9 place-items-center rounded-full bg-white text-forest">
                  <ArrowDown aria-hidden="true" className="size-4.5" />
                </span>
                اكتشف كيفاش تخدم AgriZed
              </Link>
            </div>

            {notice ? <p className="mt-4 text-sm font-medium text-white/80">{notice}</p> : null}
          </div>
        </div>

        {/* The handwritten line in the far corner of the photograph */}
        {tagline ? (
          <p
            aria-hidden="true"
            className="script pointer-events-none absolute end-[33%] top-30 hidden -rotate-[6deg] text-5xl text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] xl:block"
          >
            {tagline}
            <svg viewBox="0 0 140 14" fill="none" className="ms-auto mt-1 block h-3.5 w-32 text-rose">
              <path d="M3 10C38 3 88 2 137 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </p>
        ) : null}
      </section>

      {/* The board's white figures strip, over the edge of the photograph. Real counts only (MIL-01). */}
      {progress ? (
        <div className="relative z-10 mx-auto -mt-20 max-w-7xl px-4 sm:-mt-24 sm:px-6 lg:px-8">
          <div className="relative">
            {/* Tucked behind the card's corner, so no leaf covers a figure */}
            <OliveBranch className="-bottom-16 -start-14 hidden w-44 rotate-[24deg] lg:block" />
            <div className="card relative z-10 grid gap-5 px-6 py-6 shadow-float sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-8 sm:px-9">
              <p className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-ink tabular-nums sm:text-5xl">
                  {formatCount(progress.treesRequested)}
                </span>
                <span className="text-muted">زيتونة مطلوبة</span>
              </p>
              <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-leaf-soft">
                <div className="h-full rounded-full bg-linear-to-l from-leaf to-forest" style={{ width: `${heroBar}%` }} />
              </div>
              <p className="sm:text-end">
                <span className="block text-2xl font-bold text-ink tabular-nums sm:text-3xl">{formatCount(progress.goal)}</span>
                <span className="text-sm text-muted">زيتونة هدف المشروع</span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* What the project stands for, one icon each */}
      {values.length > 0 ? (
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <ul className="grid gap-x-8 gap-y-5 border-b border-line pb-10 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <li key={value.ar} className="flex items-center gap-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-full border border-forest/15 bg-surface text-forest shadow-card">
                  <SiteIcon code={value.icon} className="size-5.5" />
                </span>
                <span className="text-[0.95rem] font-medium leading-6 text-ink/80">{value.ar}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 02 · Where the project stands */}
      {progress ? (
        <MillionCounter
          progress={progress}
          title={settingText(config, "site.progress_title", "وين وصلنا؟")}
          note={settingText(config, "site.progress_note")}
        />
      ) : null}

      {/* 03 · The million starts with one olive tree */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <h2 className="section-title">{settingText(config, "site.start_title", "المليون تبدأ بزيتونة")}</h2>
            <p className="section-lead mt-3 max-w-xl">{settingText(config, "site.start_text")}</p>

            {facts.length > 0 ? (
              <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                {facts.map((fact) => (
                  <li key={fact.label} className="card px-5 py-4">
                    <p className="text-3xl font-bold leading-none text-forest">{fact.value}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{fact.label}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="relative">
            <SitePhoto config={config} slot="home.journey" sizes="(min-width: 1024px) 36vw, 100vw" className="shadow-float" />
            <OliveBranch className="-end-10 -top-10 hidden w-40 -rotate-[25deg] lg:block" flip />
          </div>
        </div>
      </section>

      {/* 04 · The tree question; a card click opens /start with that tier chosen (MIL-01) */}
      {interestOpen && treeCounts.length > 0 ? (
        <MillionStart
          treeCounts={treeCounts}
          treesQuestion={settingText(config, "site.trees_question", "قدّاش زيتونة تحب تبدا بيهم؟")}
          taglines={settingJson(config, "start.tier_taglines", {})}
          otherLink={settingText(config, "site.trees_other_link")}
        />
      ) : null}

      {/* 05 · How it works: the board's five cards, then the handwritten line, a face and the country */}
      {steps.length > 0 ? (
        <section id="how" className="scroll-mt-24 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-line bg-cream px-5 pb-10 pt-14 shadow-card sm:px-10 lg:px-14">
              <OliveBranch className="-end-12 -top-16 hidden w-60 -rotate-[30deg] sm:block" flip />

              <div className="relative mx-auto max-w-2xl text-center">
                <h2 className="section-title">{settingText(config, "site.how_title", "كيفاش تخدم AgriZed؟")}</h2>
                <p className="section-lead mt-3">
                  {settingText(config, "site.how_text", "مسار واضح، خطوة بخطوة، بدون أي دفع في البداية.")}
                </p>
              </div>

              <ol className="relative mt-14 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-5">
                {steps.map((step, index) => (
                  <li key={step.title} className="relative">
                    <span className="absolute inset-x-0 -top-4 z-10 mx-auto grid size-9 place-items-center rounded-full bg-forest text-sm font-bold text-white ring-4 ring-cream tabular-nums">
                      {index + 1}
                    </span>
                    <div className="flex h-full flex-col items-center rounded-2xl border border-line bg-surface px-4 pb-7 pt-10 text-center shadow-card">
                      <span className={`icon-bubble ${GOLD_STEPS.has(index) ? "icon-bubble-gold" : ""}`}>
                        <SiteIcon code={step.icon ?? STEP_ICONS[index]} className="size-7" strokeWidth={1.6} />
                      </span>
                      <h3 className="mt-5 font-bold leading-6 text-ink">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
                    </div>
                    {index < steps.length - 1 ? (
                      <ChevronLeft
                        aria-hidden="true"
                        className="absolute -end-4.5 top-1/2 z-10 hidden size-5 -translate-y-1/2 text-line-strong lg:block"
                      />
                    ) : null}
                  </li>
                ))}
              </ol>

              <div className="relative mt-12 grid items-center gap-8 border-t border-line pt-10 md:grid-cols-[1fr_auto_1fr]">
                <p className="script text-center text-3xl text-forest sm:text-4xl md:text-start">
                  {settingText(config, "site.closing_title")}
                </p>
                <div className="relative mx-auto size-44 overflow-hidden rounded-full shadow-float ring-8 ring-surface">
                  <SitePhoto config={config} slot="home.how_portrait" fill sizes="11rem" fallback={{ src: "/brand/farmer.webp" }} />
                </div>
                <div className="flex items-center justify-center gap-4 md:justify-end">
                  <TunisiaMap className="h-32 w-auto text-sand-deep" />
                  <p className="max-w-40 text-sm font-semibold leading-6 text-ink/70">{settingText(config, "site.coverage_title")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 06 · What a parcel is. PARC-01/02: area, tree count, system and status are independent. */}
      {parcels.length > 0 ? (
        <section id="parcels" className="scroll-mt-24 border-y border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="section-title">{settingText(config, "site.parcels_title")}</h2>
              <p className="section-lead mt-3">{settingText(config, "site.parcels_text")}</p>
            </div>

            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {parcels.slice(0, 3).map((parcel, index) => (
                <li
                  key={parcel.title}
                  className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-float"
                >
                  <div className="relative">
                    <SitePhoto
                      config={config}
                      slot={`home.parcel_${"abc"[index] ?? "a"}`}
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
                      className="rounded-none"
                    />
                    <span className="pill pill-forest absolute start-3 top-3 px-2.5 py-1 shadow-sm">مثال توضيحي</span>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-ink">{parcel.title}</h3>
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <FactTile icon={<LandPlot aria-hidden="true" className="size-4" />} label="المساحة">
                        {parcel.area}
                      </FactTile>
                      <FactTile icon={<TreeDeciduous aria-hidden="true" className="size-4" />} label="عدد الزيتونات">
                        {parcel.trees}
                      </FactTile>
                    </dl>
                    <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted">نوع الغراسة</dt>
                        <dd className="font-semibold text-ink">{parcel.system}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-muted">حالة الإنتاج</dt>
                        <dd className="pill pill-mint">{parcel.status}</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ul>

            {settingText(config, "legal.parcel_card_note") ? (
              <p className="mt-6 max-w-3xl rounded-xl bg-gold-soft/60 px-4 py-3 text-sm leading-6 text-ink/80">
                {settingText(config, "legal.parcel_card_note")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 07 · Where. Every governorate is open; demand decides where AgriZed searches next. */}
      <section id="where" className="scroll-mt-24 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-8">
          <div>
            <h2 className="section-title">{settingText(config, "site.coverage_title")}</h2>
            <p className="section-lead mt-3 max-w-xl">{settingText(config, "site.coverage_text")}</p>
            <ul className="mt-7 flex flex-wrap gap-2">
              {config.governorates.map((governorate) => (
                <li
                  key={governorate.id}
                  className="rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm text-ink shadow-[0_1px_2px_rgba(22,29,23,0.05)]"
                >
                  {governorate.name_ar}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-3xl bg-sand px-6 py-10 shadow-card">
            <OliveBranch className="-bottom-10 -end-12 w-56 rotate-[160deg]" />
            <TunisiaMap className="relative mx-auto h-[26rem] w-auto text-sand-deep" />
            {facts[0] ? (
              <div className="card absolute bottom-6 start-6 px-4 py-3">
                <p className="text-2xl font-bold text-forest">{facts[0].value}</p>
                <p className="text-sm text-muted">{facts[0].label}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 08 · Where to start: the board's list of project types */}
      {config.projectTypes.length > 0 ? (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
            <div>
              <h2 className="section-title">{settingText(config, "site.types_title", "من أين تبدأ؟")}</h2>
              <p className="section-lead mt-3">
                {settingText(
                  config,
                  "site.types_text",
                  "أربع نقاط انطلاق، من الأرض البيضاء إلى الضيعة المنتجة. تختار اللي يناسب قدرتك وصبرك.",
                )}
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {config.projectTypes.map((type) => {
                const body = (
                  <>
                    <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-leaf-soft text-forest">
                      {type.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- remote host is set per project, not known at build time
                        <img src={type.image_url} alt={type.image_alt_ar ?? ""} className="absolute inset-0 size-full object-cover" loading="lazy" />
                      ) : (
                        <GrowthIcon code={type.code} className="size-10" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{type.label_ar}</span>
                      {type.description_ar ? (
                        <span className="mt-1 block text-sm leading-6 text-muted">{type.description_ar}</span>
                      ) : null}
                    </span>
                  </>
                );
                return (
                  <li key={type.id}>
                    {interestOpen ? (
                      <Link
                        href="/start"
                        className="group flex h-full items-center gap-4 rounded-2xl border border-line bg-surface p-3 pe-4 shadow-card transition hover:border-forest/40 hover:shadow-float"
                      >
                        {body}
                        <ChevronLeft
                          aria-hidden="true"
                          className="size-5 shrink-0 text-muted transition group-hover:-translate-x-0.5 group-hover:text-forest"
                        />
                      </Link>
                    ) : (
                      <div className="flex h-full items-center gap-4 rounded-2xl border border-line bg-surface p-3 pe-4 shadow-card">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 09 · Simulator: the board's simulator panel, with the real down-payment list as its chips */}
      {simulatorOpen ? (
        <section className="pt-16 sm:pt-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative grid overflow-hidden rounded-3xl border border-line bg-surface shadow-card md:grid-cols-[1.05fr_0.95fr]">
              <div className="relative z-10 p-7 sm:p-10">
                <span className="icon-bubble size-14">
                  <Calculator aria-hidden="true" className="size-6" strokeWidth={1.6} />
                </span>
                <h2 className="section-title mt-5">{settingText(config, "site.simulator_title", "احسب قدرتك")}</h2>
                <p className="section-lead mt-2 max-w-md">
                  {settingText(
                    config,
                    "site.simulator_text",
                    "اختر التسبقة والقسط الشهري، ونوريك قدرتك التقديرية على مدد مختلفة، بدون تسجيل.",
                  )}
                </p>
                {downPayments.length > 0 ? (
                  <div aria-hidden="true" className="mt-6">
                    <p className="text-sm font-semibold text-ink">التسبقة</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {downPayments.map((option, index) => (
                        <span
                          key={option.id}
                          className={`chip pointer-events-none min-h-10 px-3 text-sm ${index === 1 ? "border-forest bg-forest text-white" : ""}`}
                        >
                          {option.label_ar}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Link href="/simulator" className="btn btn-primary mt-8 min-h-13 px-7">
                  {settingText(config, "site.simulator_cta", "جرّب المحاكي")}
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Link>
              </div>
              <div className="relative min-h-64 overflow-hidden bg-cream">
                <OliveBranch className="-bottom-6 -start-6 w-80 max-w-none" />
                <p className="script absolute end-8 top-10 max-w-64 -rotate-3 text-3xl leading-snug text-forest sm:text-4xl">
                  {settingText(config, "site.home_subheadline")}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 10 · Landowners */}
      {landOpen ? (
        <section className="pt-16 sm:pt-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-8 overflow-hidden rounded-3xl border border-gold/20 bg-sand/70 p-6 shadow-card sm:p-10 lg:grid-cols-[1fr_0.9fr]">
              <div>
                <h2 className="section-title">{settingText(config, "site.land_title", "عندك أرض أو ضيعة زيتون؟")}</h2>
                <p className="section-lead mt-3 max-w-xl">{settingText(config, "site.land_section_text")}</p>
                <Link href="/land" className="btn btn-primary mt-7">
                  {settingText(config, "site.land_cta", "ابعث معلومات عقارك")}
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Link>
              </div>
              <SitePhoto config={config} slot="home.land" sizes="(min-width: 1024px) 40vw, 100vw" className="shadow-float" />
            </div>
          </div>
        </section>
      ) : null}

      {/* FAQ */}
      {faq.length > 0 ? (
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="section-title text-center">{settingText(config, "site.faq_title", "أسئلة شائعة")}</h2>
            <div className="mt-8 space-y-3">
              {faq.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-line bg-surface px-5 shadow-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-soft text-xl leading-none text-forest transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 leading-7 text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="h-16 sm:h-20" />
      )}

      {/* 11 · Closing: a Tunisian coast with the last call to action, and the forest-green logo band */}
      <section className="grid lg:grid-cols-2">
        <div className="relative isolate flex min-h-[26rem] items-end overflow-hidden">
          <SitePhoto
            config={config}
            slot="home.closing_village"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            fallback={{ src: "/brand/tunisia-village.webp" }}
            className="-z-20"
          />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-t from-forest-800/90 via-forest-800/35 to-transparent" />
          <div className="w-full p-7 text-white sm:p-10">
            {interestOpen ? (
              <>
                <h2 className="max-w-md font-serif text-4xl font-bold leading-tight text-balance sm:text-5xl">
                  {settingText(config, "site.final_cta_title", "سجّل مطلبك في مشروع المليون زيتونة")}
                </h2>
                <Link href="/register" className="btn btn-gold mt-6 min-h-14 px-8 text-lg">
                  سجّل مطلبك
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </Link>
                {settingText(config, "site.final_cta_note") ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-white/85">
                    <Lock aria-hidden="true" className="size-4" />
                    {settingText(config, "site.final_cta_note")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="script text-4xl">{settingText(config, "site.closing_title")}</p>
            )}
          </div>
        </div>

        <div className="relative isolate flex min-h-[26rem] items-center overflow-hidden bg-forest-700 px-7 py-14 text-white sm:px-12">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(126,172,62,0.25),transparent_60%)]"
          />
          <OliveBranch className="-bottom-8 -end-12 w-72 -rotate-[35deg] sm:w-96" flip />
          <div className="relative max-w-md">
            <p className="script text-4xl leading-snug sm:text-5xl">
              {settingText(config, "site.vision_title", settingText(config, "site.closing_title"))}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Wordmark onDark className="text-5xl sm:text-6xl" />
              {settingText(config, "site.vision_text") ? (
                <p className="max-w-56 border-s border-white/25 ps-5 text-sm leading-6 text-white/80">
                  {settingText(config, "site.vision_text")}
                </p>
              ) : null}
            </div>
            {settingText(config, "brand.tagline_fr") ? (
              <p lang="fr" dir="ltr" className="mt-6 text-right text-xs uppercase tracking-[0.28em] text-gold-bright sm:text-sm">
                {settingText(config, "brand.tagline_fr")}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
