"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";

import { Bi } from "@/components/site/bilingual";
import { GrowthIcon } from "@/components/site/growth-icon";
import { OliveMark, TreeCardBody, treeCardClass } from "@/components/site/tree-card";
import { toWesternDigits } from "@/lib/digits";
import { formatCount } from "@/lib/format";

type TreeOption = { id: string; code: string | null; label_ar: string; label_fr: string | null; min_number: number | null };
type Scenario = {
  id: string;
  code: string;
  label_ar: string;
  label_fr: string | null;
  description_ar: string | null;
  description_fr: string | null;
  is_any: boolean;
  icon_code: string | null;
  image_url: string | null;
  image_alt_ar: string | null;
  image_alt_fr: string | null;
};
type ChoiceOption = { id: string; label_ar: string; label_fr: string | null };

/** `start.tier_taglines`: one line per tree_count code, plus "custom" for the free-number card. */
export type Tagline = { ar: string; fr?: string };
export type Taglines = Record<string, Tagline>;
/** `start.values`: the reassurance strip under the chooser. */
export type ValueIconKey = "people" | "leaf" | "hand" | "chart";
export type ValueItem = { icon: ValueIconKey; ar: string; fr?: string };

/** Every text on the page, resolved from `settings` on the server (MIL-02, PRN-02). */
export type StartCopy = {
  title: string;
  titleFr: string;
  subtitle: string;
  subtitleFr: string;
  styleQuestion: string;
  styleQuestionFr: string;
  capacityTitle: string;
  capacityTitleFr: string;
  capacityHint: string;
  capacityHintFr: string;
  summaryTitle: string;
  summaryTitleFr: string;
  rowTrees: string;
  rowTreesFr: string;
  rowType: string;
  rowTypeFr: string;
  rowDown: string;
  rowDownFr: string;
  rowDuration: string;
  rowDurationFr: string;
  continue: string;
  continueFr: string;
  continueHint: string;
  continueHintFr: string;
  secureNote: string;
  secureNoteFr: string;
  customLabel: string;
  customLabelFr: string;
  customPlaceholder: string;
  customPlaceholderFr: string;
  customHint: string;
  customHintFr: string;
  treesUnit: string;
  treesUnitFr: string;
};

export type StartChooserProps = {
  treeCounts: TreeOption[];
  scenarios: Scenario[];
  downPayments: ChoiceOption[];
  /** Report v3 §8: payment durations; the visitor never picks a monthly amount (§6). */
  durations: ChoiceOption[];
  copy: StartCopy;
  taglines: Taglines;
  values: ValueItem[];
  customMin: number;
  customMax: number;
  initialTreeId?: string;
  initialCustom?: number;
  initialScenarioId?: string;
  initialDownId?: string;
  initialDurationId?: string;
  /** Server-rendered nodes (next/image, breadcrumb links) kept out of the client bundle. */
  breadcrumb: ReactNode;
  photo: ReactNode;
};

/** §8: a card shows its picture, or its drawing when the Back Office has not uploaded one. */
function ScenarioVisual({ scenario, framed }: { scenario: Scenario; framed: boolean }) {
  // A thumbnail beside the text on a phone, a banner above it once the cards sit two per row.
  const box = "size-20 flex-none rounded-xl sm:aspect-video sm:h-auto sm:w-full";
  if (scenario.image_url) {
    const alt = [scenario.image_alt_ar, scenario.image_alt_fr].filter(Boolean).join(" · ");
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the address is set in the Back Office, its host is not known at build time
      <img src={scenario.image_url} alt={alt} loading="lazy" decoding="async" className={`${box} object-cover`} />
    );
  }
  if (framed) {
    // Keeps the rows aligned when only some cards have a picture.
    return (
      <span className={`${box} grid place-items-center bg-paper`}>
        <GrowthIcon code={scenario.icon_code} className="size-10 text-leaf" />
      </span>
    );
  }
  return <GrowthIcon code={scenario.icon_code} className="size-8 flex-none text-leaf" />;
}

function fillLimits(text: string, min: number, max: number): string {
  return text.replace(/\{min\}/g, formatCount(min)).replace(/\{max\}/g, formatCount(max));
}

/**
 * The number of olive trees is the entry point of the whole journey (MIL-01): the visitor picks a
 * tier or types a number, may add how they want the grove and what they can pay, and continues to
 * /register with those answers in the URL so nothing is asked twice. Choices come from the Back
 * Office lists (LEAD-01) and the summary repeats them verbatim — never a surface, never a price (PARC-02).
 */
export function StartChooser({
  treeCounts,
  scenarios,
  downPayments,
  durations,
  copy,
  taglines,
  values,
  customMin,
  customMax,
  initialTreeId,
  initialCustom,
  initialScenarioId,
  initialDownId,
  initialDurationId,
  breadcrumb,
  photo,
}: StartChooserProps) {
  const [treeId, setTreeId] = useState<string | null>(initialTreeId ?? null);
  const [custom, setCustom] = useState(initialCustom ? String(initialCustom) : "");
  const [scenarioId, setScenarioId] = useState<string | null>(initialScenarioId ?? null);
  const [downId, setDownId] = useState<string | null>(initialDownId ?? null);
  const [durationId, setDurationId] = useState<string | null>(initialDurationId ?? null);
  const [announcement, setAnnouncement] = useState("");
  const groupId = useId();
  const customInputId = `${groupId}-custom`;

  const customNumber = custom === "" ? null : Number(custom);
  const customValid =
    customNumber !== null && Number.isInteger(customNumber) && customNumber >= customMin && customNumber <= customMax;
  const customSelected = treeId === null && customValid;
  const customInvalid = custom !== "" && !customValid;

  const chosenTree = treeId ? treeCounts.find((option) => option.id === treeId) : undefined;
  const chosenScenario = scenarioId ? scenarios.find((option) => option.id === scenarioId) : undefined;
  const withPictures = scenarios.some((option) => Boolean(option.image_url));
  const chosenDown = downId ? downPayments.find((option) => option.id === downId) : undefined;
  const chosenDuration = durationId ? durations.find((option) => option.id === durationId) : undefined;
  const hasChoice = Boolean(chosenTree) || customSelected;

  const pickTier = (id: string) => {
    setTreeId(id);
    setCustom("");
  };

  const typeCustom = (raw: string) => {
    const digits = toWesternDigits(raw).replace(/\D/g, "");
    setCustom(digits);
    if (digits !== "") setTreeId(null);
  };

  // Only what was actually chosen travels; /register validates each id against the same lists.
  const params = new URLSearchParams();
  if (chosenTree) params.set("trees", chosenTree.id);
  else if (customSelected && customNumber !== null) params.set("trees_custom", String(customNumber));
  if (scenarioId) params.set("scenario", scenarioId);
  if (downId) params.set("down", downId);
  if (durationId) params.set("duration", durationId);
  const href = `/register?${params}`;

  const customHintAr = fillLimits(copy.customHint, customMin, customMax);
  const customHintFr = fillLimits(copy.customHintFr, customMin, customMax);
  const customPlaceholder = copy.customPlaceholderFr
    ? `${copy.customPlaceholder} · ${copy.customPlaceholderFr}`
    : copy.customPlaceholder;

  const treesValueAr = chosenTree
    ? chosenTree.label_ar
    : customSelected && customNumber !== null
      ? `${formatCount(customNumber)} ${copy.treesUnit}`
      : null;
  const treesValueFr = chosenTree
    ? chosenTree.label_fr
    : customSelected && customNumber !== null && copy.treesUnitFr
      ? `${formatCount(customNumber)} ${copy.treesUnitFr}`
      : null;

  // Read the summary out once the visitor pauses, not on every digit typed.
  const summaryText = [treesValueAr, chosenScenario?.label_ar, chosenDown?.label_ar, chosenDuration?.label_ar]
    .filter(Boolean)
    .join("، ");
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(summaryText ? `${copy.summaryTitle}: ${summaryText}` : ""), 900);
    return () => clearTimeout(timer);
  }, [summaryText, copy.summaryTitle]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">{breadcrumb}</div>

      <h1 className="font-display text-4xl font-bold text-balance text-forest sm:text-5xl">
        <Bi ar={copy.title} fr={copy.titleFr} frClassName="mt-1 text-[0.6em] text-muted" />
      </h1>
      {copy.subtitle ? (
        <p className="mt-3 max-w-2xl text-lg leading-8 text-muted">
          <Bi ar={copy.subtitle} fr={copy.subtitleFr} frClassName="text-[0.85em] leading-6 opacity-85" />
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          {/* 1 · The tiers, as the Back Office wrote them (LEAD-01), plus a free number. */}
          <fieldset>
            <legend className="sr-only">{copy.title}</legend>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {treeCounts.map((option) => {
                const tagline = option.code ? taglines[option.code] : undefined;
                return (
                  <li key={option.id}>
                    <label className={treeCardClass(treeId === option.id, "light")}>
                      <input
                        type="radio"
                        name={`${groupId}-trees`}
                        value={option.id}
                        checked={treeId === option.id}
                        onChange={() => pickTier(option.id)}
                        className="sr-only"
                      />
                      <TreeCardBody
                        labelAr={option.label_ar}
                        labelFr={option.label_fr}
                        trees={option.min_number}
                        taglineAr={tagline?.ar}
                        taglineFr={tagline?.fr}
                        tone="light"
                      />
                    </label>
                  </li>
                );
              })}

              <li>
                {/* The whole card focuses the field; the title alone names it for assistive tech. */}
                <label htmlFor={customInputId} id="custom" className={`${treeCardClass(customSelected, "light")} scroll-mt-24`}>
                  <OliveMark trees={customValid && customNumber !== null ? customNumber : 1} className="text-leaf" />
                  <span id={`${customInputId}-label`} className="font-display text-2xl font-bold leading-tight text-forest">
                    <Bi ar={copy.customLabel} fr={copy.customLabelFr} />
                  </span>
                  <input
                    id={customInputId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    dir="ltr"
                    maxLength={9}
                    value={custom}
                    onChange={(event) => typeCustom(event.target.value)}
                    placeholder={customPlaceholder}
                    aria-labelledby={`${customInputId}-label`}
                    aria-describedby={`${customInputId}-hint`}
                    aria-invalid={customInvalid || undefined}
                    className="field mt-3 text-center tabular-nums"
                  />
                  <span id={`${customInputId}-hint`} className={`block ${customInvalid ? "error-text" : "hint mt-1.5"}`}>
                    <Bi ar={customHintAr} fr={customHintFr} frClassName="text-[0.9em] opacity-85" />
                  </span>
                  {taglines.custom ? (
                    <>
                      <span aria-hidden="true" className="my-2 h-px w-10 bg-line-strong" />
                      <span className="text-sm leading-5 text-muted">
                        <Bi ar={taglines.custom.ar} fr={taglines.custom.fr} frClassName="text-[0.85em] opacity-80" />
                      </span>
                    </>
                  ) : null}
                </label>
              </li>
            </ul>
          </fieldset>

          {!hasChoice && copy.continueHint ? (
            <p className="mt-4 text-muted">
              <Bi ar={copy.continueHint} fr={copy.continueHintFr} frClassName="text-[0.85em] opacity-85" />
            </p>
          ) : null}

          {/* 2 · The rest only appears once the first question is answered, so the page never looks like a form.
              It stays while a typed number is being corrected, so earlier answers do not vanish mid-edit. */}
          {hasChoice || custom !== "" ? (
            <>
              <fieldset className="mt-10">
                <legend className="font-display text-2xl font-bold text-forest">
                  <Bi ar={copy.styleQuestion} fr={copy.styleQuestionFr} />
                </legend>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {scenarios.map((option) => (
                    <li key={option.id}>
                      <label className={`choice h-full items-start ${withPictures ? "sm:flex-col sm:items-stretch" : ""}`}>
                        <input
                          type="radio"
                          name={`${groupId}-scenario`}
                          value={option.id}
                          checked={scenarioId === option.id}
                          onChange={() => setScenarioId(option.id)}
                          className="sr-only"
                        />
                        <ScenarioVisual scenario={option} framed={withPictures} />
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink">
                            <Bi ar={option.label_ar} fr={option.label_fr} />
                          </span>
                          {option.description_ar ? (
                            <span className="mt-1 block text-sm leading-6 text-muted">
                              <Bi ar={option.description_ar} fr={option.description_fr} frClassName="text-[0.9em] opacity-85" />
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <fieldset className="mt-10">
                <legend className="font-display text-2xl font-bold text-forest">
                  <Bi ar={copy.capacityTitle} fr={copy.capacityTitleFr} />
                </legend>
                {copy.capacityHint ? (
                  <p className="hint mt-1">
                    <Bi ar={copy.capacityHint} fr={copy.capacityHintFr} frClassName="text-[0.9em] opacity-85" />
                  </p>
                ) : null}
                <ChipGroup
                  name={`${groupId}-down`}
                  labelAr={copy.rowDown}
                  labelFr={copy.rowDownFr}
                  options={downPayments}
                  value={downId}
                  onChange={setDownId}
                />
                <ChipGroup
                  name={`${groupId}-duration`}
                  labelAr={copy.rowDuration}
                  labelFr={copy.rowDurationFr}
                  options={durations}
                  value={durationId}
                  onChange={setDurationId}
                />
              </fieldset>
            </>
          ) : null}
        </div>

        {/* 3 · The summary follows the visitor down the page. */}
        <div className="space-y-4 lg:sticky lg:top-24">
          {/* Only where the photo and the summary both fit above the fold, so the button never hides below it. */}
          <div className="hidden [@media(min-width:64rem)_and_(min-height:64rem)]:block">{photo}</div>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-2xl font-bold text-forest">
              <Bi ar={copy.summaryTitle} fr={copy.summaryTitleFr} />
            </h2>
            <p role="status" className="sr-only">
              {announcement}
            </p>
            {/* PARC-02: only what the visitor picked, never a surface or a price derived from it. */}
            <dl className="mt-3 divide-y divide-line">
              <SummaryRow labelAr={copy.rowTrees} labelFr={copy.rowTreesFr} valueAr={treesValueAr} valueFr={treesValueFr} />
              <SummaryRow
                labelAr={copy.rowType}
                labelFr={copy.rowTypeFr}
                valueAr={chosenScenario?.label_ar ?? null}
                valueFr={chosenScenario?.label_fr ?? null}
              />
              <SummaryRow
                labelAr={copy.rowDown}
                labelFr={copy.rowDownFr}
                valueAr={chosenDown?.label_ar ?? null}
                valueFr={chosenDown?.label_fr ?? null}
              />
              <SummaryRow
                labelAr={copy.rowDuration}
                labelFr={copy.rowDurationFr}
                valueAr={chosenDuration?.label_ar ?? null}
                valueFr={chosenDuration?.label_fr ?? null}
              />
            </dl>

            {hasChoice ? (
              <Link href={href} className="btn mt-6 min-h-14 w-full bg-gold-bright text-lg text-forest-700 hover:bg-gold-soft">
                <span>
                  <Bi ar={copy.continue} fr={copy.continueFr} frClassName="text-[0.7em] text-forest-700/80" />
                </span>
              </Link>
            ) : (
              <span aria-disabled="true" className="btn mt-6 min-h-14 w-full cursor-not-allowed bg-line text-lg text-muted">
                <span>
                  <Bi ar={copy.continue} fr={copy.continueFr} frClassName="text-[0.7em] text-muted" />
                </span>
              </span>
            )}

            {copy.secureNote ? (
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted">
                <LockIcon />
                <span>
                  <Bi ar={copy.secureNote} fr={copy.secureNoteFr} frClassName="text-[0.95em] opacity-85" />
                </span>
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {values.length > 0 ? (
        <ul className="mt-12 grid gap-6 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((item, index) => (
            <li key={`${index}-${item.ar}`} className="flex items-start gap-3">
              <ValueIcon icon={item.icon} />
              <p className="text-sm leading-6 text-ink">
                <Bi ar={item.ar} fr={item.fr} frClassName="text-[0.9em] text-muted" />
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SummaryRow({
  labelAr,
  labelFr,
  valueAr,
  valueFr,
}: {
  labelAr: string;
  labelFr: string;
  valueAr: string | null;
  valueFr?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-muted">
        <Bi ar={labelAr} fr={labelFr} frClassName="text-[0.85em]" />
      </dt>
      {/* The French line is an LTR block, so "start" there is the same edge as "end" of the RTL cell. */}
      <dd className="text-end font-semibold text-ink">
        {valueAr ? <Bi ar={valueAr} fr={valueFr} frClassName="text-[0.78em] text-start text-muted" /> : "—"}
      </dd>
    </div>
  );
}

function ChipGroup({
  name,
  labelAr,
  labelFr,
  options,
  value,
  onChange,
}: {
  name: string;
  labelAr: string;
  labelFr: string;
  options: ChoiceOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="label">
        <Bi ar={labelAr} fr={labelFr} frClassName="text-[0.85em] text-muted" />
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.id} className="choice justify-center">
            <input
              type="radio"
              name={name}
              value={option.id}
              className="sr-only"
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="text-center">
              <span className="block font-semibold tabular-nums">
                <Bi ar={option.label_ar} fr={option.label_fr} frClassName="text-[0.78em] text-muted tabular-nums" />
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-3.5 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ValueIcon({ icon }: { icon: ValueIconKey }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "size-6 flex-none text-leaf",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (icon) {
    case "people":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 14.5c2.8 0 5 2.2 5 5.5" />
        </svg>
      );
    case "hand":
      return (
        <svg {...common}>
          <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6" />
          <path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V13" />
          <path d="M17 13v-1.5a1.5 1.5 0 0 1 3 0V15c0 3.9-3.1 7-7 7h-1.2c-2.2 0-4.2-1.1-5.4-2.9L4 15a1.6 1.6 0 0 1 2.6-1.9L8 15" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M6 16l4.5-5 3 3L19 7" />
          <path d="M15 7h4v4" />
        </svg>
      );
    default:
      // "leaf", and any key the Back Office JSON might carry that this build does not know yet.
      return (
        <svg {...common}>
          <path d="M4 20C6 10 12 5 21 4c-1 9-6 15-16 16z" />
          <path d="M4 20l8-8" />
        </svg>
      );
  }
}
