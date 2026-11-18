// «إشعارات الموقع» (0174): one notice as /api/notices hands it to the bell. Shared by the route and the client.

export type SiteNotice = {
  id: string;
  kind: "offer" | "journey" | "news" | "custom";
  title: string;
  body: string | null;
  /** A path on the site, already checked by the database. */
  link: string | null;
  cta: string | null;
  image: string | null;
  /** Shown once as a card when the visitor arrives. */
  pop: boolean;
  at: string;
  /** Known person only: the database remembers. A browser without a person keeps its own list. */
  read: boolean;
};

export type NoticesAnswer = { personal: boolean; notices: SiteNotice[] };

export function parseNotices(data: unknown): SiteNotice[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is SiteNotice =>
      Boolean(row) && typeof row === "object" && typeof (row as SiteNotice).id === "string" && typeof (row as SiteNotice).title === "string",
  );
}
