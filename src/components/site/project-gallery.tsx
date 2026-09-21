import Image from "next/image";

import { SectionHeader } from "@/components/ui";
import type { ProjectPicture } from "@/lib/public-projects";

/**
 * Report v3 §20 gallery. Each picture opens at full size; the caption, when set, sits under it.
 *
 * Two faults measured on 2026-09-19, both on the live TX-00215 page:
 *
 *  · the grid was `grid-cols-2 sm:grid-cols-3`, a fixed track count. With the one picture the offer
 *    actually holds, the item took 227px of a 705px row at 768 and left roughly 470px of blank page
 *    beside it, under a heading — it read as two images that had failed to load. The tracks are now
 *    `auto-fit` over a `minmax(…, 1fr)`, so an EMPTY track collapses and the pictures that exist share
 *    the whole row: one, two or five all fill their line. A single picture is not a grid at all — it
 *    gets a frame at a readable measure instead of being stretched across the page;
 *  · the heading was a hand-written `font-display text-3xl`, one of four heading treatments on that
 *    page. It goes through <SectionHeader> like every other band title, so the size is decided in one
 *    place. `level={1}` is the `.section-title` type; `as="h2"` keeps it under the page's own <h1>.
 *
 * The frame itself is fixed and clipped on purpose: a picture is an arbitrary upload, so it may be a
 * portrait screenshot rather than a landscape photograph of land. `.card` gives the frame a hairline
 * and a ground, so a picture that is loading — or one that is the wrong shape — reads as a deliberate
 * frame rather than as a hole in the page.
 */
export function ProjectGallery({ pictures, title }: { pictures: ProjectPicture[]; title: string }) {
  if (pictures.length === 0) return null;
  const single = pictures.length === 1;

  return (
    <div>
      <SectionHeader title={title} level={1} as="h2" />
      <ul
        className={`mt-cozy grid gap-snug ${
          single
            ? "max-w-md"
            : "grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]"
        }`}
      >
        {pictures.map((picture) => (
          <li key={picture.id}>
            <figure>
              <a
                href={picture.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group card relative block aspect-4/3 overflow-hidden bg-leaf-soft"
              >
                <Image
                  src={picture.url}
                  alt={picture.alt_ar}
                  fill
                  sizes={single ? "(min-width: 640px) 28rem, 100vw" : "(min-width: 1024px) 380px, (min-width: 640px) 33vw, 50vw"}
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </a>
              {picture.caption_ar ? (
                <figcaption className="mt-tight text-caption leading-6 text-muted">{picture.caption_ar}</figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
