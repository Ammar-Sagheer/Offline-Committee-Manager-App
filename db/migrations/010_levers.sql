-- 010  "So what do we change?"
--
-- Knowing the fund cannot carry Rs 145,000 is half an answer. The other half is
-- what would make it able to, and there are exactly three levers: hand over
-- less, repay faster, or put in more each month. This file lets the app work
-- out the size of each, by simulating the committee under terms it does not
-- actually have.
--
-- Note that none of these can be derived from a formula. The closed form for a
-- rotating fund only holds once it has settled down, and the binding constraint
-- for the next two years is the trough during the ramp-up -- which the steady
-- state cannot see. So each lever is a binary search over the real simulation.

drop function if exists public.simulate_fund(int, numeric, numeric);

/**
 * As before, with the committee's terms as arguments so a screen can ask what
 * would happen under different ones. Each defaults to what is actually agreed,
 * so every existing caller is unchanged.
 */
create or replace function public.simulate_fund(
  p_months           int     default null,
  p_recurring_payout numeric default null,
  p_first_payout     numeric default null,
  p_contribution     numeric default null,
  p_term             int     default null
)
returns setof public.projection_row
language plpgsql
stable
as $$
declare
  v_set          public.committee_settings;
  v_members      int;
  v_contrib_each numeric;
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
  v_contrib_each     := coalesce(p_contribution, v_set.contribution_amount);
  v_term             := coalesce(p_term, v_set.repayment_term_months);

  v_members      := public.active_member_count();
  v_full_contrib := v_members * v_contrib_each;
  v_balance      := public.fund_balance();
  v_cycle        := public.current_cycle_no();
  select period_month into v_month from public.cycles where cycle_no = v_cycle;

  select coalesce(count(*), 0) * v_contrib_each into v_pending
    from public.members m
   where m.is_active
     and not exists (
       select 1 from public.ledger_entries e
        where e.member_id = m.id and e.cycle_no = v_cycle
          and e.entry_type = 'contribution'
          and e.reverses_entry_id is null and e.reversed_by_entry_id is null
     );

  v_first_pay := coalesce(
    p_first_payout,
    case when exists (
           select 1 from public.ledger_entries
            where cycle_no = v_cycle and entry_type = 'payout'
              and reverses_entry_id is null and reversed_by_entry_id is null
         ) then 0 else p_recurring_payout end
  );

  v_repay := array_fill(0::numeric, array[p_months]);

  -- Withdrawals already outstanding keep the installment they were issued
  -- under, whatever the terms being tried. Somebody halfway through repaying
  -- does not have his monthly figure changed by a vote taken afterwards.
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

/** Does a given set of terms keep the account above its cushion throughout? */
create or replace function public.terms_are_safe(
  p_payout       numeric,
  p_contribution numeric default null,
  p_term         int     default null,
  p_months       int     default null
)
returns boolean
language plpgsql
stable
as $$
declare
  v_set public.committee_settings;
  v_min numeric;
begin
  select * into v_set from public.committee_settings where id = 1;
  select min(closing) into v_min
    from public.simulate_fund(
      coalesce(p_months, v_set.projection_horizon_months),
      p_payout, p_payout, p_contribution, p_term);
  return v_min >= v_set.safety_buffer;
end;
$$;

/**
 * The three levers, sized.
 *
 * Each answers the same question -- what would make the agreed withdrawal
 * affordable -- by changing one thing and leaving the rest alone. Any of them
 * may come back null, which honestly means "this lever alone cannot get there",
 * and the screen says so rather than printing a number that does not work.
 */
create or replace function public.payout_levers()
returns table (
  ceiling            numeric,
  is_affordable      boolean,
  max_payout_now     numeric,
  shortfall          numeric,
  needed_term        int,
  needed_contribution numeric,
  growth_after_ramp  numeric,
  trough_step        int
)
language plpgsql
stable
as $$
declare
  v_set     public.committee_settings;
  v_members int;
  t         int;
  c         numeric;
  v_lo      numeric;
  v_hi      numeric;
  v_mid     numeric;
  i         int;
begin
  select * into v_set from public.committee_settings where id = 1;
  v_members := public.active_member_count();

  ceiling        := v_set.max_payout_amount;
  max_payout_now := public.max_safe_payout(v_set.projection_horizon_months);
  is_affordable  := public.terms_are_safe(v_set.max_payout_amount);
  shortfall      := greatest(v_set.max_payout_amount - max_payout_now, 0);

  -- Lever 1: repay it faster. Shorter is always at least as safe, so the first
  -- term that works is the answer.
  needed_term := null;
  if not is_affordable then
    -- Shorter is always at least as safe (same principal, bigger installment,
    -- money back sooner), so counting down and stopping at the first one that
    -- works gives the LARGEST safe term -- the smallest change to ask for.
    for t in reverse (v_set.repayment_term_months - 1) .. 1 loop
      if public.terms_are_safe(v_set.max_payout_amount, null, t) then
        needed_term := t;
        exit;
      end if;
    end loop;
  end if;

  -- Lever 2: everyone puts in more each month. Binary search, then rounded UP
  -- to the nearest step -- rounding a required minimum down would hand back a
  -- figure that does not actually work.
  needed_contribution := null;
  if not is_affordable then
    v_lo := v_set.contribution_amount;
    v_hi := v_set.contribution_amount;
    for i in 1..12 loop
      exit when public.terms_are_safe(v_set.max_payout_amount, v_hi, null);
      v_hi := v_hi * 2;
    end loop;

    if public.terms_are_safe(v_set.max_payout_amount, v_hi, null) then
      for i in 1..30 loop
        v_mid := (v_lo + v_hi) / 2;
        if public.terms_are_safe(v_set.max_payout_amount, v_mid, null) then
          v_hi := v_mid;
        else
          v_lo := v_mid;
        end if;
      end loop;
      c := ceil(v_hi / 50) * 50;
      needed_contribution := c;
    end if;
  end if;

  -- The most useful thing to know about the squeeze: it is temporary.
  --
  -- Once the fund has settled, each member is repaying term/members overlapping
  -- withdrawals at once, so the repayments coming in each month add up to the
  -- whole payout going out -- and the fund grows by the month's contributions,
  -- WHATEVER the payout is. There is no permanent ceiling; there is only the
  -- ramp, while the repayment stream is still building up behind full-size
  -- withdrawals. That is worth saying on the screen, because "you can never
  -- afford this" and "you cannot afford this yet" call for different decisions.
  growth_after_ramp := v_members * v_set.contribution_amount;

  select s.step into trough_step
    from public.simulate_fund(v_set.projection_horizon_months,
                              v_set.max_payout_amount, v_set.max_payout_amount) s
   order by s.closing asc, s.step asc
   limit 1;

  return next;
end;
$$;

grant execute on function
  public.simulate_fund, public.terms_are_safe, public.payout_levers
to app_user;
