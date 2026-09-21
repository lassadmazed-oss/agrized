-- The words of the offers filter on a phone (owner, 2026-09-21, from his drawing of the list screen).
--
-- The drawing puts a search field and a row of chips above the offers. The chips themselves are NOT settings:
-- «منتج» and «مكثف» are `production_status` and `plantation_system`, whose Arabic already lives in
-- PRODUCTION_LABELS / PLANTATION_LABELS and is printed by the offer card and the Back Office. Minting a second
-- vocabulary for the same two columns would let the two drift apart. What has no home yet is the furniture
-- around them: what the search box says before anyone types, the word for «no filter», and what the page says
-- when a filter matches nothing — which is a different sentence from `projects.empty_text`, that one being
-- about an offer having no trees left rather than about a filter returning nothing.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('projects.search_placeholder', to_jsonb('ابحث عن عرض…'::text), 'text', 'projects',
   'نصّ خانة البحث في العروض',
   'اللي يظهر في خانة البحث قبل ما الزائر يكتب. البحث يقلّب في اسم العرض وموقعه ورمزه. فارغ = الخانة تتخبّى.',
   true, 560),
  ('projects.search_placeholder_fr', to_jsonb('Rechercher une offre…'::text), 'text', 'projects',
   'نصّ خانة البحث بالفرنسية', 'نفس النصّ بالفرنسية.', true, 561),

  ('projects.filter_all', to_jsonb('الكل'::text), 'text', 'projects',
   'اسم شريحة «بلا تصفية»',
   'أول شريحة في صفّ التصفية، اللي ترجّع كل العروض. بقية الشرائح أسماؤها تجي من حالة الإنتاج ونظام الغراسة، موش من هنا.',
   true, 562),
  ('projects.filter_all_fr', to_jsonb('Toutes'::text), 'text', 'projects',
   'اسم شريحة «بلا تصفية» بالفرنسية', 'نفس الاسم بالفرنسية.', true, 563),

  ('projects.filter_empty',
   to_jsonb('ما فماش عرض يوافق هذا الاختيار. جرّب شريحة أخرى، ولا اضغط «الكل» باش تشوف كل العروض.'::text),
   'text', 'projects',
   'نصّ «ما لقينا حتى عرض» بعد التصفية',
   'يظهر كي التصفية ولا البحث ما يرجّعو حتى عرض. مختلف على «projects.empty_text» اللي يتكلّم على عرض ما بقاش فيه زيتونات.',
   true, 564),
  ('projects.filter_empty_fr',
   to_jsonb('Aucune offre ne correspond à ce choix. Essayez un autre filtre ou « Toutes ».'::text),
   'text', 'projects', 'نصّ «ما لقينا حتى عرض» بالفرنسية', 'نفس النصّ بالفرنسية.', true, 565)
on conflict (key) do nothing;
