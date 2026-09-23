import { headers } from "next/headers";
import { z } from "zod";

import {
  askAssistant,
  assistantEnabled,
  buildAssistantContext,
  type AssistantTurn,
} from "@/lib/assistant";
import { getPublicConfig, settingInt, settingText } from "@/lib/config";
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
  const config = await getPublicConfig();

  // The flag is the switch. 'disabled' means the endpoint does not exist, not that it answers politely.
  if (!assistantEnabled(config)) {
    return Response.json({ ok: false, message: settingText(config, "assistant.unavailable") }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, message: "السؤال ما وصلش كيما يلزم. عاود." }, { status: 400 });
  }

  const context = await buildAssistantContext();
  const question = parsed.data.question.trim();

  if (question.length > context.maxQuestionChars) {
    return Response.json(
      { ok: false, message: `السؤال طويل برشة. إختصرو في ${context.maxQuestionChars} حرف.` },
      { status: 400 },
    );
  }

  const requestHeaders = await headers();
  const supabase = createAdminClient(auditHeaders(requestHeaders));
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
        { ok: false, message: settingText(config, "assistant.rate_limited") },
        { status: 429 },
      );
    }
    console.error("assistant_begin_turn failed", beginError);
    return Response.json({ ok: false, message: settingText(config, "assistant.unavailable") }, { status: 503 });
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
    // The reason stays in the log and in the server output; the visitor gets the Arabic line.
    return Response.json({ ok: false, message: settingText(config, "assistant.unavailable") }, { status: 502 });
  }

  await supabase.rpc("assistant_finish_turn", {
    p_id: turnId,
    p_answer: reply.answer,
    p_model: reply.model,
    p_tokens_in: reply.tokensIn,
    p_tokens_out: reply.tokensOut,
    p_error: undefined,
  });

  // `allowedHrefs` travels with the answer so the browser can tell a real offer link from an invented one.
  return Response.json({ ok: true, answer: reply.answer, allowedHrefs: context.allowedHrefs });
}
