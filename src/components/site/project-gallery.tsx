import Image from "next/image";

import type { ProjectPicture } from "@/lib/public-projects";

/** Report v3 §20 gallery. Each picture opens at full size; the caption, when set, sits under it. */
export function ProjectGallery({ pictures, title }: { pictures: ProjectPicture[]; title: string }) {
  if (pictures.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-3xl font-bold text-forest">{title}</h2>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pictures.map((picture) => (
          <li key={picture.id}>
            <figure>
              <a
                href={picture.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-4/3 overflow-hidden rounded-2xl bg-leaf-soft"
              >
                <Image
                  src={picture.url}
                  alt={picture.alt_ar}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 33vw, 50vw"
                  className="object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </a>
              {picture.caption_ar ? <figcaption className="mt-1.5 text-sm leading-6 text-muted">{picture.caption_ar}</figcaption> : null}
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
