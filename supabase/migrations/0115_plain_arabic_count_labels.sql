-- 0115 · أربع كلمات تحت الأرقام — PLAIN ARABIC FOR THE FOUR COUNT LABELS.
--
-- 0111 seeded site.tab_trees, site.stat_people, site.stat_hectares and site.stat_governorates — the words
-- under the home page's figures — in plural syntax, `{count, plural, other {زيتونة}}`, so that their
-- translations could inflect on the figure. The Arabic never inflects them (the figure is printed above the
-- word), and the site that was live while this was written reads these keys as plain text: it printed the
-- syntax itself to visitors. The Arabic goes back to the plain word; the translations keep their plurals,
-- which the formatter resolves from the `count` the page passes and the Back Office accepts (a plural over a
-- variable the Arabic does not print is allowed — src/lib/i18n/message.ts, messageArguments printedOnly).

update public.settings set value = to_jsonb('زيتونة'::text) where key = 'site.tab_trees' and value = to_jsonb('{count, plural, other {زيتونة}}'::text);
update public.settings set value = to_jsonb('مستثمر'::text) where key = 'site.stat_people' and value = to_jsonb('{count, plural, other {مستثمر}}'::text);
update public.settings set value = to_jsonb('هكتار'::text) where key = 'site.stat_hectares' and value = to_jsonb('{count, plural, other {هكتار}}'::text);
update public.settings set value = to_jsonb('ولاية'::text) where key = 'site.stat_governorates' and value = to_jsonb('{count, plural, other {ولاية}}'::text);
