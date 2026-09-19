-- Zero is an answer: «الهدف مش الوصول لرقم مليون زيتونة، بل كم شخص نقدر نعاونوه» (owner, 2026-09-16).
--
-- million.goal is the denominator of the progress bar in «وين وصلنا؟». The owner set it to 0 from the Back
-- Office, which is not a mistake — it is the positioning: there is no target figure to measure against. The
-- counter already reads it that way (src/components/site/million-counter.tsx draws the bar only while goal > 0,
-- so no bar is rendered and no invalid ARIA range is produced), and the four figures above it — requested,
-- reserved, contracted, planted — carry the section on their own.
--
-- What did not say so was the setting itself: its help text described a denominator and nothing else, so an
-- owner typing 0 had no way to know the bar would disappear, and the guard in the Back Office refused the very
-- value the database holds. This states the rule where it is read.

update public.settings
set description_ar =
      'يُستعمل فقط لحساب نسبة امتلاء الشريط في قسم «وين وصلنا؟». ما يظهرش للزائر كهدف. '
      || 'اكتب 0 باش يتخبّى الشريط ويبقاو كان الأرقام — وهذا هو الوضع الحالي، على خاطر الهدف مش رقم.',
    updated_at = now()
where key = 'million.goal';

comment on column public.settings.value is
  'The setting''s value as jsonb, read through app.setting_* by value_type. A zero where a count is expected is a real answer, not an empty field: million.goal = 0 hides the progress bar instead of dividing by nothing.';
