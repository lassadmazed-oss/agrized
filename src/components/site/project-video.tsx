const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * The player address of a YouTube or Vimeo link, or null for any other address.
 * YouTube plays from its privacy-enhanced domain and Vimeo with do-not-track, so no tracking cookie is set
 * before the visitor presses play.
 */
export function videoEmbedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^(www|m)\./, "");

  if (host === "youtube.com" || host === "youtu.be") {
    const id =
      host === "youtu.be"
        ? parsed.pathname.split("/")[1]
        : (parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]);
    return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.match(/\/(\d{6,12})(?:\/|$)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}?dnt=1` : null;
  }

  return null;
}

/** Report v3 §20 «Video إذا موجود». An address the page cannot embed becomes a plain link. */
export function ProjectVideo({ url, title }: { url: string; title: string }) {
  const embed = videoEmbedUrl(url);

  if (!embed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
        شوف الفيديو ↗
      </a>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-3xl bg-forest">
      <iframe
        src={embed}
        title={title}
        loading="lazy"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full"
      />
    </div>
  );
}
