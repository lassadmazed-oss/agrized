"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import Link from "@/components/site/link";
import { useLocale } from "@/lib/i18n/client";
import type { SiteNotice } from "@/lib/site-notices";

import { closeCard, isRead, loadNotices, markNotices, useNotices } from "./notices-store";

/**
 * «إشعارات الموقع» (0174, owner 2026-11-18: «notifications يخرجولو وقت اللي يحل الانترفاس نتاع السيت»).
 *
 * Three pieces over one shared list (notices-store.ts), fetched after the page has loaded so every page keeps its
 * cache and only /api/notices is personal:
 *   · the bell in the site header, from md up;
 *   · on a phone — where most screens carry their own top bar and the site header steps aside — a small bell
 *     above the tab bar, drawn only while there is something to read;
 *   · once a visit, a card at the top for the newest notice marked «pop».
 * Nothing is pushed anywhere: the visitor sees what waits for them when they come of their own accord.
 */

export type NoticeBellCopy = { title: string; open: string; empty: string; close: string; dismiss: string; fresh: string };

export function NoticeBell({ copy, placement }: { copy: NoticeBellCopy; placement: "header" | "floating" }) {
  const locale = useLocale();
  const { notices } = useNotices();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => loadNotices(locale), [locale]);

  // Close on Escape and on a click outside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unread = notices.filter((notice) => !isRead(notice));
  // The phone's bell is a floating control: it earns its place only while there is something in it.
  if (placement === "floating" && notices.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    closeCard();
    if (next) markNotices(unread.map((notice) => notice.id), "read");
  };

  const floating = placement === "floating";

  return (
    <div
      ref={box}
      className={
        floating
          ? // The assistant's leaf holds the end edge (assistant-bubble.tsx); the bell takes the start one, same height.
          "fixed bottom-[calc(var(--tabbar-h)+var(--floating-cta-h)+1rem)] start-3 z-40 md:hidden"
          : "relative hidden shrink-0 md:block"
      }
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread.length > 0 ? `${copy.open} (${unread.length})` : copy.open}
        title={copy.open}
        className={
          floating
            ? "relative inline-flex size-12 items-center justify-center rounded-full border border-line bg-surface text-forest shadow-[var(--shadow-raise)]"
            : "relative inline-flex size-12 items-center justify-center rounded-[1.25rem] border border-line bg-surface text-forest transition-colors hover:border-forest/30 hover:bg-leaf-soft lg:size-14"
        }
      >
        <BellMark className="size-5 lg:size-6" />
        {unread.length > 0 ? (
          <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-gold-bright px-1 text-[0.6875rem] font-bold leading-5 text-forest-700 ring-2 ring-surface">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={copy.title}
          className={
            floating
              ? "fixed inset-x-3 bottom-[calc(var(--tabbar-h)+var(--floating-cta-h)+4.75rem)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-line bg-surface shadow-[var(--shadow-raise)]"
              : "absolute end-0 top-full z-50 mt-2 max-h-[70vh] w-96 overflow-y-auto rounded-2xl border border-line bg-surface shadow-[var(--shadow-raise)]"
          }
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <p className="font-display text-base font-bold text-forest">{copy.title}</p>
            <button type="button" onClick={() => setOpen(false)} className="text-caption font-semibold text-muted hover:text-forest">
              {copy.close}
            </button>
          </div>
          {notices.length === 0 ? (
            <p className="px-4 py-6 text-caption text-muted">{copy.empty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {notices.map((notice) => (
                <li key={notice.id}>
                  <NoticeItem
                    notice={notice}
                    fresh={unread.some((item) => item.id === notice.id)}
                    copy={copy}
                    onDismiss={() => markNotices([notice.id], "dismiss")}
                    onFollow={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Once a visit, the newest notice that asks for it, under the top of the screen. Rendered once, by the layout. */
export function NoticeCard({ copy }: { copy: NoticeBellCopy }) {
  const locale = useLocale();
  const { card } = useNotices();
  useEffect(() => loadNotices(locale), [locale]);
  if (!card) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-50 rounded-2xl border border-gold/40 bg-surface shadow-[var(--shadow-raise)] md:inset-x-auto md:end-6 md:top-24 md:w-96"
    >
      <NoticeItem
        notice={card}
        fresh
        copy={copy}
        dismissLabel={copy.close}
        onDismiss={() => markNotices([card.id], "read")}
        onFollow={() => markNotices([card.id], "read")}
      />
    </div>
  );
}

function NoticeItem({
  notice,
  fresh,
  copy,
  onDismiss,
  onFollow,
  dismissLabel,
}: {
  notice: SiteNotice;
  fresh: boolean;
  copy: NoticeBellCopy;
  onDismiss: () => void;
  onFollow: () => void;
  dismissLabel?: string;
}) {
  return (
    <div className="flex gap-3 px-4 py-3">
      {notice.image ? (
        <div className="relative size-16 flex-none overflow-hidden rounded-xl bg-leaf-soft">
          <Image src={notice.image} alt="" fill sizes="4rem" className="object-cover" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold leading-6 text-forest">
          {fresh ? <span className="rounded-full bg-gold-soft px-2 text-[0.625rem] font-bold text-forest">{copy.fresh}</span> : null}
          <span className="min-w-0">{notice.title}</span>
        </p>
        {notice.body ? <p className="mt-0.5 text-caption leading-6 text-ink/80">{notice.body}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {notice.link && notice.cta ? (
            <Link href={notice.link} onClick={onFollow} className="btn btn-primary btn-sm">
              {notice.cta}
            </Link>
          ) : null}
          <button type="button" onClick={onDismiss} className="text-[0.75rem] text-muted underline-offset-4 hover:text-forest hover:underline">
            {dismissLabel ?? copy.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}

function BellMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9.5a6 6 0 1 1 12 0c0 3.6 1.2 5.6 2 6.5H4c.8-.9 2-2.9 2-6.5Z" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}
