import "server-only";

import { flagState, getPublicConfig, settingJson, settingText, type PublicConfig } from "@/lib/config";
import { PRODUCTION_LABELS } from "@/lib/crm";
import { formatMillimes } from "@/lib/format";
import { IRRIGATION_LABELS } from "@/lib/land";
import { getPublicProjects } from "@/lib/public-projects";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The site assistant (spec: the visitor-facing guide, 0080).
 *
 * WHY THE CONTEXT IS BUILT PER REQUEST. The model is told nothing at build time. Every answer is grounded
 * in the rows the public site is serving at that moment — the same `public_projects` the offers page reads
 * as an anonymous visitor, and the same `settings` copy the footer prints. An offer unpublished in the Back
 * Office is gone from the assistant's next answer without a deploy, and a price it has never been told it
 * cannot state.
 *
 * WHY THE MODEL IS NOT TRUSTED WITH LINKS. It is asked for markdown links, but what it returns is treated
 * as a suggestion: `assistantLinkTargets()` lists the paths that exist, and the client renders a link only
 * when the href is one of them (see safe-links.ts). A hallucinated `/projects/DEMO-99` is printed as plain
 * text, never as a link into a 404.
 */

/** Everything the assistant is allowed to know, rendered as the text the model receives. */
/**
 * One offer, as the chat can DRAW it.
 *
 * The model is handed the offers as prose, because prose is what it reasons over. The browser is handed the
 * same offers as data, because an answer that names one should end in something a thumb can press — not a
 * two-word link buried in a paragraph (owner, 2026-09-24: «I want it to open a button or a box that leads to
 * the offer»). Both come out of the same rows in the same call, so a card under an answer can never describe
 * an offer the answer itself was not allowed to see.
 */
export type AssistantOfferCard = {
  code: string;
  name: string;
  /** «نابل · قربة» — the governorate, and the place inside it when the offer names one. */
  place: string;
  /** «من 167 د.ت للزيتونة», or null while the price is unannounced. */
  priceFrom: string | null;
  href: string;
};

/** Everything the assistant is allowed to know, rendered as the text the model receives. */
export type AssistantContext = {
  system: string;
  /** The internal paths that exist right now; the client will not render a link to anything else. */
  allowedHrefs: string[];
  /** The same open offers the prose describes, for the cards drawn under an answer. */
  offerCards: AssistantOfferCard[];
  model: string;
  maxQuestionChars: number;
};

export type AssistantTurn = { role: "user" | "assistant"; content: string };

export type AssistantReply =
  | { ok: true; answer: string; model: string; tokensIn: number; tokensOut: number }
  | { ok: false; error: string };

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * The settings the visitor must not read.
 *
 * `getPublicConfig()` selects `is_public = true` — it is what the browser is allowed to see. The model
 * name, the persona and the spend limits are deliberately not public, so reading them through it returns
 * the fallbacks and nothing ever changes: the first draft of this file did exactly that, and switching
 * `assistant.model` in the Back Office silently did nothing at all.
 *
 * They are read here with the service-role client instead, the same way `readSmsConfig` reads the SMS
 * credentials, and on every request — so a change in the Back Office applies to the next question.
 */
type PrivateSettings = {
  model: string;
  persona: string;
  maxOffers: number;
  maxAnswerChars: number;
  maxQuestionChars: number;
};

const PRIVATE_DEFAULTS: PrivateSettings = {
  model: "gpt-4o-mini",
  persona: "",
  maxOffers: 14,
  maxAnswerChars: 700,
  maxQuestionChars: 400,
};

async function readPrivateSettings(): Promise<PrivateSettings> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", [
      "assistant.model",
      "assistant.persona",
      "assistant.max_offers",
      "assistant.max_answer_chars",
      "assistant.max_question_chars",
    ]);

  if (error || !data) return PRIVATE_DEFAULTS;

  const byKey = new Map(data.map((row) => [row.key, row.value]));
  const text = (key: string, fallback: string) => {
    const value = byKey.get(key);
    return typeof value === "string" && value.trim() !== "" ? value : fallback;
  };
  const count = (key: string, fallback: number) => {
    const value = byKey.get(key);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

  return {
    model: text("assistant.model", PRIVATE_DEFAULTS.model),
    persona: text("assistant.persona", PRIVATE_DEFAULTS.persona),
    maxOffers: count("assistant.max_offers", PRIVATE_DEFAULTS.maxOffers),
    maxAnswerChars: count("assistant.max_answer_chars", PRIVATE_DEFAULTS.maxAnswerChars),
    maxQuestionChars: count("assistant.max_question_chars", PRIVATE_DEFAULTS.maxQuestionChars),
  };
}

/** Is the assistant switched on for the public site at all? */
export function assistantEnabled(config: PublicConfig): boolean {
  return flagState(config, "assistant") === "public";
}

/**
 * One line per offer, in the order the catalogue shows them.
 *
 * Only what a visitor can already read on /projects goes in. Prices arrive as integer millimes and are
 * formatted here, because a model handed `450000` will cheerfully tell someone an olive tree costs four
 * hundred and fifty thousand dinars.
 */
function describeOffers(
  offers: Awaited<ReturnType<typeof getPublicProjects>>,
  config: PublicConfig,
  limit: number,
): { text: string; hrefs: string[]; cards: AssistantOfferCard[] } {
  const govName = new Map(config.governorates.map((g) => [g.id, g.name_ar]));
  const open = offers.filter((o) => o.offered).slice(0, limit);

  if (open.length === 0) {
    return { text: "ما فماش عروض مفتوحة توّا.", hrefs: [], cards: [] };
  }

  const lines = open.map((o) => {
    const bits: string[] = [`«${o.name}» (الرمز ${o.code}, الرابط /projects/${o.code})`];
    const gov = govName.get(o.governorate_id);
    if (gov) bits.push(`الولاية: ${gov}`);
    if (o.location_description) bits.push(`الموقع: ${o.location_description}`);
    if (o.olive_variety) bits.push(`الصنف: ${o.olive_variety}`);
    if (o.tree_age_years !== null) bits.push(`عمر الزياتين: ${Math.round(o.tree_age_years)} سنة`);
    // The same Arabic labels the offer pages print. Handed the raw 'rainfed' the model repeats it in
    // English, in the middle of an Arabic sentence, to a Tunisian reader.
    if (o.irrigation) bits.push(`الري: ${IRRIGATION_LABELS[o.irrigation as keyof typeof IRRIGATION_LABELS] ?? o.irrigation}`);
    if (o.production_status) bits.push(`الحالة: ${PRODUCTION_LABELS[o.production_status] ?? o.production_status}`);
    if (o.tree_count !== null) bits.push(`عدد الزياتين في الضيعة: ${o.tree_count}`);
    if (o.min_price_per_tree_millimes !== null) {
      bits.push(`السوم يبدا من ${formatMillimes(o.min_price_per_tree_millimes)} للزيتونة`);
    } else {
      bits.push("السوم ما زال ما تعلنش");
    }
    if (o.area_per_tree_min_m2 !== null) bits.push(`المساحة للزيتونة: من ${o.area_per_tree_min_m2} م²`);
    return `- ${bits.join(" · ")}`;
  });

  const cards: AssistantOfferCard[] = open.map((o) => ({
    code: o.code,
    name: o.name,
    place: govName.get(o.governorate_id) ?? "",
    priceFrom:
      o.min_price_per_tree_millimes !== null
        ? `من ${formatMillimes(o.min_price_per_tree_millimes)} للزيتونة`
        : null,
    href: `/projects/${o.code}`,
  }));

  return { text: lines.join("\n"), hrefs: open.map((o) => `/projects/${o.code}`), cards };
}

/**
 * The instructions. Tone comes from `assistant.persona` (a row), the rules do not: they are what keeps the
 * thing honest, and they are not an editable business value.
 */
export async function buildAssistantContext(): Promise<AssistantContext> {
  const [config, offers, priv] = await Promise.all([
    getPublicConfig(),
    getPublicProjects("anon"),
    readPrivateSettings(),
  ]);

  const maxAnswer = priv.maxAnswerChars;
  const described = describeOffers(offers, config, priv.maxOffers);

  const phone = settingText(config, "site.contact_phone", "");
  const persona = priv.persona;

  // The routes a visitor can be sent to. Everything else the model writes stays plain text.
  // «/#how» is not here any more: the four steps were part of the wide screen's own home page, which the
  // one-composition rebuild removed (owner, 2026-09-23). A model allowed to link to an anchor nothing
  // renders would send a visitor to the top of the page and call it an answer.
  const allowedHrefs = ["/projects", "/start", "/register", "/land", "/#million", ...described.hrefs];

  /*
   * A NOTE ON HOW THIS IS WORDED, because it was got wrong once and the symptom was baffling.
   *
   * An earlier draft put the style rule («answer in Tunisian Arabic, short») as the first bullet under a
   * heading that said «الممنوع» — forbidden. Small models read the heading, not the intent: the assistant
   * began refusing almost everything, including the questions it exists to answer. The headings below are
   * therefore honest about what they contain, and every prohibition names the thing prohibited rather than
   * being inferred from where it sits.
   *
   * The same reason drives the worked examples. «Compare two or three offers» is abstract; a model shown
   * what a good answer looks like copies its shape.
   */
  const system = [
    persona,
    "",
    "مهمتك: تعاون الزائر يفهم العروض ويلقى اللي يناسبو، وتوجّهو للفورمولير. إنت مرشد، موش بيّاع.",
    "",
    "الأسلوب:",
    `- بالعربي التونسي، جمل قصيرة، ${maxAnswer} حرف على الأكثر، وبلا مقدّمات.`,
    "- بلا تنسيق: بلا عناوين، بلا نجوم، بلا قوائم مرقّمة طويلة.",
    "",
    "خدمتك — هذا اللي لازمك تعملو، وما تتهرّبش منو:",
    "- كي يسألك على العروض، ولاّ على «أحسن عرض»، ولاّ شنوّة يناسبو: قارنلو بين زوز ولاّ ثلاثة عروض",
    "  من القائمة اللي تحت، بالمعطيات اللي عندك (الولاية، السوم، عمر الزياتين، الري، الصنف)،",
    "  وقلّو كل واحد يناسب شكون.",
    "- قبل ما تجاوب، دوّر في قائمة العروض. كان ذكر بلاصة (قربة، صفاقس، جرجيس…) لوّج على العرض اللي",
    "  إسمو ولاّ ولايتو فيها، وجاوب عليه بإسمو.",
    "- كان طلب صفة (مسقية، زياتين صغار، زياتين كبار…) عدّدلو العروض اللي فيها الصفة هذي.",
    "- كي يعطيك ميزانيتو: إحسبلو قدّاش زيتونة ينجّم ياخذ = الميزانية ÷ سوم الزيتونة، وقرّب للتحت.",
    "  إحسب برك على العروض اللي سومها أصغر ولاّ يساوي الميزانية; اللي أغلى قول عليه «أغلى من",
    "  ميزانيتك» وما تحسبش.",
    "- كمّل ديما بخطوة: رابط العرض، ولاّ /start كي يكون محيّر.",
    "- كل عرض تسمّيه في جوابك، إكتب إسمو كرابط [الإسم](/projects/الرمز) — حتى كان سمّيت زوز ولاّ ثلاثة.",
    "  العرض اللي تكتبو بلا رابط، الزائر ما ينجّمش يحلّو.",
    "",
    "أمثلة على جواب مليح:",
    "س: «نحب أرض مسقية.» ج: «عندنا [إسم العرض](/projects/الرمز) في [الولاية]، مسقي، زياتين عمرهم",
    "   [العدد] سنة. وفما زادة [إسم عرض آخر](/projects/الرمز). تحب تفاصيل على واحد منهم؟»",
    "س: «قدّاش السوم في [بلاصة]؟» وكان السوم ما تعلنش: ج: «السوم ما زال ما تعلنش في [إسم العرض].",
    "   سجّل اهتمامك في [الفورمولير](/register) والفريق يعطيك السوم.»",
    "س: «نستثمر ولاّ لا؟» ج: «القرار قرارك، ما ننصحكش. أما نجّم نقارنلك العروض باش تشوف شنوّة",
    "   يناسبك — قلّي وين تحب وقدّاش تحب تبدا.»",
    "",
    "ممنوع عليك:",
    "- ممنوع تخترع أرقام. كل سوم، كل عدد زياتين، كل معطى: من قائمة العروض اللي تحت برك.",
    "- ممنوع تضمن إنتاج ولا مردود ولا ربح، وممنوع تحسب أرباح مستقبلية. الأرقام الكل تقديرية.",
    "- ممنوع تقولّو «إستثمر» ولاّ «ما تستثمرش». قرار الشراء متاعو هو.",
    "- ممنوع تطلب منّو معطيات شخصية في الشات. التسجيل يتعمل في الفورمولير.",
    "- كي ما تعرفش الجواب، قول ما تعرفش ووجّهو للفورمولير ولاّ للتلفون. ما تخمّنش.",
    "",
    "الروابط: كي تنصح بعرض ولاّ توجّه لصفحة، إكتب الرابط بالشكل هذا [النص](/الرابط).",
    "الروابط الوحيدة اللي تنجّم تستعملها:",
    "- /projects — قائمة العروض الكل",
    "- /start — الحاسبة: أسئلة قصيرة ونقترحولو اللي يناسبو (أحسن حل كي يكون محيّر)",
    "- /register — تسجيل الاهتمام مباشرة",
    "- /land — كي يكون عندو هو أرض ولاّ ضيعة يحب يعرضها علينا",
    "- /projects/الرمز — صفحة عرض معيّن، كيما /projects/DEMO-13",
    "ما تخترعش رابط. كان الرمز موش في القائمة، ما تكتبش رابط.",
    "",
    phone ? `تلفون AgriZed: ${phone}` : "",
    "",
    "قائمة العروض المفتوحة توّا (هذي وحدها مصدر المعطيات متاعك):",
    described.text,
  ].join("\n");

  return {
    system,
    allowedHrefs,
    offerCards: described.cards,
    model: priv.model,
    maxQuestionChars: priv.maxQuestionChars,
  };
}

/** The starter buttons and the window's copy, read by the server component that mounts the widget. */
export function assistantCopy(config: PublicConfig) {
  return {
    title: settingText(config, "assistant.title", "مساعد AgriZed"),
    tagline: settingText(config, "assistant.tagline", ""),
    greeting: settingText(config, "assistant.greeting", ""),
    suggestions: settingJson<string[]>(config, "assistant.suggestions", []),
    unavailable: settingText(config, "assistant.unavailable", "المساعد مش متوفّر توّا."),
  };
}

/**
 * Asks the model. Returns a reason rather than throwing: a failed answer is a message in the window, never
 * a broken page.
 *
 * `max_completion_tokens` is set from the character budget — Arabic runs roughly one token per two
 * characters on these tokenizers, so the budget is doubled and rounded up, with a floor that keeps short
 * budgets from truncating a sentence mid-word.
 */
export async function askAssistant(
  context: AssistantContext,
  history: AssistantTurn[],
  question: string,
  maxAnswerChars: number,
): Promise<AssistantReply> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY is not set" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        model: context.model,
        temperature: 0.4,
        max_completion_tokens: Math.max(320, Math.ceil(maxAnswerChars / 2) + 120),
        messages: [
          { role: "system", content: context.system },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
          { role: "user", content: question },
        ],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `openai ${response.status}: ${text.slice(0, 300)}` };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, error: `openai returned non-JSON: ${text.slice(0, 200)}` };
    }

    const record = payload as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const answer = record.choices?.[0]?.message?.content?.trim();
    if (!answer) return { ok: false, error: "openai returned no message" };

    return {
      ok: true,
      answer,
      model: record.model ?? context.model,
      tokensIn: record.usage?.prompt_tokens ?? 0,
      tokensOut: record.usage?.completion_tokens ?? 0,
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `openai request failed: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}
