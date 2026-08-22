-- 002  The committee's own rules, as data.
--
-- Every one of these is something the members can vote to change: the monthly
-- contribution, the repayment term, the ceiling on a withdrawal, the cushion
-- the fund refuses to dip below. They are settings, not constants in code,
-- because "which can also change in the future" was said about three of them.
--
-- Historical rows are NOT re-interpreted when a setting changes. A contribution
-- records the amount actually paid; a loan records the term and installment it
-- was issued under. Changing a setting therefore only affects what happens
-- next, which is the only behaviour anyone would expect from a ledger.

create table public.committee_settings (
  id                        int         primary key default 1 check (id = 1),

  contribution_amount       numeric(14,2) not null
                            check (contribution_amount > 0),

  repayment_term_months     int         not null
                            check (repayment_term_months between 1 and 120),

  max_payout_amount         numeric(14,2) not null
                            check (max_payout_amount > 0),

  -- The fund refuses to fall below this. It is what turns "don't default" from
  -- a hope into a rule the database can actually enforce.
  safety_buffer             numeric(14,2) not null default 50000
                            check (safety_buffer >= 0),

  -- How far ahead the solvency check looks before allowing a payout.
  projection_horizon_months int         not null default 36
                            check (projection_horizon_months between 6 and 240),

  -- Suggested amounts are rounded down to a multiple of this, because nobody
  -- hands over Rs 124,733.
  rounding_step             numeric(14,2) not null default 500
                            check (rounding_step > 0),

  started_on                date        not null,
  updated_at                timestamptz not null default now()
);

comment on column public.committee_settings.safety_buffer is
  'The fund must never be projected below this. Raising it makes the app more cautious about every future payout.';

-- Money settings are the kind of thing that gets changed at 11pm and then
-- argued about in the morning. Keep the argument short.
create table public.settings_history (
  id           bigserial primary key,
  changed_at   timestamptz not null default now(),
  changed_by   uuid references public.users (id),
  field        text not null,
  old_value    text,
  new_value    text
);

create or replace function public.log_settings_change()
returns trigger
language plpgsql
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

create trigger settings_history_trg
  before update on public.committee_settings
  for each row execute function public.log_settings_change();

grant select, insert, update on public.committee_settings to app_user;
grant select on public.settings_history to app_user;
grant usage, select on sequence public.settings_history_id_seq to app_user;
