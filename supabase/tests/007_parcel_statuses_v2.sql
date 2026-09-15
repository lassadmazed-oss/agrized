-- Parcel statuses of spec v2 §28 (migration 0021): «owned» exists, is shown as taken and is never priced.
-- Runs after 0021 is committed: a new enum value cannot be used in the transaction that adds it.

-- The seven codes, in order
do $$
begin
  assert (select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = 'public.parcel_status'::regtype)
         = 'available,interested,reserved,contracting,sold,owned,withdrawn',
    'parcel_status carries the seven v2 statuses in order';
end $$;

-- Fixtures
update public.feature_flags set state = 'public' where key = 'projects';

insert into public.projects (code, name, governorate_id, project_type_id, plantation_system, production_status, status)
values ('OWN-P', 'مشروع الحالات', 34, (select id from public.project_types where code = 'productive'), 'traditional', 'producing', 'published');

insert into public.parcels (project_id, code, area_m2, property_type, plantation_system, olive_tree_count, production_status,
                            irrigation, cash_price_millimes, status, sort_order)
values
  ((select id from public.projects where code = 'OWN-P'), 'A01', 500, 'planted', 'traditional', 25, 'producing', 'rainfed', 5000000, 'available', 10),
  ((select id from public.projects where code = 'OWN-P'), 'O01', 500, 'planted', 'traditional', 25, 'producing', 'rainfed', 5000000, 'owned', 20);

select set_config('test.own.' || pa.code, pa.id::text, false)
from public.parcels pa join public.projects pj on pj.id = pa.project_id
where pj.code = 'OWN-P';

-- As a visitor
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare
  v_owned    uuid := current_setting('test.own.O01')::uuid;
  v_avail    uuid := current_setting('test.own.A01')::uuid;
  r          record;
  o          jsonb;
begin
  select * into r from public.public_parcels() where id = v_owned;
  assert found, 'an owned parcel is listed as taken';
  assert r.status = 'owned', 'its status is owned';
  assert not r.offered, 'an owned parcel is never offered';
  assert r.cash_price_millimes is null, 'an owned parcel never shows a price';

  select * into r from public.public_parcels() where id = v_avail;
  assert r.offered and r.cash_price_millimes = 5000000, 'the available neighbour is still offered';

  o := public.public_parcel_offer(v_owned);
  assert o is not null, 'a shared link to an owned parcel still resolves';
  assert (o->>'offered')::boolean = false and (o->>'priced')::boolean = false, 'its offer is neither offered nor priced';
  assert jsonb_array_length(o->'plans') = 0, 'no plan is computed for an owned parcel';

  select * into r from public.public_projects() where code = 'OWN-P';
  assert r.parcels_total = 2 and r.parcels_offered = 1, 'project counts treat owned as taken';

  select * into r from public.public_coverage() where governorate_id = 34;
  assert r.parcels_offered >= 1, 'coverage still counts the available parcel';
end $$;

reset role;

-- The copy v2 contradicts is gone (replaced where it was still the seed)
do $$
begin
  assert (select value #>> '{}' from public.settings where key = 'projects.intro')
         <> 'كل قطعة عندها مساحتها وعدد زيتوناتها ونوع غراستها وحالة إنتاجها. معطيات مستقلّة، ما نحسبوش وحدة من الأخرى. اختار اللي يشبهك.',
    'projects.intro no longer says area and tree count are unrelated everywhere';
  assert (select value #>> '{}' from public.settings where key = 'projects.intro') not like '%معطيات مستقلّة%',
    'projects.intro no longer carries the v1 independence wording';
end $$;
