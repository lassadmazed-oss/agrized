import "server-only";

// The one place that talks to Meta (0157–0160, 0170). «انشر الآن» on /admin/marketing and the cron behind
// «البرنامج اليومي» (/api/social/publish) both hand it a claimed post and write back what it answers.
//
// The token arrives in the claim from a security-definer function, lives in this process for one request and is
// never logged: errors are reduced to Meta's own message, which does not carry it.

const GRAPH = "https://graph.facebook.com/v21.0";

/** One post as cron_social_claim_due / staff_social_publish_claim hand it over. */
export type SocialClaim = {
  id: string;
  network: "facebook" | "instagram";
  caption: string;
  image_url: string | null;
  link_url: string | null;
  page_id: string;
  access_token: string;
  error?: string;
};

export type MetaAnswer = { ok: true; id: string; permalink: string } | { ok: false; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The token a Page posts with. A Page can only be posted to as itself, with ITS token; the person's own token
 * posts as the person, and Meta refuses that with «(#200) publish_actions … deprecated» (owner, 2026-11-19:
 * the token pasted in /admin/marketing was the person's). Asked once per post: when the token is the person's
 * and they manage the Page, Meta hands back the Page's token; when it already is the Page's, the question
 * fails or echoes it, and the token is used as it came.
 */
async function pageToken(pageId: string, token: string): Promise<string> {
  try {
    const response = await fetch(`${GRAPH}/${pageId}?${new URLSearchParams({ fields: "access_token", access_token: token })}`);
    const json = (await response.json()) as { access_token?: string };
    return response.ok && json.access_token ? json.access_token : token;
  } catch {
    return token;
  }
}

/** What Meta answered, reduced to the two things worth writing down. */
export async function publishToMeta(claim: SocialClaim): Promise<MetaAnswer> {
  let token = claim.access_token;
  const body = (fields: Record<string, string>) =>
    ({ method: "POST", body: new URLSearchParams({ ...fields, access_token: token }) }) as RequestInit;

  try {
    if (claim.network === "facebook") {
      token = await pageToken(claim.page_id, claim.access_token);
      // A picture when there is one — a photo post is what gets seen — and a plain link post when there is
      // not. Both are one call; neither invents an image.
      const response = claim.image_url
        ? await fetch(`${GRAPH}/${claim.page_id}/photos`, body({ url: claim.image_url, caption: claim.caption }))
        : await fetch(
            `${GRAPH}/${claim.page_id}/feed`,
            body(claim.link_url ? { message: claim.caption, link: claim.link_url } : { message: claim.caption }),
          );
      const json = (await response.json()) as { id?: string; post_id?: string; error?: { message?: string } };
      if (!response.ok || json.error) return { ok: false, error: json.error?.message ?? `HTTP ${response.status}` };
      const id = json.post_id ?? json.id ?? "";
      return { ok: true, id, permalink: id ? `https://www.facebook.com/${id}` : "" };
    }

    // Instagram publishes in two steps: a container, then the publish. There is no picture-less post on
    // Instagram, so a post with no photograph is refused here rather than sent and rejected by Meta.
    if (!claim.image_url) return { ok: false, error: "instagram_needs_image" };

    const container = await fetch(`${GRAPH}/${claim.page_id}/media`, body({ image_url: claim.image_url, caption: claim.caption }));
    const containerJson = (await container.json()) as { id?: string; error?: { message?: string } };
    if (!container.ok || containerJson.error || !containerJson.id) {
      return { ok: false, error: containerJson.error?.message ?? `HTTP ${container.status}` };
    }

    // Instagram fetches and prepares the picture after answering; publishing before it is ready is refused with
    // «Media ID is not available» (seen 2026-11-19). Wait for FINISHED — a photo usually takes a second or two.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const state = await fetch(`${GRAPH}/${containerJson.id}?${new URLSearchParams({ fields: "status_code", access_token: token })}`)
        .then((response) => response.json() as Promise<{ status_code?: string }>)
        .catch(() => ({}) as { status_code?: string });
      if (state.status_code === "FINISHED") break;
      if (state.status_code === "ERROR" || state.status_code === "EXPIRED") return { ok: false, error: `instagram_media_${state.status_code.toLowerCase()}` };
      await sleep(1500);
    }

    const published = await fetch(`${GRAPH}/${claim.page_id}/media_publish`, body({ creation_id: containerJson.id }));
    const publishedJson = (await published.json()) as { id?: string; error?: { message?: string } };
    if (!published.ok || publishedJson.error || !publishedJson.id) {
      return { ok: false, error: publishedJson.error?.message ?? `HTTP ${published.status}` };
    }

    // The media id is not the address of the post; Instagram says what is.
    const media = await fetch(
      `${GRAPH}/${publishedJson.id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`,
    )
      .then((response) => response.json() as Promise<{ permalink?: string }>)
      .catch(() => ({}) as { permalink?: string });
    return { ok: true, id: publishedJson.id, permalink: media.permalink ?? "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "network" };
  }
}
