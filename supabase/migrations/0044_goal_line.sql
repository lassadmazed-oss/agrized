-- Pending · The number stops being presented as the goal (owner, 2026-09-16, pointing at the million.goal row).
--
-- «وين وصلنا؟» still printed «الهدف: 1,000,000 زيتونة» beside the heading, and the line under the bar read
-- «{count} زيتونة مطلوبة من {goal} · {share}». Both put the target in front of the visitor, which is the thing
-- the owner said the platform is not about. The count stays real and the bar keeps working: million.goal is
-- still the denominator it always was, it is simply no longer announced.
-- The keys stay in place and merely go empty, because 011 asserts all of them exist as public site texts.
-- Spec: MIL-01, MIL-02, PRN-01. Number claimed at apply time.

-- ---------------------------------------------------------------------------
-- 1 · The goal line disappears (MillionCounter hides it when the text is empty)
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb(''::text) where key = 'million.goal_label';
update public.settings set value = to_jsonb(''::text) where key = 'million.goal_label_fr';

-- ---------------------------------------------------------------------------
-- 2 · The line under the bar reports what came in, not how far it is from a target
-- ---------------------------------------------------------------------------

update public.settings set value = to_jsonb($t${count} زيتونة مطلوبة إلى حدّ اليوم$t$::text)
  where key = 'million.bar_caption';
update public.settings set value = to_jsonb($t${count} oliviers demandés à ce jour$t$::text)
  where key = 'million.bar_caption_fr';

-- ---------------------------------------------------------------------------
-- 3 · The row the owner opened: it is the bar's denominator, not a promise to anyone
-- ---------------------------------------------------------------------------

update public.settings
set label_ar = $t$العدد المرجعي لشريط التقدّم$t$,
    description_ar = $t$يُستعمل فقط لحساب نسبة امتلاء الشريط في قسم «وين وصلنا؟». ما يظهرش للزائر كهدف.$t$
where key = 'million.goal';
