-- 0146 · the card that describes the parcel wins; the open-ended one answers only for what no card claims.
--
-- THIS FILE OWNS EVERY CARD IT ASKS ABOUT. The whole point is which of two overlapping cards is chosen, so
-- reading the owner's live ladder would make the answer depend on what he last pressed in the Back Office.
-- Rolled back with the rest, like every file here.
do $$
declare
  v_admin   uuid;
  v_project uuid;
  v_parcel  uuid;
  v_exact   uuid;
  v_open    uuid;
  v_out     jsonb;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
  if v_admin is null then
    raise notice 'no admin in this database; nothing to prove here';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Nothing of the owner's may answer: his ladder is emptied for the length of this transaction.
  update public.option_items set is_active = false where list_key = 'tree_count';

  insert into public.option_items (list_key, code, label_ar, label_fr, min_number, max_number, sort_order, is_active)
  values ('tree_count', 'test_sugg_70', '70 زيتونة', '70 oliviers', 70, 70, 9101, true),
         ('tree_count', 'test_sugg_open', 'أكثر من 50', 'Plus de 50', 50, null, 9102, true)
  on conflict (list_key, code) do update set
    min_number = excluded.min_number, max_number = excluded.max_number, is_active = true;

  select o.id into v_exact from public.option_items o where o.list_key = 'tree_count' and o.code = 'test_sugg_70';
  select o.id into v_open  from public.option_items o where o.list_key = 'tree_count' and o.code = 'test_sugg_open';

  insert into public.projects (code, name, governorate_id, status)
  values ('SUGG-T', 'عرض اختبار الاقتراح', 34, 'published')
  returning id into v_project;

  insert into public.parcels (project_id, code, area_m2, property_type, plantation_system, olive_tree_count,
                              production_status, irrigation, cash_price_millimes, annual_costs_millimes, status, sort_order)
  values (v_project, 'T01', 7000, 'planted', 'traditional', 70, 'producing', 'rainfed', 5000000, 120000, 'available', 10)
  returning id into v_parcel;

  -- 1 · Both cards hold 70. The one that says 70 answers, and «أكثر من 50» — whose floor is lower — does not.
  v_out := app.parcel_offer_payload(v_parcel, null, null, true);
  assert (v_out->>'suggested_tree_count_option_id')::uuid = v_exact,
    'the open-ended card answered for a parcel an exact card describes';

  -- 2 · At the open card's own floor, where the two share a number, the exact card still wins — this is the
  --     tie that had no tie-break at all before, so it is asserted rather than assumed.
  update public.option_items set min_number = 70, max_number = null where id = v_open;
  v_out := app.parcel_offer_payload(v_parcel, null, null, true);
  assert (v_out->>'suggested_tree_count_option_id')::uuid = v_exact,
    'two cards sharing a floor still answer at random';
  update public.option_items set min_number = 50 where id = v_open;

  -- 3 · A count no exact card claims is exactly what the open-ended card is for.
  update public.parcels set olive_tree_count = 300 where id = v_parcel;
  v_out := app.parcel_offer_payload(v_parcel, null, null, true);
  assert (v_out->>'suggested_tree_count_option_id')::uuid = v_open,
    'a count no card describes was left without the open-ended card';

  -- 4 · Under every floor there is no card, and the function says so rather than guessing the nearest.
  update public.parcels set olive_tree_count = 3 where id = v_parcel;
  v_out := app.parcel_offer_payload(v_parcel, null, null, true);
  assert v_out->'suggested_tree_count_option_id' = 'null'::jsonb,
    'a count below every card was given one anyway';

  -- 5 · A retired card never answers, however well it fits (LEAD-01, and 0145 retires one).
  update public.parcels set olive_tree_count = 70 where id = v_parcel;
  update public.option_items set is_active = false where id = v_exact;
  v_out := app.parcel_offer_payload(v_parcel, null, null, true);
  assert (v_out->>'suggested_tree_count_option_id')::uuid = v_open,
    'a retired card still answers for a parcel';

  raise notice 'parcel suggestion: the narrowest card that holds the count answers, and the open end is the fallback';
end $$;
