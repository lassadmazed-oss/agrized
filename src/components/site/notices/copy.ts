import "server-only";

import { t, type PublicConfig } from "@/lib/config";

import type { NoticeBellCopy } from "./notice-bell";

/** The bell's words (0174), in the page's language. */
export function noticeBellCopy(config: PublicConfig): NoticeBellCopy {
  return {
    title: t(config, "ui.notices.title"),
    open: t(config, "ui.notices.open"),
    empty: t(config, "ui.notices.empty"),
    close: t(config, "ui.notices.close"),
    dismiss: t(config, "ui.notices.dismiss"),
    fresh: t(config, "ui.notices.new"),
  };
}
