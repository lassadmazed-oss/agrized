-- 0105 · Every word on the two new screens becomes the owner's, and the tracking throttle stops growing.
--
-- TWO THINGS, BOTH FOUND BY REVIEWING 0102–0103 RATHER THAN BY RUNNING THEM.
--
-- ---------------------------------------------------------------------------------------------------------
-- 1 · TWENTY-FIVE SETTINGS THE NEW SCREENS READ AND NOBODY SEEDED
-- ---------------------------------------------------------------------------------------------------------
-- فضاء «زيتونتي», /track and the footer call settingText(config, '<key>', '<arabic fallback>') for
-- twenty-five keys that have no row in public.settings. Nothing is visibly broken — settingText falls back
-- to the literal — which is exactly why this is worth a migration rather than a shrug: the screens LOOK
-- finished and the owner cannot change a word of them. /admin/settings builds its sections from the rows
-- that exist, so a key with no row is a sentence he cannot find, cannot edit and does not know is his.
--
-- CLAUDE.md's rule is «never hard-code business values … read them from settings». A fallback in the code is
-- not a violation of that rule — it is what keeps a screen alive when a row is missing — but a fallback with
-- NO row behind it is the rule broken quietly: the value is, in practice, hard-coded.
--
-- THE SEEDED VALUE IS THE FALLBACK, CHARACTER FOR CHARACTER. Nothing on screen changes today; what changes
-- is that all of it is now editable. Two keys are seeded EMPTY on purpose — `site.contact_address` and
-- `track.result_note` are read with no fallback, so empty means «draw nothing», and seeding a sentence would
-- put words on the page the owner never wrote.
--
-- `on conflict (key) do nothing` throughout: if any of these was seeded elsewhere while this was written,
-- that row wins and this file is a no-op for it.
--
-- ---------------------------------------------------------------------------------------------------------
-- 2 · app.submission_throttle GROWS FOREVER, AND /track LET STRANGERS FILL IT
-- ---------------------------------------------------------------------------------------------------------
-- 0103 charges its hourly ceiling by inserting one row per well-formed lookup, keyed on the hash of whatever
-- code the caller typed. That is the right design — charging before the row is read is what stops the limit
-- itself becoming an existence oracle — but nothing in this repository has ever DELETED from that table, and
-- until /track existed every writer was behind a form a human filled in. Now an unauthenticated endpoint
-- writes a row per attempt, and the only thing bounding the table is the per-code ceiling times the number of
-- codes a script can invent, which is unbounded.
--
-- The prune is opportunistic and lives with the reader: a statement that deletes rows older than the window
-- they measure, run from track_request itself. No cron, no new job to forget, and nothing to schedule — the
-- table is cleaned by the thing that dirties it, in proportion to how hard it is being hit.

-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if to_regclass('app.submission_throttle') is null then
    raise exception
      'app.submission_throttle is missing. 0103_request_tracking.sql charges its ceiling there; apply it first.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'track_request') then
    raise exception
      'public.track_request is missing. This file prunes what it writes and seeds the copy its page reads; apply 0103_request_tracking.sql first.';
  end if;
end $guard$;

-- ===========================================================================
-- 1 · فضاء «زيتونتي» — the buyer's own screen
-- ===========================================================================

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('zitounti.screen_title', to_jsonb('حسابي'::text), 'text', 'zitounti',
   'زيتونتي · اسم الشاشة', 'الكلمة اللي تبان في الشريط السفلي وفي راس الحساب.', true, 10),
  ('zitounti.login_note', to_jsonb('ادخل بنمرة التلفون اللي سجّلت بيها، ونبعثولك رمز بالSMS.'::text), 'text', 'zitounti',
   'زيتونتي · جملة الدخول', 'الجملة اللي تحت العنوان في صفحة الدخول.', true, 20),
  ('zitounti.sign_out_label', to_jsonb('اخرج من الحساب'::text), 'text', 'zitounti',
   'زيتونتي · زرّ الخروج', 'كلمة زرّ الخروج في آخر الحساب.', true, 30),
  ('zitounti.back_label', to_jsonb('رجوع لحسابي'::text), 'text', 'zitounti',
   'زيتونتي · زرّ الرجوع', 'الرجوع من قسم للحساب.', true, 40),
  ('zitounti.tree_unit', to_jsonb('زيتونة'::text), 'text', 'zitounti',
   'زيتونتي · كلمة الزيتونة', 'الكلمة المفردة للوحدة، تتكتب حذا الأرقام.', true, 50),
  ('zitounti.section_installments', to_jsonb('الأقساط'::text), 'text', 'zitounti',
   'زيتونتي · اسم قسم الأقساط', 'اسم جزء جدول الأقساط.', true, 60),
  ('zitounti.section_empty', to_jsonb('ما فمّاش'::text), 'text', 'zitounti',
   'زيتونتي · لا شيء', 'الكلمة القصيرة اللي تتكتب حذا قسم فارغ.', true, 70),
  -- «فارغ» و«ما تركّبش» زوز جمل مختلفة عن قصد: الأولى تقول «ما عندك حتى حاجة هوني»، والثانية تقول
  -- «هذا الجزء مازال ما تبناش». خلطهم يخلّي الحريف يحسب إنّ فلوسو ضاعت.
  ('zitounti.section_empty_note', to_jsonb('ما فمّاش شيء مسجّل في الجزء هذا توّا.'::text), 'text', 'zitounti',
   'زيتونتي · جملة القسم الفارغ', 'تتكتب كي يكون القسم مفتوح أما ما فيه حتى سطر.', true, 80),
  ('zitounti.section_not_built', to_jsonb('مازال ما تركّبش'::text), 'text', 'zitounti',
   'زيتونتي · جزء ما تبناش', 'تتكتب كي يكون الجدول وراء القسم مازال ما تعملش.', true, 90)
on conflict (key) do nothing;

-- ===========================================================================
-- 2 · /track — «وين وصل مطلبي؟» for somebody who has not signed in
-- ===========================================================================

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('track.title', to_jsonb('وين وصل مطلبك؟'::text), 'text', 'track',
   'تتبّع · العنوان', 'عنوان صفحة تتبّع المطلب.', true, 10),
  ('track.meta_title', to_jsonb('وين وصل مطلبك؟'::text), 'text', 'track',
   'تتبّع · عنوان التبويب', 'العنوان اللي يبان في تبويب المتصفّح وفي نتائج البحث.', true, 20),
  ('track.request_label', to_jsonb('رقم المطلب'::text), 'text', 'track',
   'تتبّع · اسم خانة الرقم', 'اسم خانة رقم المطلب.', true, 30),
  ('track.request_hint', to_jsonb('كيما وصلك في الرسالة، يبدا بـ AGZ.'::text), 'text', 'track',
   'تتبّع · شرح خانة الرقم', 'الجملة الصغيرة تحت خانة الرقم.', true, 40),
  ('track.phone_label', to_jsonb('نمرة التلفون'::text), 'text', 'track',
   'تتبّع · اسم خانة النمرة', 'اسم خانة نمرة التلفون.', true, 50),
  ('track.phone_hint', to_jsonb('نفس النمرة اللي كتبتها في المطلب.'::text), 'text', 'track',
   'تتبّع · شرح خانة النمرة', 'الجملة الصغيرة تحت خانة النمرة. النمرة هي اللي تحمي المطلب، خاطر الأرقام متسلسلة.', true, 60),
  ('track.submit_label', to_jsonb('شوف وين وصل'::text), 'text', 'track',
   'تتبّع · زرّ البحث', 'كلمة الزرّ.', true, 70),
  ('track.account_note', to_jsonb('عندك حساب عند AgriZed؟'::text), 'text', 'track',
   'تتبّع · جملة الحساب', 'الجملة اللي تلوّح للحساب الكامل لمن عندو واحد.', true, 80),
  -- تتقرا بلا قيمة احتياطية في الكود: فارغة تعني «ما تكتب والو». نزرعوها فارغة باش المالك يلقاها
  -- في الإعدادات ويكتب فيها كي يحبّ، موش باش نحطّولو كلام ما كتبوش.
  ('track.result_note', to_jsonb(''::text), 'text', 'track',
   'تتبّع · جملة تحت النتيجة', 'تتكتب تحت مسار المطلب. اتركها فارغة إذا ما تحبّ حتى جملة.', true, 90)
on conflict (key) do nothing;

-- ===========================================================================
-- 3 · The footer — words it has always printed and nobody could edit
-- ===========================================================================

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.nav_title', to_jsonb('روابط سريعة'::text), 'text', 'site',
   'الفوتر · عنوان الروابط', 'عنوان عمود الروابط في أسفل الموقع.', true, 300),
  ('site.nav_track_label', to_jsonb('وين وصل مطلبي؟'::text), 'text', 'site',
   'الفوتر · رابط تتبّع المطلب', 'كلمة الرابط لصفحة التتبّع. فرّغها باش ينحّى الرابط كامل.', true, 310),
  ('site.contact_title', to_jsonb('تواصل معنا'::text), 'text', 'site',
   'الفوتر · عنوان التواصل', 'عنوان عمود التواصل.', true, 320),
  ('site.contact_address', to_jsonb(''::text), 'text', 'site',
   'الفوتر · العنوان البريدي', 'عنوان الشركة. اتركها فارغة وما يتكتبش حتى سطر.', true, 330),
  ('site.photo_credits_label', to_jsonb('مصادر الصور'::text), 'text', 'site',
   'الفوتر · مصادر الصور', 'الكلمة اللي قبل أسماء أصحاب الصور.', true, 340),
  ('site.copyright_label', to_jsonb('© AgriZed'::text), 'text', 'site',
   'الفوتر · حقوق النشر', 'سطر الحقوق في آخر الصفحة.', true, 350),
  ('site.staff_door_label', to_jsonb('دخول الفريق'::text), 'text', 'site',
   'الفوتر · دخول الفريق', 'رابط دخول الموظّفين.', true, 360)
on conflict (key) do nothing;

-- ===========================================================================
-- 4 · The throttle no longer grows forever
-- ===========================================================================
--
-- Fixed in 0103 itself rather than here, because the cleaning belongs with the statement that dirties the
-- table and a function created in THIS file could not be called by a function created in the previous one.
-- track_request now deletes its own rows older than two hours — twice the widest window any limit measures —
-- on every well-formed lookup. Nothing to schedule, and the cleaning scales with the load.
--
-- This block only proves it took, so that a future edit removing that line turns a migration red rather than
-- quietly restoring an unbounded table.

do $verify$
declare
  v_src text := pg_get_functiondef('public.track_request(text, text)'::regprocedure);
begin
  if v_src not like '%delete from app.submission_throttle%' then
    raise exception
      'public.track_request no longer prunes app.submission_throttle. It is the only unauthenticated writer of that table; without the delete it grows without bound.';
  end if;
end $verify$;
