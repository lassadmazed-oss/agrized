-- 0120 · حذف العرض — AN OFFER CAN BE DELETED, BUT NEVER FROM UNDER A CLIENT.
--
-- Its test is supabase/tests/072_offer_removal.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0120_offer_removal.sql supabase/tests/072_offer_removal.sql
--
-- THE OWNER'S REQUEST (2026-10-03): «i want a button to be able to remove offers». The Back Office could create
-- and edit an offer and never remove one, so fifteen demo offers sat in the list for good.
--
-- TWO WAYS TO REMOVE, DECIDED BY WHAT THE OFFER CARRIES.
--   · An offer nobody has touched — no request, reservation, contract, payment, visit, subscription, harvest,
--     agricultural operation, legal file, and no tree held, reserved or sold — is DELETED, with everything that
--     is only its own setup: its unsold trees, its (empty) parcels, its planting classes, pricing rules and cost
--     lines, its markups and down-payment options, its internal costs; its pictures and service terms go by
--     their own cascade, its translations by 0109's trigger. Every row leaves an audit record (the *_audit
--     triggers), so a deletion is never silent.
--   · An offer with ANY of that history is refused here with `offer_has_history`, and the Back Office archives
--     it instead (status «مؤرشف»: off the site and out of the list, nothing lost). A contract, a payment, a
--     request must keep the offer it refers to — a receipt that names an offer which no longer exists is a
--     receipt nobody can read.
--
-- WHO: deletion is the admins' alone (app.is_admin); archiving stays with whoever may edit an offer.

-- What an offer carries that a deletion would orphan. {} = nothing, deletable.
create or replace function app.offer_history(p_project uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'requests',      nullif((select count(*) from public.interest_requests x where x.project_id = p_project), 0),
    'reservations',  nullif((select count(*) from public.reservations x where x.project_id = p_project), 0),
    'contracts',     nullif((select count(*) from public.contracts x where x.project_id = p_project), 0),
    'payments',      nullif((select count(*) from public.payments x where x.project_id = p_project), 0),
    'visits',        nullif((select count(*) from public.visits x
                             where x.project_id = p_project or x.outcome_project_id = p_project), 0),
    'subscriptions', nullif((select count(*) from public.subscriptions x where x.project_id = p_project), 0),
    'harvests',      nullif((select count(*) from public.harvest_seasons x where x.project_id = p_project), 0),
    'operations',    nullif((select count(*) from public.agri_operations x where x.project_id = p_project), 0),
    'legal_files',   nullif((select count(*) from public.legal_files x where x.project_id = p_project), 0),
    'held_trees',    nullif((select count(*) from public.trees t
                             where t.project_id = p_project
                               and (t.state <> 'available' or t.held_by is not null
                                    or t.reservation_id is not null or t.request_id is not null)), 0)
  ))
$$;

revoke execute on function app.offer_history(uuid) from public, anon, authenticated;

-- For the list: which offers a «حذف» button may be offered on, and why not for the others.
create or replace function public.staff_offer_history(p_projects uuid[])
returns table (project_id uuid, history jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_any_role(array['finance', 'admin', 'super_admin']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, app.offer_history(p.id) from public.projects p where p.id = any (p_projects);
end $$;

revoke execute on function public.staff_offer_history(uuid[]) from public, anon;
grant execute on function public.staff_offer_history(uuid[]) to authenticated;

create or replace function public.staff_delete_project(p_project uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pj      public.projects;
  v_history jsonb;
  v_media   text[];
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  select * into v_pj from public.projects pj where pj.id = p_project for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Checked under the row lock: a reservation made a second ago counts.
  v_history := app.offer_history(p_project);
  if v_history <> '{}'::jsonb then
    raise exception 'offer_has_history' using errcode = 'P0001', detail = v_history::text,
      hint = 'This offer has requests, reservations, contracts, payments or visits that must keep it. Archive it instead.';
  end if;

  -- The pictures' files live in storage; the Server Action removes them once this has committed.
  select coalesce(array_agg(m.storage_path) filter (where m.storage_path is not null), '{}')
    into v_media from public.project_media m where m.project_id = p_project;

  delete from public.trees t where t.project_id = p_project;
  delete from public.parcels x where x.project_id = p_project;
  delete from public.project_spacing_classes x where x.project_id = p_project;
  delete from public.tree_cost_items x where x.project_id = p_project;
  delete from public.tree_pricing_rules x where x.project_id = p_project;
  delete from public.financing_markups x where x.project_id = p_project;
  delete from public.project_down_payment_percents x where x.project_id = p_project;
  delete from public.project_costs x where x.project_id = p_project;
  delete from public.projects pj where pj.id = p_project;

  return jsonb_build_object('ok', true, 'code', v_pj.code, 'media_paths', to_jsonb(v_media));
end $$;

revoke execute on function public.staff_delete_project(uuid, text) from public, anon;
grant execute on function public.staff_delete_project(uuid, text) to authenticated;
