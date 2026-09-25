-- The bottom bar's middle tab (owner, 2026-09-22: «change the محاكاة button, not good, do something more
-- explanatory»).
--
-- «محاكاة» is what the thing is called internally — a simulation. A tab label is read in a strip of three
-- words with no context around it, and it has to answer «what happens if I tap this». «احسب مشروعك» answers
-- it: you work out what your project costs. It is also the exact wording the hero button and the home card
-- already use for the same destination, so the three doors into /start finally agree with each other.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.tab_calculator', to_jsonb('احسب مشروعك'::text), 'text', 'site', 'تسمية تبويب الحاسبة',
   'الكلمة في الشريط السفلي على الهاتف. توّدي للحاسبة (/start).', true, 102)
on conflict (key) do update set value = excluded.value, updated_at = now();
