"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { GrowthIcon } from "@/components/site/growth-icon";

type TreeOption = { id: string; code: string | null; label_ar: string; min_number: number | null };
type Scenario = { id: string; code: string; label_ar: string; description_ar: string | null; is_any: boolean };

type MillionStartProps = {
  treeCounts: TreeOption[];
  scenarios: Scenario[];
  treesQuestion: string;
  styleQuestion: string;
};

/** Growth stage icon per seeded scenario; unknown codes fall back to the generic leaf. */
const SCENARIO_ICONS: Record<string, string> = {
  big_productive: "productive",
  intensive_grove: "near_production",
  bare_land: "bare_land",
  young_trees: "young_olive",
};

/**
 * Two questions, then the form (MIL-01).
 *
 * The visitor picks a number of olive trees and how they want the grove to be; both travel to
 * /register as query parameters, so the wizard opens with those answers already filled in and
 * nobody is asked the same thing twice.
 */
export function MillionStart({ treeCounts, scenarios, treesQuestion, styleQuestion }: MillionStartProps) {
  const [trees, setTrees] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const groupId = useId();

  const href = `/register?${new URLSearchParams({
    ...(trees ? { trees } : {}),
    ...(scenario ? { scenario } : {}),
  })}`;

  return (
    <section id="start" className="scroll-mt-20 bg-forest text-paper">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <fieldset>
          <legend className="font-display text-3xl font-bold sm:text-4xl">{treesQuestion}</legend>
          <p className="mt-2 text-paper/75">اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب.</p>

          <ul className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {treeCounts.map((option) => (
              <li key={option.id}>
                <label
                  className={`flex h-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-6 text-center transition-colors ${
                    trees === option.id
                      ? "border-gold-bright bg-paper/12"
                      : "border-paper/20 hover:border-paper/45 hover:bg-paper/6"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${groupId}-trees`}
                    value={option.id}
                    checked={trees === option.id}
                    onChange={() => setTrees(option.id)}
                    className="sr-only"
                  />
                  {/* The label already carries the number and the unit, exactly as the Back Office wrote it. */}
                  <span
                    className={`font-display font-bold leading-tight ${
                      option.min_number ? "text-3xl text-gold-bright" : "text-2xl text-paper"
                    }`}
                  >
                    {option.label_ar}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {/* The second question only appears once the first is answered, so the page never looks like a form. */}
        {trees ? (
          <fieldset className="mt-12">
            <legend className="font-display text-3xl font-bold sm:text-4xl">{styleQuestion}</legend>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scenarios.map((option) => (
                <li key={option.id}>
                  <label
                    className={`flex h-full cursor-pointer gap-3 rounded-2xl border-2 p-5 transition-colors ${
                      scenario === option.id
                        ? "border-gold-bright bg-paper/12"
                        : "border-paper/20 hover:border-paper/45 hover:bg-paper/6"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${groupId}-scenario`}
                      value={option.id}
                      checked={scenario === option.id}
                      onChange={() => setScenario(option.id)}
                      className="sr-only"
                    />
                    <GrowthIcon
                      code={SCENARIO_ICONS[option.code] ?? "unknown"}
                      className="size-8 flex-none text-gold-bright"
                    />
                    <span>
                      <span className="block font-semibold">{option.label_ar}</span>
                      {option.description_ar ? (
                        <span className="mt-1 block text-sm leading-6 text-paper/70">{option.description_ar}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}

        {trees ? (
          <div className="mt-10">
            <Link href={href} className="btn min-h-14 bg-gold-bright px-8 text-lg text-forest-700 hover:bg-gold-soft">
              كمّل مطلبك
            </Link>
            <p className="mt-3 text-sm text-paper/70">
              {scenario ? "باقي المكان والقدرة المالية." : "تنجم تكمّل من غير ما تختار النوع، ونقترحولك."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
