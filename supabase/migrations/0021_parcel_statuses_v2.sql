-- 0021 · Parcel statuses of spec v2 §28, and the projects copy that v2 contradicts
--
-- §28 lists seven statuses. Six exist already; «Owned» is added after «Contracted». Codes stay stable:
--   available            Available
--   interested           Interested
--   reserved             Reserved
--   contracting          Contract in progress
--   sold                 Contracted
--   owned                Owned            (new)
--   withdrawn            Suspended
-- Nothing else needs to change for them: 0020's app.parcel_offered() offers 'available' only, and
-- app.parcel_visible_status() hides 'withdrawn' only, so an owned parcel is shown as taken, never priced.
--
-- Postgres cannot use a new enum value inside the transaction that adds it, so this file adds the value
-- and never references it; tests/007 exercises it once the migration is committed.

alter type public.parcel_status add value if not exists 'owned' after 'sold';

comment on type public.parcel_status is
  'Spec v2 §28: available, interested, reserved, contracting (contract in progress), sold (contracted), owned, withdrawn (suspended). Codes are stable; labels live in the app.';

-- ---------------------------------------------------------------------------
-- v2 §2–§4: the olive tree is the unit, and each project defines what one unit is (trees and area).
-- 0020 seeded copy saying area and tree count are unrelated everywhere. Replaced only where it is still
-- the seed, so a text the owner has already edited is never overwritten.
-- ---------------------------------------------------------------------------

update public.settings
set value = to_jsonb('المشاريع المتوفّرة'::text)
where key = 'projects.title'
  and value = to_jsonb('اختر قطعتك'::text);

update public.settings
set value = to_jsonb('كل مشروع يحدّد وحدته: قدّاش من زيتونة وقدّاش من مساحة. الأرقام تختلف من مشروع لآخر، فتبدا من عدد الزيتونات ونوريوك الباقي حسب المشروع.'::text)
where key = 'projects.intro'
  and value = to_jsonb('كل قطعة عندها مساحتها وعدد زيتوناتها ونوع غراستها وحالة إنتاجها. معطيات مستقلّة، ما نحسبوش وحدة من الأخرى. اختار اللي يشبهك.'::text);
