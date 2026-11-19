-- 0177 · Two new people on the team: «عامل فلاحي» (worker) and «مراقب» (supervisor).
--
-- The owner, 2026-11-19: «نعطي تاش … توزيع ادوار بالنسبة للي مش يخدموا الفلاحة ولا مش يقلموا … يعطيني رابور
-- يصور لي شنو عمل … ولا مش يراقبهم نعطيه دور مراقب، يمشي ويصور ويشوف ويبروفي الخدمة».
--
-- Alone in its file on purpose: a value added to an enum cannot be used in the transaction that adds it, and
-- 0178 uses both. Neither role is staff in the CRM sense — app.is_staff() is NOT widened — so a worker reads
-- no client file, no price and no money; the farm-task RPCs (0178) name them explicitly.

alter type public.app_role add value if not exists 'worker';
alter type public.app_role add value if not exists 'supervisor';
