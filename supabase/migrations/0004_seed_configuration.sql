-- 0004 · Initial configuration
-- Starting values only. Every row below is editable from the Back Office (PRN-02).
-- Values marked "example" come from the spec examples and must be confirmed by AgriZed.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  -- Site texts (spec 4)
  ('site.home_headline', to_jsonb('استثمر في الزيتون حسب قدرتك.'::text), 'text', 'site',
   'الرسالة الرئيسية', 'العنوان الكبير في أعلى الصفحة الرئيسية.', true, 10),
  ('site.home_subheadline', to_jsonb('اختر المنطقة، نوع المشروع، التسبقة والقسط الشهري الذي يناسبك، وسجّل اهتمامك. AgriZed تبحث عن المشاريع المطابقة للطلب الحقيقي.'::text), 'text', 'site',
   'النص تحت الرسالة الرئيسية', null, true, 20),
  ('site.free_interest_notice', to_jsonb('تسجيل الاهتمام مجاني ولا يمثل التزاماً بالشراء.'::text), 'text', 'site',
   'نص مجانية التسجيل', 'يظهر بجانب زر التسجيل وفي الفورمولير (HOME-01، LEAD-09).', true, 30),
  ('site.vision_title', to_jsonb('10 ملايين زيتونة'::text), 'text', 'site', 'عنوان الرؤية', null, true, 40),
  ('site.vision_text', to_jsonb('ملكية فردية، خدمة منظمة، وقيمة اقتصادية جماعية.'::text), 'text', 'site', 'نص الرؤية', null, true, 50),
  ('brand.tagline_ar', to_jsonb('خطوات صغيرة، جذور كبيرة.'::text), 'text', 'site',
   'الشعار بالعربية', 'ترجمة مقترحة لـ «Petits pas, grandes racines».', true, 60),
  ('brand.tagline_fr', to_jsonb('Petits pas, grandes racines'::text), 'text', 'site', 'الشعار بالفرنسية', null, true, 70),
  ('site.contact_phone', to_jsonb(''::text), 'text', 'site', 'هاتف AgriZed', 'يُعرض في أسفل الموقع إن لم يكن فارغاً.', true, 80),
  ('site.contact_whatsapp', to_jsonb(''::text), 'text', 'site', 'رقم WhatsApp لـ AgriZed', 'بصيغة دولية، مثال: +21600000000', true, 90),
  ('site.contact_email', to_jsonb(''::text), 'text', 'site', 'بريد AgriZed', null, true, 100),

  -- Legal texts (PRN-01)
  ('legal.no_guarantee_notice', to_jsonb('AgriZed لا تضمن أي إنتاج أو مردود مالي. كل الأرقام المعروضة تقديرية وغير ملزمة.'::text), 'text', 'legal',
   'التنبيه القانوني', 'يظهر إلزامياً في المحاكي وصفحات المشاريع. يمكن تعديل النص فقط.', true, 10),
  ('legal.consent_text', to_jsonb('أوافق على أن تتصل بي AgriZed بخصوص طلبي، وعلى معالجة معطياتي الشخصية لهذا الغرض فقط.'::text), 'text', 'legal',
   'نص الموافقة', 'يُحفظ كما هو مع كل مطلب.', true, 20),
  ('legal.land_offer_notice', to_jsonb('إرسال العرض لا يمثل التزاماً بالشراء من AgriZed. كل عقار يخضع لدراسة قانونية وفنية وميدانية.'::text), 'text', 'legal',
   'تنبيه عروض العقارات', null, true, 30),

  -- Interest form (D-01, D-02: spec proposals)
  ('lead.project_types_multi', 'true'::jsonb, 'boolean', 'lead',
   'السماح باختيار أكثر من نوع مشروع', 'القرار D-01.', true, 10),
  ('lead.allow_international_phone', 'false'::jsonb, 'boolean', 'lead',
   'قبول أرقام هاتف أجنبية', 'للتونسيين بالخارج. القرار D-02.', true, 20),
  ('request_no.prefix', to_jsonb('AGZ'::text), 'text', 'lead', 'بادئة رقم المطلب', 'مثال: AGZ-2026-000123', false, 30),
  ('land_offer_no.prefix', to_jsonb('AGZ-LND'::text), 'text', 'lead', 'بادئة رقم عرض العقار', null, false, 40),
  ('crm.auto_assign_mode', to_jsonb('manual'::text), 'text', 'lead',
   'إسناد المطالب الجديدة', 'manual: يدوياً من Admin · round_robin: بالتناوب على الـCommercials النشطين.', false, 50),

  -- Anti-abuse (LEAD-06, LAND-03)
  ('antispam.max_requests_per_ip_per_hour', '10'::jsonb, 'integer', 'antispam',
   'أقصى عدد مطالب لكل عنوان IP في الساعة', null, false, 10),
  ('antispam.max_requests_per_phone_per_day', '3'::jsonb, 'integer', 'antispam',
   'أقصى عدد مطالب لنفس الرقم في اليوم', null, false, 20),
  ('antispam.max_land_offers_per_ip_per_day', '5'::jsonb, 'integer', 'antispam',
   'أقصى عدد عروض عقارات لكل عنوان IP في اليوم', null, false, 30),
  ('land_offer.max_file_size_mb', '10'::jsonb, 'integer', 'antispam',
   'الحجم الأقصى لكل ملف (ميغابايت)', 'لا يتجاوز 20.', true, 40),
  ('land_offer.max_files', '10'::jsonb, 'integer', 'antispam', 'أقصى عدد ملفات لكل عرض', null, true, 50),

  -- Phase 1 simulator (SIM-01..03)
  ('simulator.durations_months', '[36, 48, 60]'::jsonb, 'json', 'simulator',
   'المدد المعروضة في المحاكي المبدئي (بالأشهر)', 'مثال. تُحسب القدرة التقديرية على كل مدة.', true, 10);

-- ---------------------------------------------------------------------------
-- Feature flags (spec 3.1). Phase 1 public, later phases disabled.
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, state, phase, label_ar, description_ar, sort_order) values
  ('interest_form',   'public',   1, 'سجّل اهتمامك', 'فورمولير تسجيل الاهتمام (البند 5).', 10),
  ('simulator_basic', 'public',   1, 'المحاكي المبدئي «احسب قدرتك»', 'البند 7.1.', 20),
  ('land_offers',     'public',   1, 'عندك أرض أو ضيعة؟', 'فورمولير أصحاب العقارات (البند 9).', 30),
  ('projects',        'disabled', 2, 'المشاريع', 'قسم المشاريع ومحاكي المشروع (البندان 7.2 و10).', 40),
  ('matching',        'disabled', 2, 'الـMatching', 'اقتراح الحرفاء المطابقين (البند 8.3).', 50),
  ('visits',          'disabled', 2, 'الزيارات الميدانية', 'البند 12.', 60),
  ('reservations',    'disabled', 2, 'العربون والحجز', 'البند 13.', 70),
  ('contracts',       'disabled', 3, 'العقود ووعد البيع', 'البند 14.', 80),
  ('installments',    'disabled', 3, 'الأقساط', 'البند 15.', 90),
  ('zitounti',        'disabled', 4, 'فضاء «زيتونتي»', 'البند 17.', 100),
  ('subscriptions',   'disabled', 4, 'الاشتراك السنوي', 'البند 18.', 110),
  ('agri_backoffice', 'disabled', 4, 'الـBack Office الفلاحي', 'البند 20.', 120),
  ('harvest',         'disabled', 4, 'الصابة والجني', 'البند 19.', 130);

-- ---------------------------------------------------------------------------
-- Option lists (LEAD-01)
-- ---------------------------------------------------------------------------

insert into public.option_lists (key, label_ar, value_kind, description_ar) values
  ('down_payment',        'التسبقة',                 'money',      'قيم التسبقة في فورمولير التسجيل والمحاكي.'),
  ('monthly_installment', 'القسط الشهري',            'money',      'قيم القسط الشهري في فورمولير التسجيل والمحاكي.'),
  ('goal',                'الهدف',                   'code',       'استهلاك عائلي، استثمار، أو الاثنين.'),
  ('contact_time',        'الوقت المفضل للتواصل',    'time_range', 'بتوقيت تونس.'),
  ('property_type',       'نوع العقار',              'plain',      'في فورمولير أصحاب الأراضي.'),
  ('tree_age',            'عمر الأشجار',             'plain',      'في فورمولير أصحاب الأراضي.'),
  ('land_document',       'الوثائق المتوفرة',        'plain',      'في فورمولير أصحاب الأراضي.');

-- Example values from the spec (5.1)
insert into public.option_items (list_key, code, label_ar, label_fr, min_millimes, sort_order) values
  ('down_payment', 'dp_500',  '500 د.ت',   '500 DT',   500000,  10),
  ('down_payment', 'dp_1000', '1,000 د.ت', '1 000 DT', 1000000, 20),
  ('down_payment', 'dp_1500', '1,500 د.ت', '1 500 DT', 1500000, 30),
  ('down_payment', 'dp_2000', '2,000 د.ت', '2 000 DT', 2000000, 40),
  ('down_payment', 'dp_3000', '3,000 د.ت', '3 000 DT', 3000000, 50),
  ('monthly_installment', 'mi_50',  '50 د.ت',  '50 DT',  50000,  10),
  ('monthly_installment', 'mi_60',  '60 د.ت',  '60 DT',  60000,  20),
  ('monthly_installment', 'mi_70',  '70 د.ت',  '70 DT',  70000,  30),
  ('monthly_installment', 'mi_80',  '80 د.ت',  '80 DT',  80000,  40),
  ('monthly_installment', 'mi_100', '100 د.ت', '100 DT', 100000, 50);

insert into public.option_items (list_key, code, label_ar, label_fr, sort_order) values
  ('goal', 'family',     'استهلاك عائلي', 'Consommation familiale', 10),
  ('goal', 'investment', 'استثمار',       'Investissement',         20),
  ('goal', 'both',       'الاثنين',       'Les deux',               30),
  ('property_type', 'bare_land',  'أرض بيضاء',    'Terre nue',       10),
  ('property_type', 'olive_farm', 'ضيعة زيتون',   'Oliveraie',       20),
  ('property_type', 'mixed_farm', 'ضيعة مختلطة', 'Exploitation mixte', 30),
  ('property_type', 'other',      'أخرى',         'Autre',           40),
  ('tree_age', 'age_lt5',   'أقل من 5 سنوات',   'Moins de 5 ans', 10),
  ('tree_age', 'age_5_15',  'من 5 إلى 15 سنة',  '5 à 15 ans',     20),
  ('tree_age', 'age_15_40', 'من 15 إلى 40 سنة', '15 à 40 ans',    30),
  ('tree_age', 'age_gt40',  'أكثر من 40 سنة',   'Plus de 40 ans', 40),
  ('land_document', 'land_title',      'رسم عقاري',    'Titre foncier',          10),
  ('land_document', 'ownership_deed',  'عقد ملكية',    'Acte de propriété',      20),
  ('land_document', 'hujja',           'حجة',          'Hojja',                  30),
  ('land_document', 'possession_cert', 'شهادة حوز',    'Certificat de possession', 40),
  ('land_document', 'survey_plan',     'مثال هندسي',   'Plan topographique',     50),
  ('land_document', 'other',           'وثائق أخرى',   'Autres documents',       60);

insert into public.option_items (list_key, code, label_ar, label_fr, time_from, time_to, sort_order) values
  ('contact_time', 'morning',   'صباحاً',     'Matin',       '08:00', '12:00', 10),
  ('contact_time', 'afternoon', 'بعد الظهر', 'Après-midi',  '12:00', '17:00', 20),
  ('contact_time', 'evening',   'مساءً',      'Soir',        '17:00', '20:00', 30);

-- ---------------------------------------------------------------------------
-- Project types (spec 1)
-- ---------------------------------------------------------------------------

insert into public.project_types (code, label_ar, label_fr, description_ar, sort_order) values
  ('bare_land',       'أرض بيضاء للغراسة',      'Terre à planter',            'قطعة أرض معدّة للغراسة، دون أشجار.', 10),
  ('young_olive',     'زيتون مغروس حديثاً',     'Oliviers jeunes',            'أشجار فتية في سنواتها الأولى.',      20),
  ('near_production', 'زيتون قريب من الإنتاج', 'Oliviers bientôt productifs', 'أشجار تقترب من أول صابة.',           30),
  ('productive',      'زيتون منتج',             'Oliviers productifs',        'أشجار في طور الإنتاج.',              40);

-- ---------------------------------------------------------------------------
-- File statuses (spec 8.1)
-- ---------------------------------------------------------------------------

insert into public.lead_statuses (stage, label_ar, label_fr, sort_order, is_stage_default) values
  ('new',         'جديد',                    'Nouveau',                10,  true),
  ('contacting',  'قيد الاتصال',             'En cours de contact',    20,  true),
  ('qualified',   'مؤهَّل',                  'Qualifié',               30,  true),
  ('qualified',   'في انتظار مشروع مطابق',   'En attente de projet',   40,  false),
  ('proposed',    'تم اقتراح مشروع',         'Projet proposé',         50,  true),
  ('visit',       'زيارة مبرمجة',            'Visite planifiée',       60,  true),
  ('visit',       'تمت الزيارة',             'Visite effectuée',       70,  false),
  ('reserved',    'حجز',                     'Réservé',                80,  true),
  ('contracting', 'في طور التعاقد',          'En contractualisation',  90,  true),
  ('owner',       'مالك',                    'Propriétaire',           100, true),
  ('paused',      'غير مهتم حالياً',         'Pas intéressé pour le moment', 110, true),
  ('closed',      'مغلق',                    'Clôturé',                120, true);

-- ---------------------------------------------------------------------------
-- Message templates
-- ---------------------------------------------------------------------------

insert into public.message_templates (key, channel, body_ar, description_ar, variables) values
  ('lead.confirmation', 'sms',
   'AgriZed: شكراً {name}، سجّلنا مطلبك رقم {request_no}. سنتصل بك قريباً. التسجيل مجاني ولا يمثل التزاماً بالشراء.',
   'تأكيد تسجيل الاهتمام (البند 5.3).', array['name', 'request_no']),
  ('land_offer.confirmation', 'sms',
   'AgriZed: شكراً {name}، استلمنا عرض عقارك برقم {reference_no}. سندرسه ونتصل بك. الإرسال لا يمثل التزاماً بالشراء.',
   'تأكيد استلام عرض عقار (LAND-05).', array['name', 'reference_no']);
