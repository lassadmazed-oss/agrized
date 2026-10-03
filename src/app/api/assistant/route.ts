import { headers } from "next/headers";
import { z } from "zod";

import {
  askAssistant,
  assistantEnabled,
  buildAssistantContext,
  type AssistantTurn,
} from "@/lib/assistant";
import { getPublicConfig, settingInt, t } from "@/lib/config";
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, type Locale } from "@/lib/i18n/locales";
import { localeHeaders } from "@/lib/i18n/server";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One question to the site assistant (0080).
 *
 * The OpenAI key never leaves the server: the browser posts a question here and gets text back. Nothing
 * about the model, the limits or the copy is decided in this file — they are rows in `settings`, read on
 * every request, so the owner can change the model or switch the whole thing off without a deploy.
 *
 * The visitor is anonymous. The only thing recorded about them is the salted ip hash the intake forms
 * already use, and it exists to rate-limit and to group one person's questions in the Back Office.
 *
 * THE LANGUAGE COMES WITH THE QUESTION (0109). The proxy, which names the language of every page request, does
 * not run on /api, so the bubble sends its page's language in the same `x-agrized-locale` header itself. It is
 * a claim from the browser and treated as one: anything but one of the five codes is Arabic. It decides only
 * which words come back — the window's sentences and the language the model is told to answer in.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().min(1).max(2000),
  // Only the last few turns are carried: the context is rebuilt from the database every time, so history
  // is for the thread of conversation, not for facts.
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(8)
    .optional(),
});

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const claimed = requestHeaders.get(LOCALE_HEADER);
  const locale: Locale = isLocale(claimed) ? claimed : DEFAULT_LOCALE;
  const config = await getPublicConfig(locale);

  // The flag is the switch. 'disabled' means the endpoint does not exist, not that it answers politely.
  if (!assistantEnabled(config)) {
    return Response.json({ ok: false, message: t(config, "assistant.unavailable") }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, message: t(config, "ui.assistant.error_bad_request") }, { status: 400 });
  }

  const context = await buildAssistantContext(locale);
  const question = parsed.data.question.trim();

  if (question.length > context.maxQuestionChars) {
    return Response.json(
      { ok: false, message: t(config, "ui.assistant.error_too_long", { max: context.maxQuestionChars }) },
      { status: 400 },
    );
  }

  // The validated language, not whatever the browser sent, is what the database is told the visitor reads.
  const supabase = createAdminClient({ ...auditHeaders(requestHeaders), ...localeHeaders(locale) });
  const ipHash = hashIp(clientIp(requestHeaders));

  // Throttle and record the question in one call; it raises 'rate_limited' when the visitor has had their
  // hour's worth.
  // A visitor whose IP header is missing is bucketed together under one key rather than waved through.
  // The intake forms skip the throttle in that case because the cost of a form is a row; here every
  // question is money at OpenAI, so the unknown bucket fails closed.
  const { data: turnId, error: beginError } = await supabase.rpc("assistant_begin_turn", {
    p_ip_hash: ipHash ?? "unknown-origin",
    p_question: question,
  });

  if (beginError) {
    if (beginError.message.includes("rate_limited")) {
      return Response.json(
        { ok: false, message: t(config, "assistant.rate_limited") },
        { status: 429 },
      );
    }
    console.error("assistant_begin_turn failed", beginError);
    return Response.json({ ok: false, message: t(config, "assistant.unavailable") }, { status: 503 });
  }

  const maxAnswerChars = settingInt(config, "assistant.max_answer_chars", 700);
  const history = (parsed.data.history ?? []) as AssistantTurn[];
  const reply = await askAssistant(context, history, question, maxAnswerChars);

  if (!reply.ok) {
    console.error("assistant answer failed:", reply.error);
    await supabase.rpc("assistant_finish_turn", {
      p_id: turnId,
      p_answer: "",
      p_model: context.model,
      p_tokens_in: 0,
      p_tokens_out: 0,
      p_error: reply.error,
    });
    // The reason stays in the log and in the server output; the visitor gets the owner's line, in their language.
    return Response.json({ ok: false, message: t(config, "assistant.unavailable") }, { status: 502 });
  }

  await supabase.rpc("assistant_finish_turn", {
    p_id: turnId,
    p_answer: reply.answer,
    p_model: reply.model,
    p_tokens_in: reply.tokensIn,
    p_tokens_out: reply.tokensOut,
    p_error: undefined,
  });

  // `allowedHrefs` travels with the answer so the browser can tell a real offer link from an invented one,
  // and `offers` travels with it so an answer that names an offer can END in that offer — a card with its
  // place, its price and a button — instead of a two-word link inside a sentence. Both describe the same
  // rows the model was given, so the chat can never draw a card for an offer the answer could not see.
  return Response.json({
    ok: true,
    answer: reply.answer,
    allowedHrefs: context.allowedHrefs,
    offers: context.offerCards,
  });
}
