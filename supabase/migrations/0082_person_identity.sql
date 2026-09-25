-- Who the buyer actually is (owner, 2026-09-23: «there is also some personal data to fill when selling the
-- trees so we can track them — the CIN, phone number, more stuff»).
--
-- WHAT WAS MISSING. public.persons carried a name, a phone and where someone lives. That is enough to call a
-- lead back and not nearly enough to sell to them: «عقد وعد بالبيع» names the buyer by CIN, and a contract
-- signed against a file that holds no identity is a contract nobody can match to a person later. The data was
-- being collected on paper and living nowhere.
--
-- WHY ON persons AND NOT ON contracts. A CIN belongs to the human, not to one sale: a client who buys twice
-- types it once, and a correction fixes both files. The snapshot onto the contract is a separate, later step —
-- the same pattern reservations and contracts already use for prices — so that editing a person next year
-- cannot rewrite a signed paper. Nothing here writes to contracts.
--
-- THE PHONE IS DELIBERATELY NOT MADE EDITABLE. It is not in the grant below, exactly as it was not before:
-- public.persons is keyed on phone_e164 by the intake, which upserts one person per number. Letting staff
-- change it would silently merge two files or orphan one, and there is no undo for either.

alter table public.persons
  add column if not exists cin           text,
  add column if not exists cin_issued_on date,
  add column if not exists birth_date    date,
  add column if not exists birth_place   text,
  add column if not exists address_line  text;

-- A Tunisian CIN is eight digits. Stored as typed, checked for shape — a CIN with a space or a stray letter
-- is a typo, and a typo in the one field that identifies a buyer is worth refusing at the door.
alter table public.persons drop constraint if exists persons_cin_check;
alter table public.persons add constraint persons_cin_check
  check (cin is null or cin ~ '^[0-9]{8}$');

alter table public.persons drop constraint if exists persons_birth_place_check;
alter table public.persons add constraint persons_birth_place_check
  check (birth_place is null or char_length(btrim(birth_place)) between 2 and 120);

alter table public.persons drop constraint if exists persons_address_line_check;
alter table public.persons add constraint persons_address_line_check
  check (address_line is null or char_length(btrim(address_line)) between 5 and 300);

-- One CIN, one file. Partial, so the thousands of leads who never gave one do not collide with each other.
create unique index if not exists persons_cin_key on public.persons (cin) where cin is not null;

-- The column grant is the real gate: RLS already lets an admin, or the commercial a file is assigned to,
-- update that row, but `revoke update on public.persons` in 0001 means a column nobody granted stays
-- read-only however wide the policy is.
grant update (cin, cin_issued_on, birth_date, birth_place, address_line) on public.persons to authenticated;

comment on column public.persons.cin is 'رقم بطاقة التعريف الوطنية — ثمانية أرقام. يُطلب وقت البيع.';
comment on column public.persons.cin_issued_on is 'تاريخ إصدار بطاقة التعريف، كيما يتكتب في العقد.';
comment on column public.persons.address_line is 'العنوان الكامل كيما يتكتب في العقد.';
