-- 0014 · Mandatory note under every offer card (PARC-11 / clause 25.6).

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('legal.parcel_card_note',
   to_jsonb('عدد الزيتونات والإنتاج يختلفان حسب المشروع، المسافات الزراعية، العمر، الري والحالة الفلاحية.'::text),
   'text', 'legal', 'تنبيه بطاقة القطعة',
   'يظهر إلزامياً تحت كل بطاقة عرض قطعة. يمكن تعديل النص فقط.', true, 40);
