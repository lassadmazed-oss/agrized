-- 0017 · The tree-count cards, aligned with the homepage mock-up
--
-- The mock-up shows five numbers — 25, 50, 100, 250, 500 — then the open choice. «أكثر من 250»
-- stops making sense once 500 is on the card row, so it steps aside for «أكثر من 500».
-- Nothing here is code: AgriZed can add, rename or retire any of these from
-- Back Office → القوائم without a deploy (PRN-02).

insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order) values
  ('tree_count', 'trees_500',  '500 زيتونة',  '500 oliviers',  500, 500,  45),
  ('tree_count', 'trees_500p', 'أكثر من 500', 'Plus de 500',   500, null, 50)
on conflict (list_key, code) do nothing;

-- Retired, not deleted: requests already submitted keep their snapshot (LEAD-02).
update public.option_items
set is_active = false
where list_key = 'tree_count' and code = 'trees_250p';

update public.option_items
set sort_order = 60
where list_key = 'tree_count' and code = 'trees_any';
