"use client";

import { useEffect, useState } from "react";

import Link from "@/components/site/link";
import { formatMessage } from "@/lib/i18n/message";
import { useLocale } from "@/lib/i18n/client";

/**
 * Where /start keeps the visitor's unfinished simulation (0166): the query that rebuilds it, the tree's name and
 * when. In this browser only — no account, no tracker — and dropped once the request is sent.
 */
export const STORY_STORAGE_KEY = "agrized:story";

export type SavedStory = { query: string; name: string | null; at: number };

/** Keeps the simulation as it stands now; the moment is stamped here, so callers stay pure. */
export function saveStory(story: Omit<SavedStory, "at">): void {
  try {
    localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify({ ...story, at: Date.now() }));
  } catch {
    // Storage refused (private mode): the reminder simply never shows.
  }
}

export function forgetStory(): void {
  try {
    localStorage.removeItem(STORY_STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

function readStory(days: number): SavedStory | null {
  try {
    const raw = localStorage.getItem(STORY_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedStory>;
    if (typeof value.query !== "string" || !value.query || typeof value.at !== "number") return null;
    if (Date.now() - value.at > days * 24 * 60 * 60 * 1000) return null;
    return { query: value.query, name: typeof value.name === "string" ? value.name : null, at: value.at };
  } catch {
    return null;
  }
}

/**
 * «زيتونتك مازالت تستنّى» (owner, 2026-11-17, idea 4): a visitor who started the calculator and left finds, on
 * the home page and on a story page, a card that brings them back to exactly where they were — with the name
 * they gave the tree, when they gave one. It is the site reminding its own visitor, from their own browser; it
 * shows nothing to anyone else and asks nothing of them. «موش توّا» puts it away for good.
 */
export function ResumeStory({
  copy,
}: {
  copy: { title: string; named: string; line: string; cta: string; dismiss: string; days: number };
}) {
  const locale = useLocale();
  const [story, setStory] = useState<SavedStory | null>(null);

  // Read after the first paint: the server never knows what this browser kept.
  useEffect(() => {
    if (copy.days <= 0) return;
    const saved = readStory(copy.days);
    const timer = setTimeout(() => setStory(saved), 0);
    return () => clearTimeout(timer);
  }, [copy.days]);

  if (!story) return null;
  const title = story.name ? formatMessage(locale, copy.named, { name: story.name }) : copy.title;

  return (
    <section className="mt-6 rounded-3xl border border-gold/40 bg-gold-soft/60 p-4 md:mt-10 md:p-6">
      <p className="font-display text-xl font-bold leading-tight text-forest md:text-2xl">{title}</p>
      {copy.line ? <p className="mt-1 text-sm leading-6 text-muted">{copy.line}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={`/start?${story.query}`} className="btn btn-primary">
          {copy.cta}
        </Link>
        <button
          type="button"
          onClick={() => {
            forgetStory();
            setStory(null);
          }}
          className="btn btn-secondary border-line"
        >
          {copy.dismiss}
        </button>
      </div>
    </section>
  );
}
