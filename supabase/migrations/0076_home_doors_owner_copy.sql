-- The two cards carry the owner's own words (owner, 2026-09-22, written out verbatim).
--
-- 0075 replaced the card copy with a rewrite nobody asked for: the owner supplied these four lines exactly
-- and asked for them, not for a suggestion. They go in as written, down to the full stops.
--
-- The two hero buttons are the only part that was delegated («change these to something better»), so
-- «شوف العروض» and «عاونّي نختار» from 0075 stay.

update public.settings set value = to_jsonb('إلقى العرض المناسب'::text), updated_at = now()
 where key = 'site.app_guide_title';

update public.settings set value = to_jsonb('جاوب على بعض الأسئلة باش نعاونك تختار.'::text), updated_at = now()
 where key = 'site.app_guide_note';

update public.settings set value = to_jsonb('إكتشف العروض'::text), updated_at = now()
 where key = 'site.app_pick_title';

update public.settings set value = to_jsonb('تصفّح العروض المتوفّرة واختار بسهولة.'::text), updated_at = now()
 where key = 'site.app_pick_note';
