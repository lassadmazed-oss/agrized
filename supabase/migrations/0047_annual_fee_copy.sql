-- The words for the yearly care of a tree (owner, 2026-09-18). MIL-02: every text on the site is a setting, so
-- the owner renames the line or empties it without a deploy. PRN-01: it states a cost, never a return.
--
-- 0045 put the figure in every quote; these are the two texts that carry it: the row label, and the note under it
-- that says what one tree costs each year. Emptying the note hides it; emptying the label hides the row.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('start.row_annual_fee', to_jsonb('معاليم الصيانة والتقليم في العام'::text), 'text', 'start',
   'عنوان سطر المعاليم السنوية',
   'السطر اللي يبيّن معاليم الصيانة والتقليم والمتابعة للعام، في ملخّص الحاسبة وفي صفحة العرض. فارغ = السطر ما يظهرش. (PRN-01: ممنوع أي رقم أو كلمة توحي بمردود أو ربح)',
   true, 150),
  ('start.row_annual_fee_fr', to_jsonb('Entretien et taille par an'::text), 'text', 'start',
   'عنوان سطر المعاليم بالفرنسية', 'نفس العنوان بالفرنسية. فارغ = يظهر بالعربي وحدو.', true, 151),

  ('start.annual_fee_per_tree', to_jsonb('{amount} للزيتونة في العام'::text), 'text', 'start',
   'ملاحظة معاليم الزيتونة الواحدة',
   'تحت المبلغ الجملي: قدّاش تكلّف الزيتونة الوحدة في العام. {amount} تتبدّل بالمبلغ. فارغة = ما تظهرش. (PRN-01)',
   true, 152),
  ('start.annual_fee_per_tree_fr', to_jsonb('{amount} par olivier et par an'::text), 'text', 'start',
   'ملاحظة معاليم الزيتونة بالفرنسية', 'نفس الملاحظة بالفرنسية. فارغة = تظهر بالعربي وحدها.', true, 153)
on conflict (key) do nothing;
