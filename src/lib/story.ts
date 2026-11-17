// The stories of «لمن الزيتونة؟» (0164) as pages of their own (0166): what /story/<code> and the home page's
// reminder read. Everything is the owner's — the list tree_for, start.for_lines, story.titles, story.resume_* —
// and nothing here invents a word.

import "server-only";

import { coverSlots, mediaFor, optionsFor, settingInt, settingJson, t, type PublicConfig } from "@/lib/config";

export type Story = {
  id: string;
  code: string;
  label: string;
  title: string;
  line: string | null;
};

function pairText(config: PublicConfig, key: string, code: string): string | null {
  const pairs = settingJson<Record<string, Record<string, unknown>>>(config, key, {});
  const pair = pairs[code];
  const value = pair?.[config.locale] ?? pair?.ar;
  return typeof value === "string" && value.trim() ? value : null;
}

/** One story by its code, or null for a code the list does not hold (or an inactive one). */
export function storyByCode(config: PublicConfig, code: string): Story | null {
  const option = optionsFor(config, "tree_for").find((item) => item.code === code);
  if (!option?.code) return null;
  return {
    id: option.id,
    code: option.code,
    label: option.label,
    title: pairText(config, "story.titles", option.code) ?? option.label,
    line: pairText(config, "start.for_lines", option.code),
  };
}

/** The story's own picture (site_media story.<code>), else the first of the home page's cover. */
export function storyPhotoSlot(config: PublicConfig, code: string): string {
  const own = `story.${code}`;
  if (mediaFor(config, own)) return own;
  return coverSlots(config)[0] ?? own;
}

/** The words of «زيتونتك مازالت تستنّى», for the client card, and how many days a saved simulation is remembered. */
export function storyResumeCopy(config: PublicConfig) {
  return {
    title: t(config, "story.resume_title"),
    named: t(config, "story.resume_named"),
    line: t(config, "story.resume_line"),
    cta: t(config, "story.resume_cta"),
    dismiss: t(config, "story.resume_dismiss"),
    days: settingInt(config, "story.resume_days", 0),
  };
}

export type StoryResumeCopy = ReturnType<typeof storyResumeCopy>;
