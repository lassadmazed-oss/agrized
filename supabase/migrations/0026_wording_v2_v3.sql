-- v2 vocabulary, hero, calls to action and metadata (spec v2 §1, §5, §7, §53, §59 · WP-03)
--
-- Report v3 wins over v2 where they differ: the homepage buttons are «سجّل اهتمامك» and «شوف العروض» (§17),
-- the offer types are the report's four (§3), and the client picks a down payment and a duration, not a
-- monthly amount (§6), so no copy here promises a monthly choice.
--
-- §53: public copy speaks of project, ownership, olive tree, land, participation and follow-up, never of
--      guaranteed profit or the best investment. §59: every interface text is data edited from the Back Office.
-- Every update below runs only while the stored value still equals what an earlier migration seeded, so a
-- text the owner already edited is never overwritten. Sentences from the spec cite their section; any other
-- new sentence is flagged «مسودة، تُراجع من الإدارة» in description_ar.

-- ---------------------------------------------------------------------------
-- Hero and «المليون تبدأ بزيتونة»: the spec's own sentences (§5, §7)
-- ---------------------------------------------------------------------------

update public.settings
set value = to_jsonb('كل واحد فينا ينجم يكون فاعل فيه حسب مقدرته. اختار قداش زيتونة تحب تبدأ بيهم، وإحنا نرافقوك في الباقي.'::text)
where key = 'site.home_subheadline'
  and value = to_jsonb('كل واحد فينا ينجم يكون فاعل فيه حسب مقدرته.'::text);

update public.settings
set value = to_jsonb('واحد يبدأ بـ25، واحد بـ100، واحد بـ250. كل واحد حسب مقدرته، وكل زيتونة تقربنا من الهدف.'::text)
where key = 'site.start_text'
  and value = to_jsonb('تنجم تبدا بقدّ ما تنجم. 25 زيتونة كيف 250: الزوز يقرّبوا المشروع للمليون. الفرق في الوقت، موش في المكانة.'::text);

-- ---------------------------------------------------------------------------
-- The m² fact: the tree comes first, unit and area are set per project (§2, §3, §4)
-- ---------------------------------------------------------------------------

update public.settings
set value = $json$[
      {"value": "24", "label": "ولاية مفتوحة للتسجيل"},
      {"value": "0 د", "label": "تسجيل الاهتمام مجاني"},
      {"value": "م²", "label": "الوحدة والمساحة تتحدّدان في كل مشروع حسب عدد الزيتونات"}
    ]$json$::jsonb,
    description_ar = 'حقائق عن الخدمة فقط. ممنوع أي رقم يوحي بمردود أو ربح (PRN-01). مسودة، تُراجع من الإدارة: العنصر الثالث (م²) أُعيدت صياغته حسب البنود 2 و3 و4.'
where key = 'site.facts'
  and value = $json$[
      {"value": "24", "label": "ولاية مفتوحة للتسجيل"},
      {"value": "0 د", "label": "تسجيل الاهتمام مجاني"},
      {"value": "م²", "label": "المساحة وعدد الزيتونات معطيان مستقلّان"}
    ]$json$::jsonb;

-- ---------------------------------------------------------------------------
-- How it works: step 1 starts from the number of olive trees (§1)
-- ---------------------------------------------------------------------------

-- Only step 1 is replaced, and only while it is still the seed: the owner has already reworded later steps.
update public.settings
set value = jsonb_set(value, '{0}',
      $json${"title": "اختار عدد الزيتونات", "text": "قداش زيتونة تحب تبدأ بيهم؟ اختار العدد، نوع العرض، المنطقة والتسبقة اللي تناسبك. التسجيل مجاني."}$json$::jsonb),
    description_ar = concat_ws(' ', description_ar,
      'مسودة، تُراجع من الإدارة: الخطوة الأولى تبدأ من عدد الزيتونات (البند 1).')
where key = 'site.how_it_works'
  and jsonb_typeof(value) = 'array'
  and value->0 = $json${"title": "سجّل طلبك", "text": "اختر المنطقة، نوع المشروع، التسبقة والقسط الذي يناسبك. التسجيل مجاني."}$json$::jsonb;

-- ---------------------------------------------------------------------------
-- /start value line (0019): «نستثمر في أرضنا» becomes ownership vocabulary (§53)
-- ---------------------------------------------------------------------------

update public.settings s
set value = (
      select jsonb_agg(
               case
                 when e.item->>'ar' = 'نستثمر في أرضنا' then
                   e.item
                   || jsonb_build_object('ar', 'زيتونتنا في أرضنا')
                   || case when e.item->>'fr' = 'Nous investissons dans notre terre'
                           then jsonb_build_object('fr', 'Nos oliviers sur notre terre')
                           else '{}'::jsonb end
                 else e.item
               end
               order by e.ord)
      from jsonb_array_elements(s.value) with ordinality as e(item, ord)
    ),
    description_ar = concat_ws(' ', s.description_ar,
      'مسودة، تُراجع من الإدارة: «نستثمر في أرضنا» عُوّضت بـ«زيتونتنا في أرضنا» (البند 53).')
where s.key = 'start.values'
  and jsonb_typeof(s.value) = 'array'
  and s.value @> '[{"ar": "نستثمر في أرضنا"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- Goal list and the first WhatsApp message (§53). Codes stay; requests keep their snapshot (LEAD-02).
-- ---------------------------------------------------------------------------

update public.option_items
set label_ar = 'ملكية زيتون وأرض',
    label_fr = case when label_fr = 'Investissement' then 'Propriété d''oliviers et de terre' else label_fr end
where list_key = 'goal' and code = 'investment' and label_ar = 'استثمار';

update public.option_lists
set description_ar = 'استهلاك عائلي، ملكية زيتون وأرض، أو الاثنين. مسودة، تُراجع من الإدارة: تسمية «استثمار» عُوّضت بـ«ملكية زيتون وأرض» (البند 53)، والرمز investment باقٍ كما هو.'
where key = 'goal' and description_ar = 'استهلاك عائلي، استثمار، أو الاثنين.';

update public.message_templates
set body_ar = 'مرحبا {name}، معاك {agent} من AgriZed. نتصل بيك بخصوص مطلبك رقم {request_no} في مشروع المليون زيتونة. وقتاش يناسبك نحكيو؟',
    description_ar = 'أول رسالة WhatsApp يرسلها الـCommercial للحريف (CNT-04). مسودة، تُراجع من الإدارة: «للاستثمار في الزيتون» عُوّضت بـ«في مشروع المليون زيتونة» (البند 53).'
where key = 'lead.whatsapp_first_contact'
  and body_ar = 'مرحبا {name}، معاك {agent} من AgriZed. نتصل بيك بخصوص مطلبك رقم {request_no} للاستثمار في الزيتون. وقتاش يناسبك نحكيو؟';

-- ---------------------------------------------------------------------------
-- New copy: metadata, calls to action, the «عدد آخر» card (§1, §5, §7, §59)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('site.meta_title', to_jsonb('AgriZed · مشروع المليون زيتونة'::text),
   'text', 'site', 'عنوان الموقع في محرّكات البحث',
   'عنوان الصفحة الرئيسية في المتصفّح ومحرّكات البحث ومشاركة الروابط؛ الصفحات الأخرى تُكتب «اسم الصفحة · AgriZed». الاسم من البند 5.', true, 210),
  ('site.meta_title_fr', to_jsonb('AgriZed · Le projet du million d''oliviers'::text),
   'text', 'site', 'عنوان الموقع في محرّكات البحث (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 211),
  ('site.meta_description', to_jsonb('كل واحد فينا ينجم يكون فاعل في مشروع المليون زيتونة حسب مقدرته. اختار قداش زيتونة تحب تبدأ بيهم، وإحنا نرافقوك في الباقي.'::text),
   'text', 'site', 'وصف الموقع في محرّكات البحث',
   'الوصف تحت العنوان في نتائج البحث ومشاركة الروابط. نص البندين 1 و5.', true, 212),
  ('site.meta_description_fr', to_jsonb('Chacun de nous peut prendre part au projet du million d''oliviers selon ses moyens. Choisissez avec combien d''oliviers commencer, nous vous accompagnons pour la suite.'::text),
   'text', 'site', 'وصف الموقع في محرّكات البحث (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 213),

  ('site.cta_primary_label', to_jsonb('سجّل اهتمامك'::text),
   'text', 'site', 'نص الزر الرئيسي',
   'الزر الرئيسي في واجهة الصفحة الرئيسية وفي الدعوة الأخيرة وفي الشريط العلوي (تقرير v3 البند 17). اتركه فارغاً لإخفاء الزر.', true, 214),
  ('site.cta_primary_label_fr', to_jsonb('Enregistrez votre intérêt'::text),
   'text', 'site', 'نص الزر الرئيسي (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 215),
  ('site.cta_primary_target', to_jsonb('start'::text),
   'text', 'site', 'وجهة الزر الرئيسي',
   'start: صفحة «قدّاش زيتونة تحب تبدا بيهم؟» (/start) حيث يبدأ كل مسار. register: استمارة التسجيل مباشرة (/register). أي قيمة أخرى تُقرأ start.', true, 216),
  ('site.cta_secondary_label', to_jsonb('اكتشف كيفاش تخدم AgriZed'::text),
   'text', 'site', 'نص الزر الثانوي',
   'الزر الثاني في واجهة الصفحة الرئيسية ما دامت العروض غير منشورة للعموم، يفتح قسم «كيفاش تخدم AgriZed؟» (البند 5). اتركه فارغاً لإخفاء الزر.', true, 217),
  ('site.cta_secondary_label_fr', to_jsonb('Découvrez comment fonctionne AgriZed'::text),
   'text', 'site', 'نص الزر الثانوي (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 218),
  ('site.cta_offers_label', to_jsonb('شوف العروض'::text),
   'text', 'site', 'نص زر «شوف العروض»',
   'يعوّض الزر الثاني في واجهة الصفحة الرئيسية ويفتح صفحة العروض، فقط كي يكون موديول المشاريع منشوراً للعموم (تقرير v3 البند 17). اتركه فارغاً لإبقاء زر «كيفاش تخدم».', true, 225),
  ('site.cta_offers_label_fr', to_jsonb('Voir les offres'::text),
   'text', 'site', 'نص زر «شوف العروض» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 226),

  ('site.trees_other_card_label', to_jsonb('عدد آخر'::text),
   'text', 'site', 'بطاقة «عدد آخر»',
   'آخر بطاقة تحت «قدّاش زيتونة تحب تبدا بيهم؟» في الصفحة الرئيسية، تفتح خانة العدد المخصّص في /start (البند 7). اتركها فارغة لإخفاء البطاقة وإظهار رابط «عندك عدد آخر؟» بدلها.', true, 219),
  ('site.trees_other_card_label_fr', to_jsonb('Autre nombre'::text),
   'text', 'site', 'بطاقة «عدد آخر» (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 220),

  ('site.register_meta_title', to_jsonb('سجّل اهتمامك'::text),
   'text', 'site', 'عنوان صفحة التسجيل في محرّكات البحث', 'يُكتب «سجّل اهتمامك · AgriZed» في المتصفّح (تقرير v3 البند 17).', true, 221),
  ('site.register_meta_title_fr', to_jsonb('Enregistrez votre intérêt'::text),
   'text', 'site', 'عنوان صفحة التسجيل في محرّكات البحث (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 222),
  ('site.register_meta_description', to_jsonb('سجّل اهتمامك في مشروع المليون زيتونة: قداش زيتونة، وين، وكيفاش. التسجيل مجاني ولا يمثل التزاماً بالشراء.'::text),
   'text', 'site', 'وصف صفحة التسجيل في محرّكات البحث', 'مسودة، تُراجع من الإدارة.', true, 223),
  ('site.register_meta_description_fr', to_jsonb('Enregistrez votre intérêt pour le projet du million d''oliviers : combien d''oliviers, où et comment. L''inscription est gratuite et n''engage à aucun achat.'::text),
   'text', 'site', 'وصف صفحة التسجيل في محرّكات البحث (فرنسي)', 'مسودة، تُراجع من الإدارة.', true, 224),

  -- Not site copy: the list the database test checks every public text against.
  ('legal.forbidden_phrases', $json${
     "phrases": ["أرباح مضمونة", "دخل مضمون", "أفضل استثمار", "مردودية مضمونة"],
     "allowed_keys": ["site.faq", "legal.no_guarantee_notice", "legal.forbidden_phrases"]
   }$json$::jsonb,
   'json', 'legal', 'العبارات الممنوعة في الخطاب (البند 53)',
   'لا تظهر في الموقع. phrases: العبارات الحرفية من البند 53 التي يرفضها اختبار قاعدة البيانات في كل نص عمومي وتسمية قائمة ورسالة. allowed_keys: مفاتيح تُستثنى بالاسم لأنها تنفي هذه المعاني صراحةً (الأسئلة الشائعة، التنبيه القانوني).',
   false, 60)
on conflict (key) do nothing;
