"use client";

import { useState } from "react";

/** One ad link, readable and selectable, with a button that copies it. */
export function CopyLink({ label, href }: { label: string; href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 flex-none text-xs font-semibold text-muted">{label}</span>
      <input
        readOnly
        value={href}
        dir="ltr"
        onFocus={(event) => event.target.select()}
        className="field field-sm min-w-0 flex-1 text-left font-mono text-xs"
        aria-label={label}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(href);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            // A refused clipboard: the link is selected in the field for a manual copy.
          }
        }}
        className="btn btn-secondary btn-sm flex-none"
      >
        <span aria-live="polite">{copied ? "تنسخ" : "انسخ"}</span>
      </button>
    </div>
  );
}
