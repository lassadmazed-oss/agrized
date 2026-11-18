"use client";

import { useRef, useState } from "react";

import { FacebookMark } from "@/components/site/facebook-mark";

/**
 * A post from the AgriZed Facebook page (0171), framed only once the visitor asks for it.
 *
 * The site sets no tracker and its privacy page says so; an iframe from facebook.com lets Facebook set cookies the
 * moment it loads. So until the button is pressed this is a card of the site's own — a sentence says what loading
 * does — and the address of the post is a plain link. After the press the post is framed at the width the column
 * has (280–500px), and at the height Facebook's embed code gives, scaled to that width.
 */

/** Facebook's header and its row of buttons, around the picture: the part of the height that does not scale. */
const CHROME_PX = 103;

export function FacebookPost({
  url,
  heightAt500,
  title,
  notice,
  loadLabel,
  openLabel,
}: {
  url: string;
  heightAt500: number;
  title: string;
  notice: string;
  loadLabel: string;
  openLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);

  const load = () => {
    // The card less the frame's own padding (p-3 on each side), or Facebook draws wider than the box shows.
    const available = Math.floor((box.current?.clientWidth ?? 374) - 24);
    // Facebook documents 350 as its narrowest, and draws a phone's 317 correctly (checked 2026-11-18); below 280
    // its buttons crowd, so that is the floor here.
    const width = Math.max(280, Math.min(500, available));
    const height = Math.round(CHROME_PX + ((heightAt500 - CHROME_PX) * width) / 500);
    setFrame({ width, height });
  };

  return (
    <div ref={box} className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 text-sm font-bold text-forest">
        <FacebookMark />
        {title}
      </div>
      {frame ? (
        <div className="flex justify-center p-3">
          <iframe
            src={`https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true&width=${frame.width}`}
            width={frame.width}
            height={frame.height}
            title={title}
            className="max-w-full border-0"
            loading="lazy"
            allow="clipboard-write; encrypted-media; picture-in-picture; web-share"
          />
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <p className="text-caption leading-6 text-muted">{notice}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={load} className="btn btn-secondary btn-sm">
              {loadLabel}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption font-semibold text-forest underline underline-offset-4"
            >
              {openLabel}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
