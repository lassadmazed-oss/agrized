"use client";

import type { ReactNode } from "react";

import { ChoicePanel, useChoicePanel } from "@/components/site/choice-panel";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatPhoneFor } from "@/lib/phone";

/**
 * «اتصل بينا» opens a choice (owner, 2026-10-05: «for the call buttons make a popup to choose between either
 * direct call or call WhatsApp, something nice and clean»): a plain phone call, or WhatsApp — where the
 * visitor calls or writes, whichever suits them; for the many who live abroad it is the line they use anyway.
 *
 * Every call button on the site goes through here, so the choice is the same everywhere: the footer, the home
 * page's last section, the tracking page, the sign-in screen. The trigger is the caller's (`children`,
 * `className`); the panel is the site's one chooser (choice-panel.tsx) — a sheet on a phone, a dropdown on a
 * wide screen.
 *
 * WhatsApp uses `site.contact_whatsapp`, and the phone number when that is empty: in Tunisia the business line
 * is almost always the WhatsApp line too. An empty phone means no button at all — the caller does not render
 * this.
 */
export function CallChooser({
  phone,
  whatsapp,
  className = "",
  ariaLabel,
  children,
}: {
  /** E.164, from site.contact_phone. */
  phone: string;
  /** E.164, from site.contact_whatsapp; the phone number when empty. */
  whatsapp?: string | null;
  className?: string;
  /** The trigger's spoken name when its content is only an icon. */
  ariaLabel?: string;
  children: ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const { panel, toggle, close, triggerRef, panelRef, panelId, titleId } = useChoicePanel({ dropdownOnWide: true });

  const dial = phone.replace(/[^\d+]/g, "");
  const chat = (whatsapp?.trim() ? whatsapp : phone).replace(/\D/g, "");

  const rows = (kind: "sheet" | "dropdown") => {
    const row = `flex items-center gap-3 rounded-2xl px-3 outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-forest/40 ${
      kind === "sheet" ? "min-h-[4.25rem]" : "min-h-14"
    }`;
    return (
      <>
        <a href={`tel:${dial}`} data-autofocus="" onClick={close} className={row}>
          <span className="grid size-11 flex-none place-items-center rounded-full bg-leaf-soft text-forest">
            <PhoneMark />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">{t("ui.common.call_direct")}</span>
            {/* The line keeps the row's direction (so it starts under the title), the number inside it reads
                left to right. */}
            <span className="block text-caption tabular-nums text-muted">
              <span dir="ltr">{formatPhoneFor(phone, locale)}</span>
            </span>
          </span>
          <ForwardMark />
        </a>
        <a href={`https://wa.me/${chat}`} target="_blank" rel="noopener noreferrer" onClick={close} className={row}>
          <span className="grid size-11 flex-none place-items-center rounded-full bg-[#25d366]/12 text-[#128c4a]">
            <WhatsAppMark />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">{t("ui.common.call_whatsapp")}</span>
            <span className="block text-caption text-muted">{t("ui.common.call_whatsapp_note")}</span>
          </span>
          <ForwardMark />
        </a>
      </>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={panel !== null}
        aria-controls={panel ? panelId : undefined}
        aria-label={ariaLabel}
        onClick={toggle}
        className={className}
      >
        {children}
      </button>
      <ChoicePanel
        state={panel}
        panelRef={panelRef}
        panelId={panelId}
        titleId={titleId}
        title={t("ui.common.call_title")}
        icon={<PhoneMark />}
        closeLabel={t("ui.common.close")}
        onClose={close}
      >
        {rows}
      </ChoicePanel>
    </>
  );
}

export function PhoneMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.4 16.6v2.6a1.7 1.7 0 0 1-1.9 1.7 16.9 16.9 0 0 1-7.4-2.6 16.6 16.6 0 0 1-5.1-5.1A16.9 16.9 0 0 1 3.4 5.7 1.7 1.7 0 0 1 5.1 3.8h2.6a1.7 1.7 0 0 1 1.7 1.5c.1.8.3 1.7.6 2.5a1.7 1.7 0 0 1-.4 1.8l-1.1 1.1a13.6 13.6 0 0 0 5.1 5.1l1.1-1.1a1.7 1.7 0 0 1 1.8-.4c.8.3 1.7.5 2.5.6a1.7 1.7 0 0 1 1.5 1.7Z" />
    </svg>
  );
}

export function WhatsAppMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="currentColor">
      <path d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.2 21.8l5.1-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-3-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.2.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.3Z" />
    </svg>
  );
}

/** Forward at the end of a row: drawn pointing left for Arabic, mirrored for the left-to-right languages. */
function ForwardMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-4 flex-none text-muted ltr:-scale-x-100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 6 8.5 12l6 6" />
    </svg>
  );
}
