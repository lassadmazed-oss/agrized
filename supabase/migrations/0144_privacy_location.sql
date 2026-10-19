-- 0144 · The privacy policy learns about location.
--
-- Test: supabase/tests/091_privacy_location.sql
-- Dry run: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0144_privacy_location.sql supabase/tests/091_privacy_location.sql
--
-- 0143 gave the phone app «قدّاش يبعد عليّ؟» on an offer. 0140 wrote the privacy policy the day before, so
-- the policy lists what is collected — name, phone, device token, IP fingerprint — and says nothing about
-- location, because at the time nothing asked for it.
--
-- THAT GAP IS A REJECTION, not a nicety. Google Play's Data Safety form and Apple's privacy label are both
-- checked against the declared policy, and an app whose manifest carries ACCESS_FINE_LOCATION while its
-- policy is silent on location is the simplest kind of mismatch for a reviewer to find.
--
-- WHAT IT ACTUALLY SAYS IS THE POINT. The position never leaves the phone: `public_project_page` already
-- gave the app the offer's coordinates, the system gives it the device's, and `haversineKm` subtracts them
-- in mobile/src/nearby.ts. Nothing is sent to this database, nothing is written to the device, and the
-- permission is when-in-use with background location switched off on both platforms (mobile/app.json). So
-- the honest sentence is not «we collect your location» — it is «we never receive it», and that is also the
-- answer to give on both store forms.
--
-- The section is inserted BEFORE «علاش نجمعوها» so the two «what we collect» passages sit together.

update public.settings as cfg
   set value = (
         -- Rebuilt rather than appended: the section is dropped first, so running this twice leaves one
         -- copy. `ord` is cast to numeric because the new section is slotted at 1.5 — between «شنوّة نجمعو»
         -- and «علاش نجمعوها» — and a `with ordinality` counter is bigint, which will not union with it.
         select jsonb_agg(elem order by ord)
           from (
             select elem, ord::numeric as ord
               from jsonb_array_elements(cfg.value) with ordinality as kept(elem, ord)
              where elem ->> 'title' <> 'موقعك'
             union all
             select jsonb_build_object(
                      'title', 'موقعك',
                      'body',  'في التطبيق، كان تنقر على «قدّاش يبعد عليّ؟» في صفحة عرض، نطلبو من التلفون '
                            || 'موقعك باش نحسبو البعد بينك وبين الأرض. الحساب يتعمل في التلفون متاعك، '
                            || 'والموقع ما يوصلناش: ما نسجّلوهش عندنا وما نبعثوهش لحتّى جهة.'
                            || E'
'
                            || 'نطلبو الموقع كان وقت ما تكون في التطبيق، وما نطلبوهش وقت ما يكون مسكّر. '
                            || 'تنجم ترفض، والتطبيق يخدم عادي من غير الحساب هذا.'),
                    1.5::numeric
           ) as merged(elem, ord)
       ),
       updated_at = now()
 where cfg.key = 'legal.privacy_sections';

-- The policy changed, so the date on the page must change with it. A policy that says it was last touched
-- before a capability it describes is worse than one that is merely out of date.
update public.settings
   set value = to_jsonb('2026-10-19'::text), updated_at = now()
 where key = 'legal.privacy_updated_at';
