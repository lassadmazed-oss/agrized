-- «قداش زيتونة تحب تبدأ بيهم؟» counts up (owner, 2026-09-21: «it should be numbered from the smallest to the
-- biggest»).
--
-- The row read 25 · 50 · 100 · 250 · 500 · أكثر من 500 · اقترحولي · 1. The smallest basket this product sells —
-- one olive tree, which is the whole idea of it — came last, after «اقترحولي». Not a layout bug:
-- option_items.sort_order is the owner's own ordering control in «الإعدادات ← القوائم», and «1 زيتونة» was added
-- after the others from the Back Office, so it took the next number free (70) and landed at the end.
--
-- FIXED IN THE DATA, not by sorting in the component. Sorting by min_number in code would put the list right
-- once and take the control away from him for ever — and it has no answer for «اقترحولي», which carries no
-- number at all and belongs last by meaning rather than by arithmetic.
--
-- Matched on the number, not the code: rows added from the Back Office get a generated code
-- (tree_count_mu45kida here), so «where code = 'trees_1'» would have matched nothing and passed silently.

update public.option_items
set sort_order = 5, updated_at = now()
where list_key = 'tree_count'
  and min_number = 1
  and coalesce(max_number, 1) = 1;
