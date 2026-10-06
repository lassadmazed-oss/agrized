"use client";

import { useState, type ReactNode } from "react";

import { ChoicePanel, useChoicePanel } from "@/components/site/choice-panel";
import { WhatsAppMark } from "@/components/site/call-chooser";
import { useT } from "@/lib/i18n/client";

/**
 * «شارك · Partager» (owner, 2026-10-06: «add share button on the website, partager»).
 *
 * One chooser, the site's own (choice-panel.tsx — a sheet on a phone, a dropdown on a wide screen), with the
 * places a Tunisian actually sends a link: WhatsApp first, then Facebook, Telegram, an e-mail, the link itself,
 * and — where the phone has one — its own share sheet for everything else.
 *
 * WHAT IS SHARED is the page the visitor is on (or `url` when the caller names another), without its #anchor,
 * with `?ref=<channel>` added: SourceCapture already records `ref` on the first visit, so a request that arrives
 * through a shared link carries «whatsapp», «facebook»… into the CRM and the owner can see which shares bring
 * people. The message is the page's own title in the visitor's language, or `text` when the caller has a better
 * one («ابعثها لصاحبك اللي برّا»).
 *
 * The trigger is the caller's (`children`, `className`) — an icon in the header, a labelled button on an offer.
 */
export function ShareButton({
  url,
  text,
  className = "",
  ariaLabel,
  children,
}: {
  /** What to share: a site path («/projects/OFF-1») or an absolute address. The current page when absent. */
  url?: string;
  /** The words sent with the link. The page's title when absent. */
  text?: string;
  className?: string;
  /** The trigger's spoken name when its content is only an icon. */
  ariaLabel?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const { panel, toggle, close, triggerRef, panelRef, panelId, titleId } = useChoicePanel({ dropdownOnWide: true });

  /** The address with its channel, built when a row is drawn — the panel only ever renders in the browser. */
  const address = (ref: string) => {
    const target = new URL(url ?? window.location.href, window.location.origin);
    target.hash = "";
    target.searchParams.set("ref", ref);
    return target.toString();
  };
  const message = () => (text ?? document.title).trim();

  const rows = (kind: "sheet" | "dropdown") => {
    const row = `flex w-full items-center gap-3 rounded-2xl px-3 text-start outline-none transition-colors hover:bg-paper focus-visible:ring-2 focus-visible:ring-forest/40 ${
      kind === "sheet" ? "min-h-[3.75rem]" : "min-h-12"
    }`;
    const external = (href: string, label: string, mark: ReactNode, tone: string, autofocus = false) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={close}
        className={row}
        {...(autofocus ? { "data-autofocus": "" } : {})}
      >
        <Mark tone={tone}>{mark}</Mark>
        <span className="flex-1 font-semibold text-ink">{label}</span>
      </a>
    );
    const canShareNatively = typeof navigator !== "undefined" && typeof navigator.share === "function";

    return (
      <>
        {external(
          `https://wa.me/?text=${encodeURIComponent(`${message()}\n${address("whatsapp")}`)}`,
          t("ui.common.call_whatsapp"),
          <WhatsAppMark />,
          "bg-[#25d366]/12 text-[#128c4a]",
          true,
        )}
        {external(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(address("facebook"))}`,
          t("ui.common.share_facebook"),
          <FacebookMark />,
          "bg-[#1877f2]/10 text-[#1877f2]",
        )}
        {external(
          `https://t.me/share/url?url=${encodeURIComponent(address("telegram"))}&text=${encodeURIComponent(message())}`,
          t("ui.common.share_telegram"),
          <TelegramMark />,
          "bg-[#229ed9]/10 text-[#229ed9]",
        )}
        <a
          href={`mailto:?subject=${encodeURIComponent(message())}&body=${encodeURIComponent(`${message()}\n${address("email")}`)}`}
          onClick={close}
          className={row}
        >
          <Mark tone="bg-gold-soft text-gold">
            <MailMark />
          </Mark>
          <span className="flex-1 font-semibold text-ink">{t("ui.common.share_email")}</span>
        </a>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address("link"));
              setCopied(true);
              window.setTimeout(() => {
                setCopied(false);
                close();
              }, 1200);
            } catch {
              // A refused clipboard is «nothing happened»: the other rows still work.
            }
          }}
          className={row}
        >
          <Mark tone="bg-leaf-soft text-forest">{copied ? <CheckMark /> : <LinkMark />}</Mark>
          <span className="flex-1 font-semibold text-ink" aria-live="polite">
            {copied ? t("ui.common.share_copied") : t("ui.common.share_copy")}
          </span>
        </button>
        {canShareNatively ? (
          <button
            type="button"
            onClick={async () => {
              close();
              try {
                await navigator.share({ title: message(), text: message(), url: address("share") });
              } catch {
                // The visitor closed the phone's sheet: nothing to report.
              }
            }}
            className={row}
          >
            <Mark tone="bg-paper text-muted">
              <MoreMark />
            </Mark>
            <span className="flex-1 font-semibold text-ink">{t("ui.common.share_more")}</span>
          </button>
        ) : null}
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
        title={ariaLabel}
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
        title={t("ui.common.share_title")}
        icon={<ShareMark />}
        closeLabel={t("ui.common.close")}
        onClose={close}
      >
        {rows}
      </ChoicePanel>
    </>
  );
}

function Mark({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`grid size-10 flex-none place-items-center rounded-full ${tone}`}>{children}</span>;
}

const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The share glyph: three dots joined. Exported for the triggers, so every share door wears the same mark. */
export function ShareMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} {...LINE}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" fill="currentColor">
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3Z" />
    </svg>
  );
}

function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" fill="currentColor">
      <path d="M21.5 4.2 2.9 11.4c-1 .4-1 1.6.1 1.9l4.6 1.4 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6l3.1-15.2c.2-1-.7-1.8-1.6-1.4ZM9.6 14.4l-.4 4-1.3-4.3 9.6-6.2-7.9 6.5Z" />
    </svg>
  );
}

function MailMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" {...LINE}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LinkMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" {...LINE}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" {...LINE} strokeWidth={2.2}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

function MoreMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
