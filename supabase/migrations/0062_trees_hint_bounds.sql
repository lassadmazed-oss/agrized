-- One sentence, both bounds (owner, 2026-09-19, reading the live offer page for TX-00215).
--
-- The form said «من زيتونة وحدة إلى 8,000 زيتونة. أقلّ عدد في هذا العرض: 20 زيتونة.» — it offered one tree and
-- then refused fewer than twenty, in the same breath. The page no longer prints both (it now drops the range
-- sentence when an offer has a minimum above one), but the range itself still claimed «من زيتونة وحدة», which is
-- only true for an offer that sells one at a time.
--
-- The page already reads it the better way: when offers.trees_hint carries {min}, that one sentence is shown
-- ALONE and both bounds come from the offer. So the fix belongs here, in the copy, not in the code —
-- src/app/(public)/projects/[code]/page.tsx:143-145 needs no change.
--
-- offers.min_trees_hint stays as it is: an offer whose minimum is one shows the range sentence and nothing else,
-- and the day the owner rewrites this row without {min} the old two-sentence behaviour comes back on its own.

update public.settings
set value = to_jsonb('من {min} زيتونة إلى {max} زيتونة.'::text), updated_at = now()
where key = 'offers.trees_hint' and value #>> '{}' not like '%{min}%';

update public.settings
set value = to_jsonb('De {min} à {max} oliviers.'::text), updated_at = now()
where key = 'offers.trees_hint_fr' and value #>> '{}' not like '%{min}%';
