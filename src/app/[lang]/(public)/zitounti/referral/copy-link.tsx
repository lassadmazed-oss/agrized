"use client";

import { useState } from "react";

import { useT } from "@/lib/i18n/client";

/** The client's referral link, written out (left-to-right whatever the page reads) with a button that copies it. */
export function CopyLink({ link }: { link: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2">
      <p dir="ltr" className="break-all rounded-xl bg-paper px-3 py-2 text-start font-mono text-sm text-ink">
        {link}
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            // A refused clipboard changes nothing: the link is on screen to select by hand.
          }
        }}
        className="btn btn-secondary w-full border-line"
      >
        <span aria-live="polite">{copied ? t("ui.referral.copied") : t("ui.referral.copy")}</span>
      </button>
    </div>
  );
}
