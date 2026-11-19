// «قصص النجاح» (0176) — the shapes the team's pages read, and the sentence for each refusal. No "server-only":
// the client components import the types and the messages.

export type StoryStatus = "collecting" | "editing" | "ready" | "published" | "withdrawn";
export type StoryConsent = "none" | "granted" | "withdrawn";

export type StoryMedia = {
  id: string;
  source: "client" | "staff";
  role: "raw" | "final";
  kind: "photo" | "video";
  mime: string;
  file_name: string | null;
  size_bytes: number;
  parts: number;
  path: string;
  caption: string | null;
  status: "uploading" | "ready" | "kept" | "set_aside";
  created_at: string;
  uploaded_by: string | null;
};

export type StoryListItem = {
  person: { id: string; full_name: string; phone_e164: string | null };
  stage: string | null;
  status: StoryStatus;
  consent: StoryConsent;
  title: string | null;
  photos: number;
  videos: number;
  has_final: boolean;
  published_url: string | null;
};

export type StoryList = {
  stories: StoryListItem[];
  to_ask: { person: { id: string; full_name: string; phone_e164: string | null; whatsapp_e164: string | null }; stage: string | null }[];
};

export type StoryFile = {
  person: { id: string; full_name: string; phone_e164: string | null; whatsapp_e164: string | null; created_at: string; governorate: string | null };
  can_edit: boolean;
  can_publish: boolean;
  stage: { key: string; label: string } | null;
  story: {
    status: StoryStatus;
    consent: StoryConsent;
    consent_at: string | null;
    consent_source: "client" | "staff" | null;
    consent_text: string | null;
    consent_note: string | null;
    title: string | null;
    story_text: string | null;
    published_url: string | null;
    published_at: string | null;
    updated_at: string | null;
  };
  media: StoryMedia[];
  milestones: { key: string; at: string; detail: string | null }[];
  trees: { offer: string; count: number }[];
  timeline: { total: number; events: { at: string; kind: string; title: string; detail: string | null; by: string | null }[] };
};

export const STATUS_LABELS: Record<StoryStatus, string> = {
  collecting: "نجمعو فيها",
  editing: "في المونتاج",
  ready: "جاهزة للنشر",
  published: "تنشرت",
  withdrawn: "الحريف رجع في الموافقة",
};

export const CONSENT_LABELS: Record<StoryConsent, string> = {
  none: "مازال ما قبلش النشر",
  granted: "قبل النشر",
  withdrawn: "رجع في الموافقة",
};

export const MILESTONE_LABELS: Record<string, string> = {
  request: "بعثلنا طلبو",
  call: "تكلّمنا",
  visit: "زار الأرض",
  trees: "اختار زيتوناتو",
  deposit: "دفع العربون",
  contract: "أمضينا العقد",
  owner: "ولّى مولى زيتونة",
  media: "بعث أوّل تصويرة ولا فيديو",
};

const ERRORS: Record<string, string> = {
  forbidden: "الملف هذا موش متاعك. اطلب من الإدارة.",
  story_needs_consent: "ما تنجمش تحضّرها للنشر ولا تنشرها قبل ما يقبل الحريف. سجّل موافقتو الأول.",
  story_consent_note: "اكتب كيفاش عطاك الموافقة (ورقة ممضية، واتساب…) باش تتسجّل.",
  invalid_story_url: "رابط المنشور لازم يبدا بـhttps://",
  invalid_story_status: "طلب موش مفهوم. حدّث الصفحة.",
  story_too_big: "الملف كبير برشا على الإعدادات متاع قصص النجاح.",
  story_bad_type: "كان التصاور والفيديوات يتقبلو.",
  story_media_not_found: "الملف هذا ما عادش موجود. حدّث الصفحة.",
  story_upload_incomplete: "الملف ما وصلش كامل. عاود ابعثو.",
  person_not_found: "الحريف هذا ما عادش موجود.",
};

export function storyError(message: string | null | undefined): string {
  return ERRORS[(message ?? "").trim()] ?? "ما تسجّلش. عاود، وإذا تعاودت كلّم الإدارة.";
}

export function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(Math.round(bytes / 1024), 1)} KB`;
}
