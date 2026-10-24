"use client";

import { useEffect, useState, useTransition } from "react";

import { useFormat, useT } from "@/lib/i18n/client";

import { quoteStudy, type Study, type StudyRow } from "./actions";

/*
 * دراسة المردودية — the screen §4 describes, and nothing more.
 *
 * NOT ONE FIGURE IS COMPUTED HERE. Every number on this page arrives from public.public_project_study, which
 * is the single door onto the engine in 0153, whose assumptions are the Back Office's (0152). A component
 * that multiplied a yield by a price would be a second study with no test behind it, drifting from the one
 * that has — and §10 asks for the opposite: «جميع الحسابات والنتائج قابلة للاختبار والمراجعة». The
 * arithmetic you will find below is confined to turning basis points into a percentage for display.
 *
 * IT RE-QUOTES ON EVERY ANSWER, which is what «كل النتائج تتحسب مباشرة وتتبدّل مع تغيير المدخلات» asks for,
 * and it KEEPS THE FIGURES IT HAS while the next quote is in flight. Blanking the numbers for 200ms on
 * every tap makes a page that looks broken while it works.
 *
 * THE WARNING IS NOT A FOOTNOTE. §10: the production, the profit and the return are estimates and nothing
 * is guaranteed. It is printed under the headline figures, where the eye that read them lands next, and the
 * study carries it even when it refuses.
 */

const PLAN_LABEL = { cash: "بالحاضر", installments: "بالتقسيط" } as const;

export type StudyFormProps = {
  projectId: string;
  /** The first study the server already quoted, so the page has figures on its first paint. */
  initial: Study | null;
  /** study.horizons — the periods the Back Office offers. */
  horizons: number[];
  minTrees: number;
  maxTrees: number;
  /** This offer's own plan, when it sells on instalments. Null when it is cash only. */
  plan: { downOptionId: string; downLabel: string; durationOptionId: string; durationLabel: string } | null;
};

export function StudyForm(props: StudyFormProps) {
  const t = useT();
  const { formatMillimes, formatCount } = useFormat();

  const [trees, setTrees] = useState(Math.max(props.minTrees, Math.min(10, props.maxTrees)));
  const [years, setYears] = useState(props.horizons[1] ?? props.horizons[0] ?? 10);
  const [scenario, setScenario] = useState<string | null>(null);
  const [mode, setMode] = useState<"olives" | "oil">("olives");
  const [payment, setPayment] = useState<"cash" | "installments">("cash");
  const [study, setStudy] = useState<Study | null>(props.initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const next = await quoteStudy({
        projectId: props.projectId,
        trees,
        years,
        scenario,
        mode,
        paymentMode: payment,
        downPercentOptionId: payment === "installments" ? (props.plan?.downOptionId ?? null) : null,
        durationOptionId: payment === "installments" ? (props.plan?.durationOptionId ?? null) : null,
      });
      // A failed quote keeps what is on screen: a page that empties itself on a dropped request is worse
      // than one showing figures a second old.
      if (!cancelled && next) setStudy(next);
    });
    return () => {
      cancelled = true;
    };
  }, [props.projectId, props.plan, trees, years, scenario, mode, payment]);

  const scenarios = study?.status === "ok" ? study.scenarios : [];
  const current = study?.status === "ok" ? study.scenario.code : scenario;

  return (
    <div className="space-y-5">
      <div className={`space-y-4 ${pending ? "opacity-70" : ""} transition-opacity`}>
        {/* ── the answers ───────────────────────────────────────────────────────────────────────────── */}
        <div className="card space-y-4 p-4 sm:p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">{t("ui.study.trees")}</span>
            <input
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={props.minTrees}
              max={props.maxTrees}
              value={trees}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) setTrees(Math.max(props.minTrees, Math.min(props.maxTrees, Math.round(value))));
              }}
              className="field text-start"
            />
          </label>

          <Choice
            label={t("ui.study.years")}
            options={props.horizons.map((h) => ({ value: String(h), label: `${formatCount(h)} ${t("ui.study.years_unit")}` }))}
            value={String(years)}
            onPick={(value) => setYears(Number(value))}
          />

          {scenarios.length > 0 ? (
            <Choice
              label={t("ui.study.scenario")}
              options={scenarios.map((s) => ({ value: s.code, label: s.label_ar }))}
              value={current ?? ""}
              onPick={setScenario}
            />
          ) : null}

          <Choice
            label={t("ui.study.mode")}
            options={[
              { value: "olives", label: t("ui.study.mode_olives") },
              { value: "oil", label: t("ui.study.mode_oil") },
            ]}
            value={mode}
            onPick={(value) => setMode(value === "oil" ? "oil" : "olives")}
          />

          {props.plan ? (
            <Choice
              label={PLAN_LABEL.cash + " / " + PLAN_LABEL.installments}
              options={[
                { value: "cash", label: PLAN_LABEL.cash },
                { value: "installments", label: `${PLAN_LABEL.installments} · ${props.plan.downLabel} · ${props.plan.durationLabel}` },
              ]}
              value={payment}
              onPick={(value) => setPayment(value === "installments" ? "installments" : "cash")}
            />
          ) : null}
        </div>

        {/* ── the answer ────────────────────────────────────────────────────────────────────────────── */}
        {study?.status === "closed" || study === null ? null : study?.status === "incomplete" ? (
          <div className="card space-y-2 p-4 sm:p-5">
            <p className="text-sm font-semibold text-gold">{t("ui.study.incomplete")}</p>
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
              {study.missing.map((reason) => (
                <li key={reason}>{t(`ui.study.missing_${reason}`)}</li>
              ))}
            </ul>
            <p className="text-caption leading-6 text-muted">{study.legal_note}</p>
          </div>
        ) : study ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Block title={t("ui.study.investment")}>
                <Row label={t("ui.study.price_per_tree")} value={formatMillimes(study.investment.price_per_tree_millimes)} />
                <Row label={t("ui.study.total_price")} value={formatMillimes(study.investment.total_price_millimes)} />
                {study.investment.payment_mode === "installments" ? (
                  <Row label={t("ui.study.invested")} value={formatMillimes(study.investment.invested_millimes)} />
                ) : null}
              </Block>

              <Block title={t("ui.study.production")}>
                <Row
                  label={t("ui.study.kg_total")}
                  value={`${formatCount(Math.round(study.rows[1]?.kg_total ?? 0))} kg`}
                />
                {study.mode === "oil" ? (
                  <Row label={t("ui.study.litres")} value={`${formatCount(Math.round(study.rows[1]?.litres ?? 0))} L`} />
                ) : null}
              </Block>

              <Block title={t("ui.study.finance")}>
                <Row label={t("ui.study.revenue")} value={formatMillimes(study.totals.revenue_millimes)} />
                <Row label={t("ui.study.charges")} value={formatMillimes(study.totals.charges_millimes)} />
                <Row label={t("ui.study.net")} value={formatMillimes(study.totals.net_millimes)} strong />
              </Block>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Block title={t("ui.study.roi")}>
                <p className="stat-figure">{percent(study.totals.roi_bp)}</p>
              </Block>
              <Block title={t("ui.study.payback")}>
                <p className="text-lg font-bold text-forest">
                  {study.totals.payback_year === null
                    ? t("ui.study.payback_never")
                    : t("ui.study.payback_year", { year: study.totals.payback_year })}
                </p>
              </Block>
            </div>

            {/* §10, where the eye that just read a percentage lands next — not in a footer. */}
            <p className="text-caption leading-6 text-muted">{study.legal_note}</p>

            <Projection rows={study.rows} format={formatMillimes} title={t("ui.study.table")} labels={{
              year: t("ui.study.year"),
              revenue: t("ui.study.revenue"),
              charges: t("ui.study.charges"),
              cumulative: t("ui.study.cumulative"),
            }} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Basis points as a percentage, which is the only arithmetic this file does. */
function percent(bp: number | null): string {
  if (bp === null) return "—";
  return `${(bp / 100).toFixed(1)} %`;
}

function Choice({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onPick(option.value)}
            aria-pressed={option.value === value}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              option.value === value
                ? "border-forest bg-forest text-paper"
                : "border-line text-ink hover:border-forest/40"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="text-[0.6875rem] font-semibold tracking-wide text-muted">{title}</h2>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-end tabular-nums ${strong ? "text-base font-bold text-forest" : "font-semibold text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * §4's «رسم بياني للمداخيل والمصاريف والنتائج المتراكمة سنة بسنة», drawn with two divs and a width.
 *
 * No chart library: this is three numbers per row against a shared scale, and a 40KB dependency to draw a
 * bar is 40KB a reader on a Tunisian phone pays for. The bar for the cumulative is the one that matters —
 * it crosses zero in the payback year, which is the single fact a reader is looking for — so it is drawn
 * from a centre line, red to the left of it and green to the right.
 */
function Projection({
  rows,
  format,
  title,
  labels,
}: {
  rows: StudyRow[];
  format: (millimes: number) => string;
  title: string;
  labels: { year: string; revenue: string; charges: string; cumulative: string };
}) {
  const span = Math.max(1, ...rows.map((row) => Math.abs(row.cumulative_millimes)));

  return (
    <div className="card p-4">
      <h2 className="text-[0.6875rem] font-semibold tracking-wide text-muted">{title}</h2>
      <ul className="mt-3 space-y-1.5">
        {rows.map((row) => {
          const share = Math.min(100, (Math.abs(row.cumulative_millimes) / span) * 50);
          const positive = row.cumulative_millimes >= 0;
          return (
            <li key={row.year} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2">
              <span className="text-caption text-muted tabular-nums">
                {labels.year} {row.year}
              </span>
              {/* The centre line is zero. A bar that has not crossed it is money still out. */}
              <span className="relative block h-2 rounded-full bg-line/60">
                <span
                  className={`absolute top-0 h-2 ${positive ? "rounded-e-full bg-forest" : "rounded-s-full bg-danger/70"}`}
                  style={positive ? { insetInlineStart: "50%", width: `${share}%` } : { insetInlineEnd: "50%", width: `${share}%` }}
                />
              </span>
              <span
                className={`text-caption tabular-nums ${positive ? "text-forest" : "text-muted"}`}
                title={`${labels.revenue} ${format(row.revenue_millimes)} · ${labels.charges} ${format(row.charges_millimes)}`}
              >
                {format(row.cumulative_millimes)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
