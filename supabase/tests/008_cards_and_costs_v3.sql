-- Report v3 §19 (smallest accepted down payment in the listing) and §35 (project cost categories). Migration 0022.
-- Migration 0032 retires the old amount lists (docs/plan-zitouna.md Q-7) that the listing's «ابتداءً من» still reads;
-- they are switched back on inside this rolled-back test until plan P5-4 moves the listing to tree pricing.
update public.option_items set is_active = true
where list_key in ('desired_area', 'priority', 'down_payment', 'monthly_installment');

update public.feature_flags set state = 'public' where key = 'projects';

insert into public.projects (code, name, governorate_id, project_type_id, plantation_system, production_status, pricing, status)
values ('V3-P', 'مشروع العروض', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing',
        '{"model":"markup_brackets","max_months":84,"min_down_pct":10,"brackets":[{"max_months":84,"markup_pct":25}]}'::jsonb,
        'published');

insert into public.parcels (project_id, code, area_m2, property_type, plantation_system, olive_tree_count, production_status,
                            irrigation, cash_price_millimes, status, sort_order)
values
  ((select id from public.projects where code = 'V3-P'), 'C05', 500, 'planted', 'traditional', 25, 'producing', 'rainfed', 5000000, 'available', 10),
  ((select id from public.projects where code = 'V3-P'), 'C15', 500, 'planted', 'traditional', 25, 'producing', 'rainfed', 15000000, 'available', 20),
  ((select id from public.projects where code = 'V3-P'), 'C99', 500, 'planted', 'traditional', 25, 'producing', 'rainfed', 90000000, 'available', 30),
  ((select id from public.projects where code = 'V3-P'), 'R01', 500, 'planted', 'traditional', 25, 'producing', 'rainfed', 5000000, 'reserved', 40);

select set_config('test.v3.' || pa.code, pa.id::text, false)
from public.parcels pa join public.projects pj on pj.id = pa.project_id
where pj.code = 'V3-P';

-- §35 · new cost categories are accepted, unknown ones refused
do $$
declare
  v_project uuid := (select id from public.projects where code = 'V3-P');
  v_kind text;
begin
  foreach v_kind in array array['purchase','notary','commission','plantation','irrigation','fencing','access',
                                'marketing','sales_commission','management','development','fees','other'] loop
    insert into public.project_costs (project_id, kind, label, amount_millimes) values (v_project, v_kind, 'بند ' || v_kind, 1000);
  end loop;
  begin
    insert into public.project_costs (project_id, kind, label, amount_millimes) values (v_project, 'guess', 'غير معروف', 1000);
    raise exception 'an unknown cost category was accepted';
  exception when check_violation then
    null;
  end;
end $$;

-- §19 · as a visitor
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare
  r record;
begin
  -- 5,000 د at 10 % → at least 500 د: the 500 د option qualifies
  select * into r from public.public_parcels() where id = current_setting('test.v3.C05')::uuid;
  assert r.down_from_millimes = 500000, 'a 5,000 د parcel starts at 500 د, got ' || coalesce(r.down_from_millimes::text, 'null');

  -- 15,000 د at 10 % → at least 1,500 د: 500 and 1,000 are below the minimum
  select * into r from public.public_parcels() where id = current_setting('test.v3.C15')::uuid;
  assert r.down_from_millimes = 1500000, 'a 15,000 د parcel starts at 1,500 د, not the smallest option, got ' || coalesce(r.down_from_millimes::text, 'null');

  -- 90,000 د at 10 % → 9,000 د: no option is high enough, so nothing is advertised
  select * into r from public.public_parcels() where id = current_setting('test.v3.C99')::uuid;
  assert r.down_from_millimes is null, 'no «ابتداءً من» when no option reaches the minimum';

  -- a taken parcel never shows a price or a down payment
  select * into r from public.public_parcels() where id = current_setting('test.v3.R01')::uuid;
  assert r.cash_price_millimes is null and r.down_from_millimes is null, 'a reserved parcel shows no money';

  -- the pricing formula still never leaves Postgres
  assert pg_get_function_result('public.public_parcels()'::regprocedure) !~ 'pricing|notes|updated_by|legal|land_offer|latitude|longitude',
    'the listing signature stays whitelisted';
  assert not has_function_privilege('anon', 'app.parcel_down_from(uuid,bigint)', 'execute'), 'the helper is closed to visitors';
end $$;

reset role;
