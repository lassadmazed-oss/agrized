"use server";

import { z } from "zod";

import { PAYMENT_MODES, publicTreeQuote, type TreeQuote } from "@/lib/tree-pricing";

const quoteSchema = z.object({
  spacingClassId: z.uuid(),
  // Postgres integer range only; the RPC applies the Back Office limits and answers trees = null outside them.
  trees: z.number().int().min(1).max(2_147_483_647).nullable(),
  paymentMode: z.enum(PAYMENT_MODES).nullable(),
  downPercentOptionId: z.uuid().nullable(),
  durationOptionId: z.uuid().nullable(),
});

export type QuoteStartInput = z.input<typeof quoteSchema>;

/** Areas and prices for the /start summary, computed by public_tree_quote for the caller. */
export async function quoteStart(input: QuoteStartInput): Promise<TreeQuote | null> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return null;
  return publicTreeQuote(parsed.data);
}
