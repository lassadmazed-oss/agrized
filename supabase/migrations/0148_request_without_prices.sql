-- 0148 · what «مطالبي» says about a request that never carried a price.
--
-- Its test is supabase/tests/095_request_without_prices.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0148_request_without_prices.sql supabase/tests/095_request_without_prices.sql
--
-- WHAT THE OWNER SAW (2026-10-22, reading the demo client's own file): a request card with its number, its
-- date, and under them one sentence — «هذي الأثمان كيما كانت نهار بعثت المطلب، موش أثمان اليوم» — and no
-- prices. Every figure on that card is printed only when the request carries it, and a plain «سجّل اهتمامك»
-- carries none of them: no tree count, no price per tree, no total, no annual fee. The note was printed
-- unconditionally underneath, so the card explained the prices it had just not shown. In his words: «هو ما
-- عطيني حتى ثمن… ما عطينيش حتى ديتاي… نحيوها هذه. المطلب هذايا: احنا تو نتصلوا بيك».
--
-- So the sentence under the card now depends on whether there are figures over it. When there are, the note
-- is the one that has always been there and is not decoration — 0111's comment is right that the annual fee
-- has changed more than once under live requests, and a client is owed the number he was shown. When there
-- are none, the card says the true thing instead: we have your interest, we will call you.
--
-- NO COLUMN AND NO FUNCTION CHANGES. The requests section already publishes every figure as null when the
-- request has none; this adds the second sentence and the screen chooses between them.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('ui.zitounti.request_no_prices',
        to_jsonb('هذا المطلب ما فيهش أثمان — سجّلنا اهتمامك، وفريقنا باش يتصل بيك.'::text),
        'text', 'ui', 'ملاحظة مطلب بلا أثمان',
        'جزء «مطالبي»: تظهر عوض ملاحظة الأثمان كي يكون المطلب ما فيه حتى رقم (تسجيل اهتمام ساذج).',
        true, 421)
on conflict (key) do nothing;

insert into public.translations (entity, entity_key, field, locale, value, is_draft)
select 'setting', 'ui.zitounti.request_no_prices', 'value', l.locale, to_jsonb(l.value), true
from (values
  ('fr', 'Cette demande ne contient aucun prix — nous avons bien noté votre intérêt et notre équipe vous appellera.'),
  ('de', 'Diese Anfrage enthält keine Preise — wir haben Ihr Interesse notiert und melden uns bei Ihnen.'),
  ('it', 'Questa richiesta non contiene prezzi — abbiamo registrato il tuo interesse e ti chiameremo.'),
  ('en', 'This request carries no prices — we have noted your interest and our team will call you.')
) as l(locale, value)
on conflict (entity, entity_key, field, locale) do nothing;
