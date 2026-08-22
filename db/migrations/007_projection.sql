-- 007  Will the fund still be solvent in three years?
--
-- This is the part of the app that earns its keep. A committee like this one
-- has a timing problem that is invisible from the current bank balance: with
-- ten members the rotation is ten months, but a withdrawal is repaid over
-- fifteen. So for the first year and a bit, full-size payouts are going out
-- while the repayment stream is still building up, and the accumulated savings
-- have to cover the gap. Once past that ramp the fund grows every month and
-- the payout can safely be raised.
--
-- Reading the balance tells you none of that. Simulating does.

create type public.projection_row as (
  step          int,
  cycle_no      int,
  period_month  date,
  opening       numeric,
  contributions numeric,
  repayments    numeric,
  payout        numeric,
  closing       numeric
);

/**
 * Roll the fund forward month by month.
 *
 * Step 1 is the CURRENT committee month and counts only what has not happened
 * yet in it -- the contributions still to come in, and the payout being
 * considered. Everything already recorded this month is in fund_balance()
 * already, so counting it again is the classic way to build a projection that
 * quietly flatters itself.
 *
 * Every existing withdrawal is repaid on its own standing installment until it
 * is gone -- which is what makes an over-payment show up here as the loan
 * ending early rather than as a smaller monthly figure.
 */
create or replace function public.simulate_fund(
  p_months           int     default null,
  p_recurring_payout numeric default null,
  p_first_payout     numeric default null
)
returns setof public.projection_row
language plpgsql
stable
as $$
declare
  v_set          public.committee_settings;
  v_members      int;
  v_full_contrib numeric;
  v_term         int;
  v_repay        numeric[];
  v_balance      numeric;
  v_cycle        int;
  v_month        date;
  v_pending      numeric;
  v_first_pay    numeric;
  v_pay          numeric;
  v_inst         numeric;
  v_left         numeric;
  v_due          numeric;
  i int;
  j int;
  rec record;
  out_row public.projection_row;
begin
  select * into v_set from public.committee_settings where id = 1;
  if v_set is null then
    raise exception 'The committee has not been set up yet.';
  end if;

  p_months           := coalesce(p_months, v_set.projection_horizon_months);
  p_recurring_payout := coalesce(p_recurring_payout, v_set.max_payout_amount);

  v_members      := public.active_member_count();
  v_full_contrib := v_members * v_set.contribution_amount;
  v_term         := v_set.repayment_term_months;
  v_balance      := public.fund_balance();
  v_cycle        := public.current_cycle_no();
  select period_month into v_month from public.cycles where cycle_no = v_cycle;

  -- What is still owed INTO the fund for the month now in progress.
  select coalesce(sum(v_set.contribution_amount), 0) into v_pending
    from public.members m
   where m.is_active
     and not exists (
       select 1 from public.ledger_entries e
        where e.member_id = m.id
          and e.cycle_no = v_cycle
          and e.entry_type = 'contribution'
          and e.reverses_entry_id is null
          and e.reversed_by_entry_id is null
     );

  -- If this month's committee has already been handed over, step 1 pays nothing
  -- more; the caller can still force a figure to ask "what if".
  v_first_pay := coalesce(
    p_first_payout,
    case when exists (
           select 1 from public.ledger_entries
            where cycle_no = v_cycle and entry_type = 'payout'
              and reverses_entry_id is null and reversed_by_entry_id is null
         ) then 0 else p_recurring_payout end
  );

  v_repay := array_fill(0::numeric, array[p_months]);

  -- Withdrawals already outstanding. Scheduled from step 2, because whatever
  -- came in this month is already counted in the opening balance -- erring
  -- towards a later inflow rather than an earlier one, which is the right way
  -- for a solvency check to be wrong.
  for rec in
    select outstanding, installment from public.loan_positions
     where status = 'active' and outstanding > 0
  loop
    v_left := rec.outstanding;
    v_inst := rec.installment;
    j := 2;
    while v_left > 0 and j <= p_months loop
      v_due := least(v_inst, v_left);
      v_repay[j] := v_repay[j] + v_due;
      v_left := v_left - v_due;
      j := j + 1;
    end loop;
  end loop;

  for i in 1..p_months loop
    v_pay := case when i = 1 then v_first_pay else p_recurring_payout end;

    out_row.step          := i;
    out_row.cycle_no      := v_cycle + i - 1;
    out_row.period_month  := (v_month + ((i - 1) || ' month')::interval)::date;
    out_row.opening       := round(v_balance, 2);
    out_row.contributions := case when i = 1 then v_pending else v_full_contrib end;
    out_row.repayments    := round(v_repay[i], 2);
    out_row.payout        := v_pay;

    v_balance := v_balance + out_row.contributions + v_repay[i] - v_pay;
    out_row.closing := round(v_balance, 2);
    return next out_row;

    -- The withdrawal handed over in this step is repaid starting the next one.
    if v_pay > 0 and v_term > 0 then
      v_inst := round(v_pay / v_term, 2);
      v_left := v_pay;
      j := i + 1;
      while v_left > 0 and j <= p_months loop
        v_due := least(v_inst, v_left);
        v_repay[j] := v_repay[j] + v_due;
        v_left := v_left - v_due;
        j := j + 1;
      end loop;
    end if;
  end loop;
end;
$$;

/**
 * The largest recurring withdrawal the fund can sustain without ever dropping
 * below its safety buffer, rounded down to something a person would actually
 * hand over.
 *
 * Binary search rather than a formula on purpose: the closed form only holds
 * for a fund in its steady state, and this committee is nowhere near one. The
 * binding constraint for the next two years is the trough during the ramp-up,
 * which no formula sees.
 */
create or replace function public.max_safe_payout(p_months int default null)
returns numeric
language plpgsql
stable
as $$
declare
  v_set  public.committee_settings;
  v_lo   numeric := 0;
  v_hi   numeric;
  v_mid  numeric;
  v_min  numeric;
  i      int;
begin
  select * into v_set from public.committee_settings where id = 1;
  p_months := coalesce(p_months, v_set.projection_horizon_months);

  -- Comfortably above anything reachable; the search closes on it fast.
  v_hi := greatest(public.fund_balance(), v_set.max_payout_amount) * 4 + 1000000;

  for i in 1..44 loop
    v_mid := (v_lo + v_hi) / 2;
    select min(closing) into v_min from public.simulate_fund(p_months, v_mid, v_mid);
    if v_min >= v_set.safety_buffer then
      v_lo := v_mid;
    else
      v_hi := v_mid;
    end if;
  end loop;

  return greatest(floor(v_lo / v_set.rounding_step) * v_set.rounding_step, 0);
end;
$$;

/**
 * Everything the app needs to decide about one proposed withdrawal, in one
 * round trip, with the same numbers the refusal below would use.
 *
 * Two very different failures, deliberately kept apart:
 *
 *   overdrawn -- the money is not in the account. Physics. Nothing overrides it.
 *   unsafe    -- the money is there, but paying this much every month runs the
 *                fund below its cushion later on. Policy. Overridable, on the
 *                record, with a reason.
 */
create or replace function public.payout_safety(p_amount numeric)
returns table (
  amount          numeric,
  balance         numeric,
  overdrawn       boolean,
  over_ceiling    boolean,
  unsafe          boolean,
  trough          numeric,
  trough_cycle    int,
  trough_month    date,
  max_safe        numeric,
  safety_buffer   numeric,
  ceiling         numeric
)
language plpgsql
stable
as $$
declare
  v_set public.committee_settings;
  v_low record;
begin
  select * into v_set from public.committee_settings where id = 1;

  select s.closing, s.cycle_no, s.period_month
    into v_low
    from public.simulate_fund(v_set.projection_horizon_months, p_amount, p_amount) s
   order by s.closing asc, s.step asc
   limit 1;

  amount        := p_amount;
  balance       := public.fund_balance();
  overdrawn     := p_amount > balance;
  over_ceiling  := p_amount > v_set.max_payout_amount;
  trough        := v_low.closing;
  trough_cycle  := v_low.cycle_no;
  trough_month  := v_low.period_month;
  unsafe        := v_low.closing < v_set.safety_buffer;
  max_safe      := public.max_safe_payout(v_set.projection_horizon_months);
  safety_buffer := v_set.safety_buffer;
  ceiling       := v_set.max_payout_amount;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- The refusal
-- ---------------------------------------------------------------------------

/**
 * Refuse a withdrawal that would break the fund.
 *
 * Overdrawing is refused outright: an override cannot conjure money that is not
 * in the account. Everything else -- exceeding the agreed ceiling, or setting a
 * course that runs the fund below its cushion in two years' time -- is refused
 * unless the manager states a reason, which is then stored on the entry and
 * reprinted on the monthly summary for the other nine to read.
 */
create or replace function public.payout_must_be_solvent()
returns trigger
language plpgsql
as $$
declare
  v_chk    record;
  v_member text;
begin
  if new.entry_type <> 'payout' or new.entry_sign = -1 then
    return new;
  end if;

  select full_name into v_member from public.members where id = new.member_id;
  select * into v_chk from public.payout_safety(new.amount);

  if v_chk.overdrawn then
    raise exception
      'The committee account holds Rs %, so Rs % cannot be handed to %. This one cannot be overridden -- the money is not there.',
      to_char(v_chk.balance, 'FM999,999,999'),
      to_char(new.amount,    'FM999,999,999'),
      v_member;
  end if;

  if new.override_reason is not null and length(trim(new.override_reason)) >= 5 then
    return new;
  end if;

  if v_chk.over_ceiling then
    raise exception
      'The committee agreed a ceiling of Rs % per person. Rs % is above it. Lower the amount, change the agreed ceiling in Settings, or record a reason for going over it.',
      to_char(v_chk.ceiling, 'FM999,999,999'),
      to_char(new.amount,    'FM999,999,999');
  end if;

  if v_chk.unsafe then
    raise exception
      'Handing over Rs % every month runs the committee account down to Rs % by % -- below the Rs % cushion. The most it can afford each month is Rs %. Lower the amount, or record a reason for going ahead anyway.',
      to_char(new.amount,       'FM999,999,999'),
      to_char(v_chk.trough,     'FM999,999,999'),
      to_char(v_chk.trough_month, 'FMMonth YYYY'),
      to_char(v_chk.safety_buffer, 'FM999,999,999'),
      to_char(v_chk.max_safe,   'FM999,999,999');
  end if;

  return new;
end;
$$;

create trigger ledger_payout_solvency
  before insert on public.ledger_entries
  for each row execute function public.payout_must_be_solvent();

grant execute on function
  public.simulate_fund, public.max_safe_payout, public.payout_safety
to app_user;
