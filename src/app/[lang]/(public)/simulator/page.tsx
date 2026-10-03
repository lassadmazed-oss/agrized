import { redirect } from "next/navigation";

import { localePath } from "@/lib/i18n/locales";
import { currentLocale } from "@/lib/i18n/server";

// docs/plan-zitouna.md P6-1 (owner, 2026-09-15): the capacity simulator asked for a monthly installment, which the
// tree pricing no longer uses. The calculator on /start replaces it, so old links and bookmarks land there — in
// the language they were in.
export default async function SimulatorPage() {
  redirect(localePath(await currentLocale(), "/start"));
}
