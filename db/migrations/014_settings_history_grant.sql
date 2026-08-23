-- 014  Saving the committee's rules failed with "permission denied".
--
-- Migration 002 added a trigger that records every change to
-- committee_settings, and granted the application role SELECT on the table it
-- writes to. Not INSERT. A trigger function runs as whoever fired it unless it
-- says otherwise, so every attempt to save the Settings screen died at the
-- audit line -- the one place nobody looks, because the failure names
-- settings_history and the person was editing committee_settings.
--
-- It went unnoticed because check:sql exercised the settings table as the
-- superuser, which every grant is invisible to. The regression check now
-- updates it through the application role, which is the only way this class of
-- bug shows up at all.
--
-- Fixed by making the trigger SECURITY DEFINER rather than by granting INSERT.
-- The audit log should not be writable by the role the app connects as -- an
-- audit trail its own subject can forge rows in is not worth keeping.

create or replace function public.log_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field text;
  v_old   text;
  v_new   text;
begin
  foreach v_field in array array[
    'contribution_amount', 'repayment_term_months', 'max_payout_amount',
    'safety_buffer', 'projection_horizon_months', 'rounding_step', 'started_on'
  ]
  loop
    execute format('select ($1).%I::text, ($2).%I::text', v_field, v_field)
       into v_old, v_new
      using old, new;

    if v_old is distinct from v_new then
      insert into public.settings_history (changed_by, field, old_value, new_value)
      values (public.current_uid(), v_field, v_old, v_new);
    end if;
  end loop;

  new.updated_at := now();
  return new;
end;
$$;

-- Belt and braces: the application role can read the log and nothing more.
revoke insert, update, delete on public.settings_history from app_user;
