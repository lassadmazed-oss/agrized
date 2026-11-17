-- Idea 4 of the story (owner, 2026-11-17): «الإعلان يكمّل نفس الحكاية في الموقع». An ad tells one story — a tree
-- for a child, for parents, as a gift… — and the link it carries opens a page telling THAT story, not the home page.
--
-- Test: supabase/tests/112_story_links.sql
--
--   /story/<code>     one page per answer of the list tree_for (0164): its picture (site_media story.<code>), its
--                     title (story.titles), its line (start.for_lines), the timeline (0165) and «احسب زيتونتك» →
--                     /start with that answer given. The ad's utm_* are recorded by the site as on every page.
--   ad links          the Back Office prints each page's link per channel (story.ad_channels) with
--                     utm_campaign=story_<code>, so a request says which story and which network brought it.
--   «مازالت تستنّى»   a visitor who started /start and left finds a card bringing them back — kept in their own
--                     browser only (story.resume_days), no tracker, no pixel.
--   counts            public.staff_story_stats: per story, the requests that chose it and the ones its ads brought.

insert into public.site_media (slot, label_ar, description_ar, aspect, group_key, sort_order) values
  ('story.self', 'صورة حكاية: زيتونة باسمك', 'نفس روح الإعلان: شخص في ضيعة زيتون، ولا يدّين على جذع زيتونة. تظهر في أعلى /story/self وكي يتبعث الرابط.', '3/2', 'story', 10),
  ('story.child', 'صورة حكاية: زيتونة لولدك ولا بنتك', 'نفس روح الإعلان: طفل صغير بجنب زيتونة صغيرة، ولا عايلة تغرس مع ولدها. تظهر في أعلى /story/child وكي يتبعث الرابط.', '3/2', 'story', 20),
  ('story.parent', 'صورة حكاية: زيتونة لأمّك ولا بوك', 'نفس روح الإعلان: أم ولا بو في الضيعة، ولا دبوزة زيت على طاولة عايلة. تظهر في أعلى /story/parent وكي يتبعث الرابط.', '3/2', 'story', 30),
  ('story.gift', 'صورة حكاية: زيتونة هدية', 'نفس روح الإعلان: هدية: شهادة زيتونة في يدّ، ولا مناسبة عائلية. تظهر في أعلى /story/gift وكي يتبعث الرابط.', '3/2', 'story', 40),
  ('story.abroad', 'صورة حكاية: زيتونة في البلاد وإنت برّا', 'نفس روح الإعلان: تونسي برّا يتفرّج على ضيعتو من التلفون، ولا طريق ريفي في البلاد. تظهر في أعلى /story/abroad وكي يتبعث الرابط.', '3/2', 'story', 50)
on conflict (slot) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('story.titles', '{"self":{"ar":"زيتونة باسمك","fr":"Un olivier à votre nom"},"child":{"ar":"زيتونة لولدك ولا بنتك","fr":"Un olivier pour votre enfant"},"parent":{"ar":"زيتونة لأمّك ولا بوك","fr":"Un olivier pour vos parents"},"gift":{"ar":"زيتونة هدية","fr":"Un olivier en cadeau"},"abroad":{"ar":"زيتونة في البلاد وإنت برّا","fr":"Un olivier au pays, même de loin"}}'::jsonb, 'json', 'story', 'صفحات الحكايات: العناوين', 'عنوان كل صفحة /story/<code>، بالعربي (ar) وبالفرنسي (fr).', true, 10),
  ('story.resume_days', to_jsonb(30), 'integer', 'story', 'تذكير «زيتونتك مازالت تستنّى»: كم يوم',
   'بعد هالعدد من الأيام، الاختيارات المحفوظة في تلفون الزائر ما عادش تتذكّر.', true, 11),
  ('story.ad_channels', '["facebook","instagram","tiktok","whatsapp"]'::jsonb, 'json', 'story', 'روابط الإعلانات: الشبكات',
   'الشبكات اللي تتعمل لها روابط جاهزة في الـBack Office (utm_source).', false, 12)
on conflict (key) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'story.titles', 'value', 'fr', '{"self":{"ar":"Un olivier à votre nom","fr":"Un olivier à votre nom"},"child":{"ar":"Un olivier pour votre enfant","fr":"Un olivier pour votre enfant"},"parent":{"ar":"Un olivier pour vos parents","fr":"Un olivier pour vos parents"},"gift":{"ar":"Un olivier en cadeau","fr":"Un olivier en cadeau"},"abroad":{"ar":"Un olivier au pays, même de loin","fr":"Un olivier au pays, même de loin"}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'story.titles', 'value', 'de', '{"self":{"ar":"Ein Olivenbaum auf Ihren Namen","fr":"Un olivier à votre nom"},"child":{"ar":"Ein Olivenbaum für Ihr Kind","fr":"Un olivier pour votre enfant"},"parent":{"ar":"Ein Olivenbaum für Ihre Eltern","fr":"Un olivier pour vos parents"},"gift":{"ar":"Ein Olivenbaum als Geschenk","fr":"Un olivier en cadeau"},"abroad":{"ar":"Ein Olivenbaum in der Heimat, auch aus der Ferne","fr":"Un olivier au pays, même de loin"}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'story.titles', 'value', 'it', '{"self":{"ar":"Un olivo a tuo nome","fr":"Un olivier à votre nom"},"child":{"ar":"Un olivo per tuo figlio","fr":"Un olivier pour votre enfant"},"parent":{"ar":"Un olivo per i tuoi genitori","fr":"Un olivier pour vos parents"},"gift":{"ar":"Un olivo in regalo","fr":"Un olivier en cadeau"},"abroad":{"ar":"Un olivo in patria, anche da lontano","fr":"Un olivier au pays, même de loin"}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;
insert into public.translations (entity, entity_key, field, locale, value, is_draft)
values ('setting', 'story.titles', 'value', 'en', '{"self":{"ar":"An olive tree in your name","fr":"Un olivier à votre nom"},"child":{"ar":"An olive tree for your child","fr":"Un olivier pour votre enfant"},"parent":{"ar":"An olive tree for your parents","fr":"Un olivier pour vos parents"},"gift":{"ar":"An olive tree as a gift","fr":"Un olivier en cadeau"},"abroad":{"ar":"An olive tree back home, even from afar","fr":"Un olivier au pays, même de loin"}}'::jsonb, true)
on conflict (entity, entity_key, field, locale) do nothing;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('story.cta', to_jsonb('احسب زيتونتك'::text), 'text', 'story', 'صفحة الحكاية: الزرّ الرئيسي', null, true, 20),
  ('story.offers_cta', to_jsonb('شوف العروض الموجودة'::text), 'text', 'story', 'صفحة الحكاية: زرّ العروض', null, true, 21),
  ('story.resume_title', to_jsonb('زيتونتك مازالت تستنّى'::text), 'text', 'story', 'تذكير: العنوان', null, true, 22),
  ('story.resume_named', to_jsonb('زيتونتك «{name}» مازالت تستنّى'::text), 'text', 'story', 'تذكير: العنوان مع اسم الزيتونة ({name})', null, true, 23),
  ('story.resume_line', to_jsonb('كمّل من وين وقفت: اختياراتك محفوظة في هذا التلفون برك.'::text), 'text', 'story', 'تذكير: السطر', null, true, 24),
  ('story.resume_cta', to_jsonb('كمّل'::text), 'text', 'story', 'تذكير: زرّ الرجوع', null, true, 25),
  ('story.resume_dismiss', to_jsonb('موش توّا'::text), 'text', 'story', 'تذكير: زرّ الإخفاء', null, true, 26)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'story.cta', 'value', 'fr', to_jsonb('Calculez votre olivier'::text), true),
  ('setting', 'story.cta', 'value', 'de', to_jsonb('Ihren Olivenbaum berechnen'::text), true),
  ('setting', 'story.cta', 'value', 'it', to_jsonb('Calcola il tuo olivo'::text), true),
  ('setting', 'story.cta', 'value', 'en', to_jsonb('Work out your tree'::text), true),
  ('setting', 'story.offers_cta', 'value', 'fr', to_jsonb('Voir les offres disponibles'::text), true),
  ('setting', 'story.offers_cta', 'value', 'de', to_jsonb('Verfügbare Angebote ansehen'::text), true),
  ('setting', 'story.offers_cta', 'value', 'it', to_jsonb('Vedi le offerte disponibili'::text), true),
  ('setting', 'story.offers_cta', 'value', 'en', to_jsonb('See the offers available'::text), true),
  ('setting', 'story.resume_title', 'value', 'fr', to_jsonb('Votre olivier vous attend toujours'::text), true),
  ('setting', 'story.resume_title', 'value', 'de', to_jsonb('Ihr Olivenbaum wartet noch'::text), true),
  ('setting', 'story.resume_title', 'value', 'it', to_jsonb('Il tuo olivo ti aspetta ancora'::text), true),
  ('setting', 'story.resume_title', 'value', 'en', to_jsonb('Your olive tree is still waiting'::text), true),
  ('setting', 'story.resume_named', 'value', 'fr', to_jsonb('Votre olivier « {name} » vous attend toujours'::text), true),
  ('setting', 'story.resume_named', 'value', 'de', to_jsonb('Ihr Olivenbaum „{name}“ wartet noch'::text), true),
  ('setting', 'story.resume_named', 'value', 'it', to_jsonb('Il tuo olivo «{name}» ti aspetta ancora'::text), true),
  ('setting', 'story.resume_named', 'value', 'en', to_jsonb('Your olive tree “{name}” is still waiting'::text), true),
  ('setting', 'story.resume_line', 'value', 'fr', to_jsonb('Reprenez là où vous vous êtes arrêté : vos choix sont gardés sur cet appareil seulement.'::text), true),
  ('setting', 'story.resume_line', 'value', 'de', to_jsonb('Machen Sie dort weiter, wo Sie aufgehört haben: Ihre Auswahl ist nur auf diesem Gerät gespeichert.'::text), true),
  ('setting', 'story.resume_line', 'value', 'it', to_jsonb('Riprendi da dove avevi lasciato: le tue scelte restano solo su questo dispositivo.'::text), true),
  ('setting', 'story.resume_line', 'value', 'en', to_jsonb('Pick up where you left off: your choices are kept on this device only.'::text), true),
  ('setting', 'story.resume_cta', 'value', 'fr', to_jsonb('Continuer'::text), true),
  ('setting', 'story.resume_cta', 'value', 'de', to_jsonb('Weiter'::text), true),
  ('setting', 'story.resume_cta', 'value', 'it', to_jsonb('Continua'::text), true),
  ('setting', 'story.resume_cta', 'value', 'en', to_jsonb('Continue'::text), true),
  ('setting', 'story.resume_dismiss', 'value', 'fr', to_jsonb('Pas maintenant'::text), true),
  ('setting', 'story.resume_dismiss', 'value', 'de', to_jsonb('Nicht jetzt'::text), true),
  ('setting', 'story.resume_dismiss', 'value', 'it', to_jsonb('Non ora'::text), true),
  ('setting', 'story.resume_dismiss', 'value', 'en', to_jsonb('Not now'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;

-- Per story, over the last p_days: the requests that answered it, the ones its ads brought (utm_campaign =
-- story_<code>), and which networks those came from. Counts only — no person — for any staff member.
create or replace function public.staff_story_stats(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 3650)));
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'code', o.code, 'label_ar', o.label_ar,
             'requests', (select count(*) from public.interest_requests r
                          where r.tree_for_option_id = o.id and r.created_at >= v_since),
             'from_ads', (select count(*) from public.interest_requests r
                          where r.source->>'utm_campaign' = 'story_' || o.code and r.created_at >= v_since),
             'sources', (select coalesce(jsonb_object_agg(x.s, x.n), '{}'::jsonb)
                         from (select r.source->>'utm_source' as s, count(*) as n
                               from public.interest_requests r
                               where r.source->>'utm_campaign' = 'story_' || o.code and r.created_at >= v_since
                                 and r.source ? 'utm_source'
                               group by 1) x))
           order by o.sort_order), '[]'::jsonb)
    from public.option_items o
    where o.list_key = 'tree_for' and o.is_active
  );
end $$;
revoke execute on function public.staff_story_stats(integer) from public, anon;
grant execute on function public.staff_story_stats(integer) to authenticated;
