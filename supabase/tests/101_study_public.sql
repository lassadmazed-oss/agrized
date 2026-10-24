-- 0154 · the public door: open without an account, shut by the module, and carrying no workings.
do $$
declare
  v_project uuid;
  v_out     jsonb;
  v_key     text;
  v_locale  text;
  v_state   text;
begin
  select p.id into v_project from public.projects p where p.status = 'published' order by p.created_at limit 1;
  if v_project is null then
    raise notice 'no published offer; nothing to prove here';
    return;
  end if;

  select f.state into v_state from public.feature_flags f where f.key = 'study';

  -- 1 · A VISITOR MAY CALL IT, with no account at all — the owner's own closing paragraph. The grant is the
  --     statement; everything else here is about what comes back through it.
  assert has_function_privilege('anon',
    'public.public_project_study(uuid, integer, integer, text, text, text, uuid, uuid)', 'execute'),
    'a visitor cannot open the study, which is the one thing it was built to let them do';

  -- 2 · AND MAY NOT REACH PAST IT. The engine and its tables read the company's own yields, charges and
  --     pricing basis; §10 keeps those inside, and a door is only as good as the walls beside it.
  assert not has_function_privilege('anon',
    'app.study_payload(uuid, integer, integer, text, text, text, uuid, uuid)', 'execute'),
    'a visitor can call the engine directly and read the workings';
  assert not has_table_privilege('anon', 'public.study_yield_bands', 'select'),
    'a visitor can read the yield table';
  assert not has_table_privilege('anon', 'public.study_charges', 'select'),
    'a visitor can read what the company assumes a year costs';

  -- 3 · THE MODULE IS THE SAFETY CATCH. While it is «داخلي فقط» the answer to everybody else is «closed» —
  --     which is what lets the owner read real figures on the real site before a client can.
  perform set_config('request.jwt.claims', null, true);
  set local role anon;
  v_out := public.public_project_study(v_project, 10, 10, null, 'olives', null, null, null);
  reset role;

  if v_state <> 'public' then
    assert (v_out->>'status') = 'closed',
      format('the study module is «%s» but a visitor was answered «%s»', v_state, v_out->>'status');
  end if;

  -- 4 · What comes back when it IS open. Read as staff, which is the state the module ships in, so the
  --     shape is asserted whatever the flag says today.
  declare
    v_admin uuid;
  begin
    select ur.user_id into v_admin from public.user_roles ur where ur.role in ('admin', 'super_admin') limit 1;
    if v_admin is not null then
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      v_out := public.public_project_study(v_project, 10, 10, null, 'olives', null, null, null);

      if (v_out->>'status') = 'ok' then
        -- THE FACTORS DO NOT TRAVEL. They are the shape of the company's own pessimism, and a reader who
        -- has them can work backwards to the reference assumptions behind every price on the site.
        assert (v_out->'scenario'->>'yield_factor_bp') is null,
          'the scenario''s multipliers reached the browser';
        assert (v_out->'scenario'->>'charge_factor_bp') is null,
          'the scenario''s charge multiplier reached the browser';
        assert (v_out->'scenario'->>'code') is not null and (v_out->'scenario'->>'label_ar') is not null,
          'the scenario arrived with no name, so the screen cannot say which one it drew';

        -- Everything §4 asks to SHOW is there: the three buttons, the table, and the headline figures.
        assert jsonb_array_length(v_out->'scenarios') >= 1, 'the scenario buttons have nothing to draw';
        assert jsonb_array_length(v_out->'rows') = 11, 'ten years should be eleven rows, counting the signature';
        assert (v_out->'totals'->>'revenue_millimes') is not null
           and (v_out->'totals'->>'charges_millimes') is not null
           and (v_out->'totals'->>'net_millimes') is not null,
          'a headline figure §4 asks for is missing';
        assert coalesce(v_out->>'legal_note', '') <> '',
          'the study travelled without the warning that it is an estimate';
      else
        raise notice 'this offer answers «%» — the shape of an open study is untested here', v_out->>'status';
      end if;
    end if;
  end;

  -- 5 · An offer nobody published is simply not there, the same answer the rest of the public surface gives.
  assert public.public_project_study('00000000-0000-0000-0000-000000000000'::uuid,
                                     10, 10, null, 'olives', null, null, null) is null
      or (public.public_project_study('00000000-0000-0000-0000-000000000000'::uuid,
                                      10, 10, null, 'olives', null, null, null)->>'status') = 'closed',
    'an offer that does not exist was answered with something other than nothing';

  -- 6 · The words, in the five languages. A study whose labels fall back to Arabic on the German site is a
  --     page a German reader cannot use at all — this one is nothing but labels and figures.
  foreach v_key in array array['ui.study.cta', 'ui.study.title', 'ui.study.revenue', 'ui.study.charges',
                               'ui.study.net', 'ui.study.roi', 'ui.study.payback', 'ui.study.incomplete',
                               'ui.study.missing_tree_age'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public),
      format('%s is missing or is not published to the site', v_key);
    foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
      assert exists (select 1 from public.translations t
                      where t.entity = 'setting' and t.entity_key = v_key
                        and t.field = 'value' and t.locale = v_locale),
        format('%s was never translated into %s', v_key, v_locale);
    end loop;
  end loop;

  -- 7 · Every «missing» the engine can name has a sentence to print. A reason with no words is a blank box
  --     where an explanation should be, which §10 wrote this branch to avoid.
  foreach v_key in array array['tree_age', 'yield_band', 'offer_price', 'olive_price', 'oil_price'] loop
    assert exists (select 1 from public.settings s where s.key = 'ui.study.missing_' || v_key),
      format('the engine can answer «%s» and no screen has words for it', v_key);
  end loop;

  raise notice 'study door: open to a visitor, shut by the module, carrying results and no workings';
end $$;
