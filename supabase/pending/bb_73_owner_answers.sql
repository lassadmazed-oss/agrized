-- bb_73 — the owner's two answers, 2026-09-21.
--
-- 0072 shipped two money rules as OPEN QUESTIONS, seeded with the safest possible defaults, because neither
-- كراس الشروط nor the development report answers them and guessing at either one decides how much a real
-- client owes. The owner answered both today, in these words:
--
--     «العربون يتحسب من التسبقة»
--     «يحلّ أوّل قسط اول شهر بعد اتمام الوعد بالبيع» — then, asked which of its two readings he meant,
--     «أوّل يوم في الشهر»
--
-- Neither answer changes the schema. 0072 was built so that both are settings, read at contract creation and
-- frozen onto the contract — so this file is two UPDATEs and nothing else. It exists as a numbered migration
-- rather than a hand-edit on the live row because the values were SEEDED by 0072: a database rebuilt from
-- migrations must arrive at the owner's answers, not back at the placeholders he replaced.
--
-- TIMING, which is why this is not merely tidy. contracts.deposit_credited_millimes is frozen at creation
-- (0072, staff_create_contract): every contract written while the setting says false is permanently stamped
-- false, and flipping the setting afterwards cannot correct it. public.contracts held 0 rows when this was
-- written, so nothing is stamped wrong and no repair is needed. If that is no longer true when you apply
-- this, STOP and read the second assertion below — it will refuse rather than leave you with two cohorts of
-- contracts on two different rules and no record of which is which.

-- NO `begin;`/`commit;` IN THIS FILE, and the reason is worth the paragraph.
--
-- scripts/db-migrate.mjs supplies the transaction (db-migrate.mjs:51-54); so does scripts/db-dry-run.mjs,
-- which runs `begin`, then the file, then `rollback`. A file carrying its own `commit` ENDS THE RUNNER'S
-- TRANSACTION from the inside: everything above it is committed for real, and the runner's `rollback` then
-- has nothing to undo and merely warns. The dry run reports «everything was rolled back» and it is not true.
--
-- This file had them, and that is exactly what happened on 2026-09-21 at 18:39 UTC — a dry run applied both
-- settings to the live database and reported success at rolling back. The VALUES were right, so no client
-- and no contract was harmed, and public.contracts was empty. What was wrong was the bookkeeping: the
-- settings were live while app.schema_migrations had no record, so a database rebuilt from migrations would
-- have arrived back at 0072's placeholders. Applying this file for real is now a no-op on the values and
-- writes the record that was missing.
--
-- No applied migration in this repository carries its own begin/commit. Do not add them here.

-- ---------------------------------------------------------------------------
-- 1 · «العربون يتحسب من التسبقة»
-- ---------------------------------------------------------------------------

-- What this turns on, in staff_create_contract: the deposit actually PAID on the reservation — summed from
-- public.payments, kind 'deposit', voided rows excluded — is credited against the down payment, capped by it
-- (least(deposit, down_payment), which is what keeps contracts_deposit_credit_check satisfied). The client
-- owes the down payment MINUS what they already handed over, instead of the two figures standing side by
-- side and never being summed.
update public.settings
   set value = to_jsonb(true), updated_at = now()
 where key = 'contracts.deposit_counts_toward_down_payment';

-- ---------------------------------------------------------------------------
-- 2 · «يحلّ أوّل قسط اول شهر بعد اتمام الوعد بالبيع»
-- ---------------------------------------------------------------------------

-- app.contract_first_due already understood this rule; it was simply not the chosen one.
--
-- The owner's sentence «أوّل شهر بعد إتمام الوعد بالبيع» carried two readings, and the difference is a real
-- date on real money, so it was put to him with the case that separates them. He chose «أوّل يوم في الشهر»:
--
--     a وعد بالبيع signed on 15 January falls due on 1 FEBRUARY — not 15 February.
--
-- 'first_of_next_month' is date_trunc('month', signed_on) + interval '1 month', so every contract signed in a
-- given month falls due on the 1st of the next one whatever day it was signed. That also means every client
-- shares one due date per cohort, which is the reading that makes a monthly collection round possible at all —
-- the alternative gives 31 different due dates a month and Finance chasing each one on its own anniversary.
--
-- The first instalment is therefore SHORTER than a month for anyone signing late in the month: sign on the
-- 28th and the first payment falls 4 days later. That is what the rule says and it is not a rounding bug.
-- installments.first_due_offset_days (0072, default 0) is the knob if he ever wants that eased — it adds days
-- on top of whichever rule is chosen, so '+10' would move every first due date to the 11th.
update public.settings
   set value = to_jsonb('first_of_next_month'::text), updated_at = now()
 where key = 'installments.first_due_rule';

-- ---------------------------------------------------------------------------
-- 3 · Refuse to apply silently if either premise has stopped being true
-- ---------------------------------------------------------------------------

do $$
declare
  v_deposit  boolean;
  v_rule     text;
  v_stamped  integer;
begin
  select (value)::boolean into v_deposit from public.settings
   where key = 'contracts.deposit_counts_toward_down_payment';
  select (value #>> '{}') into v_rule from public.settings
   where key = 'installments.first_due_rule';

  if v_deposit is not true then
    raise exception 'bb_73: the deposit setting did not take — the row is missing or 0072 is not applied';
  end if;
  if v_rule is distinct from 'first_of_next_month' then
    raise exception 'bb_73: the first-due rule did not take, got %', coalesce(v_rule, '(null)');
  end if;

  -- The one thing that makes this file unsafe to apply blind: contracts written under the OLD answer.
  --
  -- The test is NOT «credit is zero». A contract on a reservation where no عربون was ever paid legitimately
  -- has a zero credit under the new rule too, and the first such contract would have blocked this file for
  -- no reason. What actually identifies a contract written under the old answer is a zero credit BESIDE a
  -- deposit that was really paid and never voided — money that should have been credited and was not.
  select count(*)::integer into v_stamped
  from public.contracts c
  where c.deposit_credited_millimes = 0
    and exists (select 1 from public.payments p
                 where p.reservation_id = c.reservation_id
                   and p.kind = 'deposit'
                   and p.voided_at is null
                   and p.amount_millimes > 0);

  if v_stamped > 0 then
    raise exception 'bb_73: % contract(s) were already written while the عربون did not count, and the credit '
                    'is frozen on each one. Flipping the setting does not correct them. Decide what happens to '
                    'those contracts BEFORE applying this, or you will have two cohorts on two rules with '
                    'nothing recording which is which.', v_stamped;
  end if;
end $$;
