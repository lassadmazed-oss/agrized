-- 0008 · Finance and Legal read the CRM but do not write to it (matrix 22.1).
-- Notes and contact attempts are limited to the file's commercial and to admins.

create or replace function app.can_edit_person(p_person_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_admin()
      or (app.has_role('commercial')
          and exists (select 1 from public.persons p where p.id = p_person_id and p.assigned_to = auth.uid()))
$$;

drop policy contact_attempts_insert on public.contact_attempts;
create policy contact_attempts_insert on public.contact_attempts for insert to authenticated
  with check (created_by = (select auth.uid()) and app.can_edit_person(person_id));

drop policy person_notes_insert on public.person_notes;
create policy person_notes_insert on public.person_notes for insert to authenticated
  with check (created_by = (select auth.uid()) and app.can_edit_person(person_id));
