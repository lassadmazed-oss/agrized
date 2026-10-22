-- 0150 · الثمن بالحروف — the switch behind the written-out price.
--
-- Its test is supabase/tests/097_money_words.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0150_money_words.sql supabase/tests/097_money_words.sql
--
-- THE OWNER'S COMPLAINT (2026-10-22): «فما فيرجول… تعملها فيرجول، تقولش عليها المليون، يولي تقولش عليها
-- الألف دينار، يولي تقولش عليها ألف فرنك». A Tunisian reading «4,450,000» has three honest readings of it,
-- because «مليون» in daily speech is a thousand dinars and «فرنك» is a millime. The separator is ambiguous
-- and so is the unit, and no punctuation fixes a word that means two things.
--
-- TWO CHANGES ANSWER IT, and only one of them is in this file.
--
--   1. The thousands separator on the Arabic site stops being a comma and becomes U+202F, the narrow
--      no-break space — which is what app.money_ar has printed in every SMS since the money work, so the
--      site also stops disagreeing with its own messages. That is src/lib/format.ts and needs no setting:
--      a comma there was never a choice anyone made.
--
--   2. The amount is written out beside the figure, the way it is written on a cheque: «أربعة آلاف
--      وأربعمائة وخمسون ديناراً». Not on every figure on the site — on the three a buyer DECIDES on, where
--      a misread number costs him money. src/lib/money-words.ts holds the grammar and says why it is
--      Arabic only.
--
-- THIS SETTING IS THE SWITCH FOR THE SECOND. It is here because the owner may want the words off — on a
-- crowded screen, or for a price list where every line would carry a sentence — and that should not need a
-- deploy. Default on, which is what he asked for.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('money.show_words', to_jsonb(true), 'boolean', 'ui', 'الثمن بالحروف',
        'يكتب الثمن بالحروف تحت الرقم في الصفحات اللي يقرّر فيها الحريف: «أربعة آلاف وأربعمائة وخمسون ديناراً». بالعربي برك — الفيرجول والكلمة «مليون» ما يلبسوش كان في العربي. كي تطفيه، يبقى الرقم وحدو.',
        true, 430)
on conflict (key) do nothing;
