import Link from "next/link";

import { GrowthIcon } from "@/components/site/growth-icon";
import { flagState, getPublicConfig, optionsFor, settingJson, settingText, type PublicConfig } from "@/lib/config";

type Step = { title: string; text: string };
type Faq = { q: string; a: string };

export default async function HomePage() {
  const config = await getPublicConfig();

  const interestOpen = flagState(config, "interest_form") === "public";
  const simulatorOpen = flagState(config, "simulator_basic") === "public";
  const landOpen = flagState(config, "land_offers") === "public";

  const steps = settingJson<Step[]>(config, "site.how_it_works", []);
  const faq = settingJson<Faq[]>(config, "site.faq", []);
  const notice = settingText(config, "site.free_interest_notice");

  return (
    <>
      {/* Hero: the idea in one screen, with the register button and the free-of-charge notice (HOME-01) */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 -end-40 size-[30rem] rounded-full bg-[radial-gradient(circle,var(--color-gold-soft)_0%,transparent_68%)]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:items-center md:pb-20 md:pt-16">
          <div>
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

          <SampleRequest config={config} />
        </div>
      </section>

      {steps.length > 0 ? (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">كيف تعمل AgriZed؟</h2>
            <ol className="mt-8 grid gap-7 md:grid-cols-5 md:gap-5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4 md:flex-col md:gap-3">
                  <span className="grid size-10 flex-none place-items-center rounded-full bg-gold-soft font-display text-xl font-bold text-gold tabular-nums">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">من أين تبدأ؟</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {config.projectTypes.map((type) => (
            <li key={type.id} className="rounded-2xl border border-line bg-surface p-5">
              <GrowthIcon code={type.code} className="size-10 text-leaf" />
              <h3 className="mt-4 text-lg font-semibold text-ink">{type.label_ar}</h3>
              {type.description_ar ? <p className="mt-1 text-sm leading-6 text-muted">{type.description_ar}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      {simulatorOpen ? (
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
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

      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <p className="font-display text-5xl font-bold text-forest sm:text-7xl">{settingText(config, "site.vision_title")}</p>
        <p className="mt-4 text-lg text-muted">{settingText(config, "site.vision_text")}</p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        {faq.length > 0 ? (
          <div>
            <h2 className="font-display text-3xl font-bold text-forest sm:text-4xl">أسئلة شائعة</h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {faq.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden="true" className="text-2xl leading-none text-gold transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 leading-7 text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        ) : null}

        {landOpen ? (
          <aside className="self-start rounded-2xl border border-gold/25 bg-gold-soft/60 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-bold text-forest sm:text-3xl">عندك أرض أو ضيعة زيتون؟</h2>
            <p className="mt-3 leading-7 text-ink/80">{settingText(config, "site.land_section_text")}</p>
            <Link href="/land" className="btn btn-primary mt-6">
              ابعث معلومات عقارك
            </Link>
          </aside>
        ) : null}
      </section>
    </>
  );
}

/** Shows what a request looks like, using the real option lists so values match the form. */
function SampleRequest({ config }: { config: PublicConfig }) {
  const rows = [
    ["المنطقة", config.governorates.find((g) => g.id === 34)?.name_ar ?? config.governorates[0]?.name_ar],
    ["نوع المشروع", config.projectTypes.find((t) => t.code === "productive")?.label_ar ?? config.projectTypes[0]?.label_ar],
    ["التسبقة", optionsFor(config, "down_payment")[1]?.label_ar],
    ["القسط الشهري", optionsFor(config, "monthly_installment")[3]?.label_ar],
    ["الهدف", optionsFor(config, "goal").find((o) => o.code === "both")?.label_ar],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <aside className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_0_var(--color-line),0_18px_40px_-24px_rgba(31,74,44,0.35)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">شكل الطلب</h2>
        <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-xs font-semibold text-forest">مثال</span>
      </div>
      <dl className="mt-4 divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm leading-6 text-muted">
        بعد التسجيل تتحصل على رقم مطلب، ونتصل بك في الوقت اللي تختارو.
      </p>
    </aside>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 flex-none text-leaf" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
