import type { ReactNode } from "react";

import { getPublicConfig, pickTexts } from "@/lib/config";
import { TextProvider } from "@/lib/i18n/client";

/**
 * Hands the owner's texts under `prefixes` to the Client Components inside, in the request's language:
 *
 *   <Texts prefixes={["ui.login."]}>
 *     <ClientLoginForm … />
 *   </Texts>
 *
 * and inside the form, `const t = useT(); t("ui.login.phone_label")`. Server Components do not need this —
 * they call `t(config, key)` directly.
 */
export async function Texts({ prefixes, children }: { prefixes: readonly string[]; children: ReactNode }) {
  const config = await getPublicConfig();
  return <TextProvider texts={pickTexts(config, prefixes)}>{children}</TextProvider>;
}
