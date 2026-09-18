-- The Back Office can set the yearly care of a tree (owner, 2026-09-18: «متغيرة حسب الزيتونة»).
--
-- 0045 added the column and every read path. Saving a rule still went through the 0031 function, which never
-- looked at the new key: the value survived an edit but could not be changed from the pricing page, which makes
-- the field inert. Same signature, same validation style, same audit line — only the fee is new.

create or replace function public.staff_save_pricing_rule(p_project uuid, p jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old          public.tree_pricing_rules;
  v_new          public.tree_pricing_rules;
  v_land         bigint;
  v_plant        bigint;
  v_mode         text := nullif(btrim(coalesce(p->>'margin_mode', '')), '');
  v_bp           integer;
  v_fixed        bigint;
  v_pr           bigint;
  v_mr           bigint;
  v_use          boolean;
  v_annual       bigint;
  v_note         text := nullif(btrim(coalesce(p->>'note_ar', '')), '');
  v_markups_note text := nullif(btrim(coalesce(p->>'markups_note_ar', '')), '');
begin
  if not app.can_price() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.set_reason(p_reason);

  if p_project is not null and not exists (select 1 from public.projects pj where pj.id = p_project) then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;

  begin
    v_land   := nullif(p->>'land_price_per_m2_millimes', '')::bigint;
    v_plant  := nullif(p->>'planting_cost_per_tree_millimes', '')::bigint;
    v_bp     := nullif(p->>'margin_percent_bp', '')::integer;
    v_fixed  := nullif(p->>'margin_fixed_millimes', '')::bigint;
    v_pr     := nullif(p->>'price_rounding_millimes', '')::bigint;
    v_mr     := nullif(p->>'monthly_rounding_millimes', '')::bigint;
    v_use    := coalesce(nullif(p->>'use_global_cost_items', '')::boolean, true);
    -- Empty means «no fee of its own»: an offer then inherits the global one, and the global one shows nothing.
    v_annual := nullif(p->>'annual_fee_per_tree_millimes', '')::bigint;
  exception when others then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end;

  select * into v_old from public.tree_pricing_rules r where r.project_id is not distinct from p_project for update;

  if coalesce(v_land, 0) < 0 or coalesce(v_plant, 0) < 0 or coalesce(v_fixed, 0) < 0
     or coalesce(v_annual, 0) < 0
     or coalesce(v_pr, 1) < 1 or coalesce(v_mr, 1) < 1
     or (v_bp is not null and v_bp not between 0 and 100000)
     or (v_mode is not null and v_mode not in ('percent', 'fixed'))
     or (v_mode = 'percent' and v_bp is null)
     or (v_mode = 'fixed' and v_fixed is null)
     or char_length(coalesce(v_note, '')) > 1000
     or char_length(coalesce(v_markups_note, '')) > 1000
     or (p_project is null and (v_land is null or v_plant is null or v_pr is null or v_mr is null))
     -- Once the global margin is set it can be changed but never unset: prices on the site would vanish.
     or (p_project is null and v_mode is null and v_old.margin_mode is not null) then
    raise exception 'invalid_pricing_rule' using errcode = 'P0001';
  end if;

  if v_mode is distinct from 'percent' then v_bp := null; end if;
  if v_mode is distinct from 'fixed' then v_fixed := null; end if;
  if p_project is null then v_use := true; end if;

  if v_old.id is null then
    insert into public.tree_pricing_rules
      (project_id, land_price_per_m2_millimes, planting_cost_per_tree_millimes, margin_mode, margin_percent_bp,
       margin_fixed_millimes, price_rounding_millimes, monthly_rounding_millimes, use_global_cost_items,
       annual_fee_per_tree_millimes, note_ar, markups_note_ar, updated_by)
    values (p_project, v_land, v_plant, v_mode, v_bp, v_fixed, v_pr, v_mr, v_use, v_annual, v_note, v_markups_note, auth.uid())
    returning * into v_new;
  else
    update public.tree_pricing_rules
    set land_price_per_m2_millimes = v_land, planting_cost_per_tree_millimes = v_plant,
        margin_mode = v_mode, margin_percent_bp = v_bp, margin_fixed_millimes = v_fixed,
        price_rounding_millimes = v_pr, monthly_rounding_millimes = v_mr, use_global_cost_items = v_use,
        annual_fee_per_tree_millimes = v_annual, note_ar = v_note, markups_note_ar = v_markups_note
    where id = v_old.id
    returning * into v_new;
  end if;

  perform app.write_audit('pricing.rule_save', 'tree_pricing_rules', v_new.id::text,
                          case when v_old.id is not null then to_jsonb(v_old) end, to_jsonb(v_new), null);
end $$;
