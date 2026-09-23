-- The buyer's identity on public.persons (0082).
--
-- Four things are worth a test here, and they are the four that would be discovered at the worst moment
-- otherwise: a malformed CIN accepted and printed onto a contract, two files claiming the same CIN, a
-- commercial who cannot fill the fields at all because the column grant was forgotten, and the phone
-- quietly becoming editable.

do $$
declare
  v_a uuid;
  v_b uuid;
  v_status uuid;
  v_ok boolean;
begin
  select id into v_status from public.lead_statuses where stage = 'new' order by sort_order limit 1;

  insert into public.persons (full_name, phone_e164, status_id)
  values ('اختبار الهوية أ', '+21699000801', v_status)
  returning id into v_a;

  insert into public.persons (full_name, phone_e164, status_id)
  values ('اختبار الهوية ب', '+21699000802', v_status)
  returning id into v_b;

  -- 1 · Eight digits and nothing else.
  begin
    update public.persons set cin = '1234' where id = v_a;
    assert false, 'CIN of four digits was accepted; persons_cin_check is not doing its job';
  exception when check_violation then null;
  end;

  begin
    update public.persons set cin = 'AB123456' where id = v_a;
    assert false, 'CIN with letters was accepted';
  exception when check_violation then null;
  end;

  update public.persons set cin = '12345678' where id = v_a;

  -- 2 · One CIN, one file.
  begin
    update public.persons set cin = '12345678' where id = v_b;
    assert false, 'two files were allowed to share one CIN';
  exception when unique_violation then null;
  end;

  -- 3 · The rest of the fields hold what a contract needs.
  update public.persons
     set cin_issued_on = date '2019-04-02',
         birth_date    = date '1988-11-20',
         birth_place   = 'صفاقس',
         address_line  = 'نهج الحبيب بورقيبة، عدد 12، صفاقس'
   where id = v_a;

  -- 4 · The grant exists, on every new column and on none of the old forbidden ones.
  select bool_and(has_column_privilege('authenticated', 'public.persons', c, 'UPDATE'))
    into v_ok
    from unnest(array['cin', 'cin_issued_on', 'birth_date', 'birth_place', 'address_line']) as c;
  assert v_ok, 'a commercial cannot write the identity fields: the column grant in 0082 is missing one';

  assert not has_column_privilege('authenticated', 'public.persons', 'phone_e164', 'UPDATE'),
    'phone_e164 became editable: the intake keys one person per number, and changing it merges or orphans a file';

  -- The status trigger wrote a history row for each of them the moment they were inserted, so the children
  -- go first. Nothing else references a person this young.
  delete from public.person_status_history where person_id in (v_a, v_b);
  delete from public.persons where id in (v_a, v_b);
end $$;
