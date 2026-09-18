-- The words of «عروضنا» (owner, 2026-09-18).
--
-- The offer flow is its own: its own form on the offer's page, its own confirmation, and the current offers
-- shown once the calculator form is sent. MIL-02: every line is a setting, so the owner rewrites or empties it
-- without a deploy. Emptying a heading hides the block it titles.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('offers.title', to_jsonb('عروضنا'::text), 'text', 'projects',
   'اسم قسم العروض',
   'الاسم اللي يظهر في القائمة وفوق صفحة العروض. فارغ = يرجع «المشاريع المتوفّرة».', true, 540),
  ('offers.title_fr', to_jsonb('Nos offres'::text), 'text', 'projects',
   'اسم قسم العروض بالفرنسية', 'نفس الاسم بالفرنسية.', true, 541),

  ('offers.form_title', to_jsonb('سجّل اهتمامك بهذا العرض'::text), 'text', 'projects',
   'عنوان استمارة العرض',
   'العنوان فوق الاستمارة اللي تتعمّر في صفحة العرض. فارغ = تتخبّى الاستمارة.', true, 542),
  ('offers.form_title_fr', to_jsonb('Votre intérêt pour cette offre'::text), 'text', 'projects',
   'عنوان استمارة العرض بالفرنسية', 'نفس العنوان بالفرنسية.', true, 543),

  ('offers.form_intro',
   to_jsonb('اختار قدّاش زيتونة تحب من هذا العرض، وعمّر معلوماتك. التسجيل مجاني ولا يلزمك بالشراء.'::text),
   'text', 'projects',
   'جملة تحت عنوان الاستمارة', 'سطر واحد يشرح شنوّة يصير بعد الإرسال. فارغ = ما يظهرش.', true, 544),
  ('offers.form_intro_fr',
   to_jsonb('Choisissez le nombre d''oliviers puis laissez vos coordonnées. Gratuit et sans engagement.'::text),
   'text', 'projects', 'جملة الاستمارة بالفرنسية', 'نفس الجملة بالفرنسية.', true, 545),

  ('offers.trees_label', to_jsonb('قدّاش زيتونة تحب من هذا العرض؟'::text), 'text', 'projects',
   'سؤال عدد الزيتونات في العرض',
   'السؤال فوق خانة عدد الزيتونات. الحريف يختار من زيتونة وحدة إلى عدد زيتونات العرض.', true, 546),
  ('offers.trees_label_fr', to_jsonb('Combien d''oliviers de cette offre ?'::text), 'text', 'projects',
   'سؤال عدد الزيتونات بالفرنسية', 'نفس السؤال بالفرنسية.', true, 547),

  ('offers.trees_hint', to_jsonb('من زيتونة وحدة إلى {max} زيتونة.'::text), 'text', 'projects',
   'ملاحظة تحت خانة عدد الزيتونات',
   '{max} تتبدّل بعدد زيتونات العرض. فارغة = ما تظهرش.', true, 548),
  ('offers.trees_hint_fr', to_jsonb('D''un seul olivier à {max} oliviers.'::text), 'text', 'projects',
   'ملاحظة عدد الزيتونات بالفرنسية', 'نفس الملاحظة بالفرنسية.', true, 549),

  ('offers.submit_label', to_jsonb('سجّل اهتمامك بهذا العرض'::text), 'text', 'projects',
   'زرّ إرسال استمارة العرض', 'الكلام اللي يظهر في الزرّ.', true, 550),
  ('offers.submit_label_fr', to_jsonb('Envoyer ma demande'::text), 'text', 'projects',
   'زرّ الإرسال بالفرنسية', 'نفس الكلام بالفرنسية.', true, 551),

  ('offers.success_title', to_jsonb('وصلنا طلبك على هذا العرض'::text), 'text', 'projects',
   'عنوان التأكيد بعد إرسال طلب العرض', 'يظهر في بلاصة الاستمارة بعد الإرسال.', true, 552),
  ('offers.success_title_fr', to_jsonb('Votre demande est bien reçue'::text), 'text', 'projects',
   'عنوان التأكيد بالفرنسية', 'نفس العنوان بالفرنسية.', true, 553),

  ('offers.success_text',
   to_jsonb('فريق AgriZed باش يتصل بيك ويشرحلك كل التفاصيل على هذا العرض. احتفظ برقم مطلبك.'::text),
   'text', 'projects', 'نصّ التأكيد بعد إرسال طلب العرض', 'شنوّة يصير بعد الإرسال. فارغ = ما يظهرش.', true, 554),
  ('offers.success_text_fr',
   to_jsonb('L''équipe AgriZed vous rappelle avec tous les détails de cette offre. Gardez votre numéro de demande.'::text),
   'text', 'projects', 'نصّ التأكيد بالفرنسية', 'نفس النصّ بالفرنسية.', true, 555),

  ('register.offers_title', to_jsonb('عروضنا الحالية'::text), 'text', 'site',
   'عنوان العروض في صفحة تأكيد المطلب',
   'العروض المتوفّرة توّا تظهر تحت هذا العنوان بعد ما الحريف يبعث مطلبه من الحاسبة. فارغ = ما تظهرش.',
   true, 380),
  ('register.offers_title_fr', to_jsonb('Nos offres du moment'::text), 'text', 'site',
   'عنوان العروض في صفحة التأكيد بالفرنسية', 'نفس العنوان بالفرنسية.', true, 381),

  ('register.offers_text',
   to_jsonb('وأنت تستنّى مكالمتنا، شوف العروض المتوفّرة توّا. تنجم تسجّل اهتمامك بأي عرض منهم.'::text),
   'text', 'site', 'جملة فوق العروض في صفحة التأكيد', 'سطر واحد فوق العروض. فارغ = ما يظهرش.', true, 382),
  ('register.offers_text_fr',
   to_jsonb('En attendant notre appel, découvrez les offres disponibles.'::text),
   'text', 'site', 'جملة العروض في صفحة التأكيد بالفرنسية', 'نفس الجملة بالفرنسية.', true, 383)
on conflict (key) do nothing;
