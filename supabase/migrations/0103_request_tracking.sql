-- 0103 · وين وصل مطلبي — THE LOOKUP FOR SOMEBODY WHO HAS NOT SIGNED IN.
--
-- Its test is supabase/tests/065_request_tracking.sql, which can be re-run at any time against the live
-- schema (it always rolls back):
--   node --env-file=.env scripts/db-dry-run.mjs \
--     supabase/migrations/0103_request_tracking.sql supabase/tests/065_request_tracking.sql
--
-- WHY THIS FILE EXISTS, IN ONE PARAGRAPH. The intake ends by handing the visitor a number — 0003 returns
-- `{request_no}` and the SMS prints it — and until now that number opened nothing. It was a receipt for a
-- form that vanished: the client had no way to ask «وين وصل مطلبي» short of phoning the office, and 0094
-- already computes the exact answer (app.request_stage), but behind app.is_staff(). 0096 opened a door for
-- buyers who have an account; a fresh lead does NOT have one — public.persons.profile_id is written only
-- after somebody signs in with an SMS code, and a visitor who filled the form five minutes ago has never
-- signed in and may never need to. This file gives that visitor, and only that visitor, the one answer the
-- database can already produce.
--
-- IT DERIVES NOTHING. The stage, the thirteen-stage path, the labels and the word for «no fact» all come
-- from 0090's spine through 0094's app.request_stage, unchanged. This is the THIRD reader on that one spine
-- (staff person, staff request, and now the client), which is the whole design of 0090 and 0094 and the
-- reason neither of them wrote a status column. If a stage rule ever changes, it changes in one place and
-- this page moves with it. A second copy of the derivation here would let the office and the client read the
-- same demand and disagree, both computed, both defensible, with nobody able to say which is the product.
--
-- WHAT IT ADDS
--   · setting  track.max_lookups_per_hour   how often ONE request number may be asked about
--   · one expression index on interest_requests, so the lookup is never a sequential scan
--   · public.track_request(text, text)      the lookup: the code plus the phone, and nothing else
--
-- ---------------------------------------------------------------------------------------------------------
-- THE SECURITY ARGUMENT, WHICH IS THE HEART OF THIS FILE
-- ---------------------------------------------------------------------------------------------------------
-- REQUEST NUMBERS ARE SEQUENTIAL AND THEREFORE NOT A SECRET. 0003 builds them as
-- `prefix-YYYY-` || lpad(the count of this year's requests + 1, 6, '0') — 'AGZ-2026-000045' is followed by
-- 'AGZ-2026-000046'. Anybody who has ever submitted the form holds one valid number and can count up and
-- down from it to enumerate every demand of the year, and the prefix and the year are public. So a lookup
-- that asked for the code ALONE would be a public index of the pipeline: how many people asked this year,
-- which offer each of them asked about, and how far each one got. That is competitor intelligence, and on a
-- product whose whole promise is «المليون زيتونة» the count itself is a number the owner announces, not one
-- a script scrapes.
--
-- THE PHONE IS THE REAL SECRET, and it is the right one. It is the one thing the client necessarily knows
-- and a stranger holding a leaked or guessed code does not: eight digits, unguessable at 20 tries an hour,
-- and it is also the ONLY identifier the intake is sure to have — the form makes e-mail optional and asks
-- for no password. So this function requires BOTH, and the pair is the credential: the code says which
-- demand, the phone proves it is yours.
--
-- EVERY FAILURE RETURNS THE IDENTICAL OBJECT — {ok:false, reason:'not_found'} — for a code that does not
-- exist, a phone that does not match, and a pair that belongs to two different rows. Not out of tidiness:
-- three distinguishable answers make this endpoint two oracles. «bad code» versus «bad phone» would confirm
-- that AGZ-2026-000045 is a real demand (which, the numbers being sequential, is the same as publishing how
-- many demands exist), and it would let somebody who holds a real code test phone numbers one at a time and
-- be TOLD when the code is right, which is a way to learn the client's phone number from their request
-- number. One answer, one reason, and the caller learns exactly nothing they did not bring with them.
-- The cost is paid in the interface, as 0096 pays it: the screen says «الرمز ولا النمرة ما يتطابقوش — شوف
-- الرسالة اللي وصلتك وعاود» rather than naming which of the two is wrong, and the office can look any
-- demand up in the Back Office when a client phones.
--
-- WHAT IS DELIBERATELY ABSENT FROM THE PAYLOAD, and must stay absent:
--   · ALL MONEY. No price, no عربون, no instalment, no total. 0095's file and 0094's ids carry it for staff;
--     a stranger who guessed a pair must not learn what this client is paying, and the client who needs the
--     figures reads them in their own file behind a sign-in (0096 + my_zitounti_file).
--   · THE FULL NAME, and in fact NO name at all. A code plus a phone identifies a demand, not a person, and
--     nothing on a «where is my request» screen needs to say the client's name back to them — they know it.
--     A name in this payload turns a guessed pair into a phone-number-to-name directory.
--   · THE PHONE. It was an input, never an output. Echoing it back would confirm the guess.
--   · EVERY UUID AND EVERY INTERNAL REFERENCE. person_id, request id, project id, the contract's
--     reference_no, the reservation's, the visit's — all of them are handles into other surfaces and none of
--     them helps a client read a progress bar. This is why section 3 strips `proof.id` and `proof.ref` out of
--     0094's stage object instead of passing it through whole: the stage is «وين», the proof is «بأي سطر»,
--     and only the first one is the client's business.
--
-- AND IT IS NOT REACHABLE FROM THE INTERNET DIRECTLY. Revoked from public, anon and authenticated, exactly
-- like 0096's three functions and for the same reason: the Server Action calls it with the service-role key,
-- and that action is the only place a PER-IP throttle can exist. SQL can only throttle per request number
-- (it has no idea who is calling), so the two limits are complementary and both are needed — the per-number
-- one below stops a phone being brute-forced against a code somebody holds, the per-IP one in the action
-- stops one machine walking the whole sequence of codes.


-- ===========================================================================
-- 0 · REFUSE RATHER THAN HALF-RUN
-- ===========================================================================

do $guard$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'request_stage') then
    raise exception
      'app.request_stage is missing, and this file derives nothing of its own. Apply supabase/migrations/0094_request_stage.sql first, or dry-run them together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0094_request_stage.sql supabase/migrations/0103_request_tracking.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'journey_spine') then
    raise exception
      'app.journey_spine is missing. The thirteen stages, their labels and their order all come from it; apply supabase/migrations/0090_journey.sql first.';
  end if;
  if to_regclass('app.submission_throttle') is null then
    raise exception
      'app.submission_throttle is missing. The per-request-number rate limit is counted in it, and this file will not publish an unthrottled lookup; apply supabase/migrations/0003_land_offers_and_intake.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'interest_requests'
                   and column_name = 'project_code') then
    raise exception
      'public.interest_requests.project_code is missing, and the payload names the offer the demand is about. Apply supabase/migrations/0020_public_projects.sql first.';
  end if;
end $guard$;


-- ===========================================================================
-- 1 · THE ONE NUMBER THAT GOVERNS THIS, AND IT IS THE OWNER'S
-- ===========================================================================

-- HOW OFTEN ONE REQUEST NUMBER MAY BE ASKED ABOUT. Twenty an hour is generous for a human refreshing a page
-- and useless for guessing eight digits: at twenty tries an hour a Tunisian mobile number takes some five
-- hundred thousand years. It is a setting and not a constant because it is a business trade-off — the owner
-- may want it tighter during a campaign, or looser when a client is on the phone with the office reading the
-- code out — and Rule 3 of this work says a number the owner might change does not live in a function body.
--
-- is_public false, like 0096's four: a limit is not something the public site needs to render, and a visitor
-- who knows the ceiling knows exactly how many guesses they get per hour. group_key 'track' is a prefix
-- /admin/settings does not claim yet, so this appears under «إعدادات أخرى» until whoever owns that page adds
-- the section — the same position 0090 accepted for `journey`, and not a reason to hold this file.
insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('track.max_lookups_per_hour', to_jsonb(20), 'integer', 'track', 'تتبّع المطلب · أقصى عدد استعلامات في الساعة',
   'قدّاش مرّة ينجّم واحد يستعلم على نفس رقم المطلب في الساعة. كي يتفوّت العدد، الخدمة ترجّع «too_many» وما تكشفش حتّى شيء آخر. الرقم يحمي نمرة التليفون من التخمين، خاطر أرقام المطالب متسلسلة ومش سرّ.',
   false, 10)
on conflict (key) do nothing;


-- ===========================================================================
-- 2 · THE ONE INDEX THIS LOOKUP NEEDS
-- ===========================================================================

-- public.interest_requests.request_no is unique and therefore already indexed — but the lookup below matches
-- on upper(btrim(request_no)), because a client reads the code off an SMS by hand and may well type it in
-- lower case with a trailing space, and `request_no.prefix` is a SETTING whose value need not be upper case
-- either. An expression the unique index cannot serve means a sequential scan, and a sequential scan on the
-- lead table is exactly the wrong thing to put behind an endpoint a stranger may call: the per-number limit
-- below cannot help, because every scan would be against a DIFFERENT invented number and so a different key.
-- One expression index, and the endpoint costs an index probe whatever is typed.
create index if not exists interest_requests_request_no_lookup_idx
  on public.interest_requests (upper(btrim(request_no)));


-- ===========================================================================
-- 3 · تتبّع المطلب — the code, the phone, and nothing else
-- ===========================================================================

-- VOLATILE, NOT STABLE, and deliberately: it writes the throttle row that makes the limit real. A `stable`
-- function that inserts would be a lie the planner is entitled to act on.
--
-- THE ORDER OF THE CHECKS IS PART OF THE SECURITY, so it is written out rather than left to be read off:
--
--   1 · a blank code is answered not_found and charged nothing. There is nothing to key a limit on, and the
--       answer cannot be an oracle for anything because it does not depend on any row.
--   2 · THE LIMIT IS CHARGED NEXT — before the request is looked up and before the phone is compared. That
--       ordering is the whole point of having the limit here. Charging it only on a match would leave the
--       phone brute-forceable at full speed, since every wrong guess is a non-match; and charging it only
--       when the code resolves to a real row would make the limit itself the oracle we just refused — hammer
--       a code twenty-one times, get `too_many` and you have learned the code is real, get `not_found` and
--       you have learned it is not. So ANY lookup against ANY well-formed code costs one of that code's
--       twenty, real or invented. The price of that choice is bounded garbage in app.submission_throttle
--       from invented codes, and the per-IP throttle in the Server Action is what bounds it.
--   3 · then the row, then the phone. Both failures leave by the same line.
--
-- THE CODE IS NOT PATTERN-CHECKED against 'AGZ-YYYY-NNNNNN'. The prefix is the setting `request_no.prefix`
-- and the year moves, so a regex here would be a business value hard-coded in a function body — and it would
-- buy nothing, because an unmatched code and a malformed one already leave by the same line.
create or replace function public.track_request(p_request_no text, p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  -- The one identical answer. Built once, at the top, so no path can accidentally return a richer version of
  -- it: every failure below is `return v_no`.
  v_no        jsonb := jsonb_build_object('ok', false, 'reason', 'not_found');
  v_max       integer := greatest(app.setting_int('track.max_lookups_per_hour', 20), 1);
  v_code      text;
  v_key       text;
  v_digits    text;
  v_used      integer;
  v_r         public.interest_requests;
  v_match     boolean := false;
  v_stage     jsonb;
  v_rank      integer;
  v_spine     jsonb;
begin
  -- 1 · Nothing typed. Charged nothing, tells nothing.
  v_code := upper(btrim(coalesce(p_request_no, '')));
  if v_code = '' or char_length(v_code) > 64 then
    return v_no;
  end if;

  -- 2 · The limit, charged on the code and on every attempt against it.
  --
  -- md5 AND NOT THE CODE ITSELF, because the column is named key_hash and means it: app.submission_throttle
  -- is a long-lived table that nothing prunes, and storing the codes in clear would slowly turn it into a
  -- log of which demands strangers have been asking about — one half of the credential, kept forever, for no
  -- operational gain. The hash counts exactly as well.
  v_key := md5(v_code);

  select count(*) into v_used
  from app.submission_throttle t
  where t.kind = 'track:request' and t.key_hash = v_key and t.created_at > now() - interval '1 hour';

  if v_used >= v_max then
    -- THE ONE FAILURE THAT IS NAMED, and it is safe to name because it is a fact about the CALLER's own
    -- behaviour and not about any row: they have asked too often. The screen can then say «عاود بعد ساعة»
    -- instead of repeating «ما تطابقش», which would send a client who typed correctly looking for a mistake
    -- they did not make.
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  insert into app.submission_throttle (kind, key_hash) values ('track:request', v_key);

  -- AND IT CLEANS UP AFTER ITSELF. Every other writer of app.submission_throttle sits behind a form a human
  -- fills in; this one is an unauthenticated endpoint that writes a row for ANY code a caller invents, and
  -- nothing in this repository has ever deleted from that table. Left alone it grows without bound, and the
  -- only thing limiting it is how many codes a script can make up — which is not a limit.
  --
  -- Two hours is twice the widest window any limit here measures, so nothing still being counted is ever
  -- removed. It runs HERE, from the statement that dirties the table, rather than from a scheduled job:
  -- there is nothing to install, nothing to notice when it stops, and the cleaning scales with the abuse —
  -- a quiet day prunes nothing, a scripted flood prunes on almost every call.
  delete from app.submission_throttle t
   where t.kind = 'track:request' and t.created_at < now() - interval '2 hours';

  -- 3 · The demand.
  select * into v_r
  from public.interest_requests r
  where upper(btrim(r.request_no)) = v_code
  limit 1;

  if not found then
    return v_no;
  end if;

  -- 4 · The phone, which is the actual credential.
  --
  -- COMPARED ON DIGITS AND BY SUFFIX, not on the E.164 string. A client reads their number back the way they
  -- know it — «94 123 456», or '0021694123456' off a contact card — while the intake stored '+21694123456',
  -- and refusing the person who typed their own number correctly would make this page useless to exactly the
  -- people it is for. So both strings are reduced to digits and the SHORTER one must be a suffix of the
  -- longer: that accepts the local form, the international form, the 00 prefix, spaces and dashes, and
  -- accepts nothing else.
  --
  -- EIGHT DIGITS IS THE FLOOR, on both sides, and it is what stops the suffix rule from shortening the
  -- secret: eight is the whole Tunisian mobile number, so a caller must still produce all of it. A shorter
  -- attempt is refused as a plain non-match rather than named — naming it («نمرة قصيرة») is one more bit
  -- about the caller's typing, and this function returns one identical answer for everything.
  --
  -- BOTH PHONES COUNT: the one snapshotted on the demand (0002 keeps «what the visitor typed, kept as
  -- submitted») and the one on the person's file today. They are the same number at intake and drift apart
  -- the moment the office corrects a file, and a client whose number was fixed by the office must still be
  -- able to read their own request.
  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_digits) >= 8 then
    select coalesce(bool_or(
             char_length(t.d) >= 8
             and (right(t.d, char_length(v_digits)) = v_digits
                  or right(v_digits, char_length(t.d)) = t.d)), false)
    into v_match
    from (
      select regexp_replace(s.ph, '[^0-9]', '', 'g') as d
      from (
        select v_r.phone_e164 as ph
        union all
        select p.phone_e164 from public.persons p where p.id = v_r.person_id
      ) s
      where s.ph is not null
    ) t;
  end if;

  if not v_match then
    return v_no;
  end if;

  -- 5 · The answer. app.request_stage is 0094's, unchanged and unaided.
  --
  -- STRIPPED OF ITS PROOF'S HANDLES. 0094 returns {..., at, proof:{kind, id, ref, at}} because a staff screen
  -- prints «الحجز AGZ-RES-7» and links to it. `id` is a uuid into another table and `ref` is an internal
  -- reference number; neither belongs to a stranger who may be holding a guessed pair, and neither helps a
  -- client read where their demand stands. What survives — kind, at, and the person_scoped flag 0094 sets on
  -- stage 2 — is what makes the sentence honest: «تم الاتصال» stays marked as person-scoped here too, so the
  -- client's page can use the same softer wording rather than claiming somebody phoned about this one demand.
  -- Deleting the two keys instead of rebuilding the object keeps the shape 0094 publishes, so the day 0094
  -- adds a field the client page gets it.
  v_stage := app.request_stage(v_r.id) #- '{proof,id}'::text[] #- '{proof,ref}'::text[];
  v_rank  := (v_stage->>'rank')::integer;

  -- The path, with what has been reached — computed exactly as public.staff_request_journey computes it, on
  -- the same spine, so the client's band and the office's band can never disagree about how far along
  -- «العربون مدفوع» is. has_fact:false stages stay marked so the page draws them hollow instead of claiming
  -- something nobody recorded.
  select coalesce(jsonb_agg(s || jsonb_build_object(
           'reached', (s->>'rank')::integer <= v_rank,
           'current', (s->>'rank')::integer = v_rank)
         order by (s->>'rank')::integer), '[]'::jsonb)
  into v_spine
  from jsonb_array_elements(app.journey_spine()) s;

  return jsonb_build_object(
    'ok',         true,
    'request_no', v_r.request_no,
    'created_at', v_r.created_at,
    -- The offer, by the name and code the visitor saw when they asked. 0020's snapshot columns, so a demand
    -- still says which offer it was about after the offer is renamed — and null on a calculator request,
    -- which was never about one offer.
    'offer_name', v_r.project_name,
    'offer_code', v_r.project_code,
    -- How many olive trees were asked for: the offer's figure, or the calculator's lower bound, which is the
    -- same column MIL-01 counts so the client is shown the number the platform itself counts.
    'trees',      coalesce(v_r.offer_trees, v_r.tree_count_min),
    'stage',      v_stage,
    'spine',      v_spine,
    'unknown',    app.setting_text('journey.unknown_label', 'غير معروف'));
end $fn$;

-- SERVER ONLY, exactly like 0096's login functions. The web app calls this from a Server Action with the
-- service-role key, and that action carries the per-IP throttle this function cannot have. Left reachable by
-- anon it would be an unauthenticated, unmetered-per-caller lookup over a sequential identifier published on
-- the internet.
revoke execute on function public.track_request(text, text) from public, anon, authenticated;

-- SAID OUT LOUD RATHER THAN INHERITED. Supabase's default privileges already grant execute on a new public
-- function to service_role, so the three revokes above are enough today — but a default privilege is not
-- something this file controls, and 0003 names the grant explicitly for exactly that reason. Naming it here
-- means the Server Action cannot be broken by somebody tidying the project's default privileges.
grant execute on function public.track_request(text, text) to service_role;

comment on function public.track_request(text, text) is
  'وين وصل مطلبي for a visitor who has not signed in: given a request number AND the phone that submitted it, returns where that one demand stands — the derived stage (0094), the thirteen-stage path (0090), the offer it was about, how many trees and when it was asked. Request numbers are sequential, so the phone is the credential and both are required; a wrong code, a wrong phone and a mismatched pair all return the identical {ok:false, reason:''not_found''} so the endpoint is an oracle for neither. Carries no money, no name, no phone and no identifier. At most track.max_lookups_per_hour lookups per request number, charged on every attempt, answered {ok:false, reason:''too_many''}. Service role only — the per-IP limit lives in the Server Action.';
