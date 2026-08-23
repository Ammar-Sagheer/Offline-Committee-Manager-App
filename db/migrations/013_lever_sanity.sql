-- 013  "Repay faster: 1 month" is not advice.
--
-- payout_levers() searches for the longest repayment term that still keeps the
-- fund above its cushion, and returns whatever it finds. With a small committee
-- and a large agreed withdrawal that search runs all the way down: on a
-- four-member committee taking Rs 145,000 it came back with a one-month term,
-- rendered on screen as "1 months — that puts the installment at Rs 145,000 a
-- month".
--
-- Arithmetically true, and useless. A withdrawal repaid in a single instalment
-- is not a committee at all, it is handing the money back. The honest answer
-- when the search lands there is that this lever alone cannot fix it, which the
-- screen already says when the term comes back null.
--
-- Three months is the floor. Below that the "loan" has no meaningful life, and
-- the instalment is a bigger monthly demand than the withdrawal was worth.

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

  -- Lever 1: repay it faster. Shorter is always at least as safe (same
  -- principal, bigger instalment, money back sooner), so counting down and
  -- stopping at the first term that works gives the LARGEST safe one -- the
  -- smallest change to ask the members for.
  --
  -- The loop floor is 3, not 1. Anything shorter is not a repayment schedule,
  -- and returning null here is what makes the screen say so.
  needed_term := null;
  if not is_affordable and v_set.repayment_term_months > 3 then
    for t in reverse (v_set.repayment_term_months - 1) .. 3 loop
      if public.terms_are_safe(v_set.max_payout_amount, null, t) then
        needed_term := t;
        exit;
      end if;
    end loop;
  end if;

  -- Lever 2: everyone puts in more each month. Binary search, then rounded UP
  -- to the nearest 50 -- rounding a required minimum down hands back a figure
  -- that does not actually work.
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

      -- If the answer is that everybody must contribute more than the
      -- withdrawal is worth, the lever has stopped meaning anything.
      if c < v_set.max_payout_amount then
        needed_contribution := c;
      end if;
    end if;
  end if;

  growth_after_ramp := v_members * v_set.contribution_amount;

  select s.step into trough_step
    from public.simulate_fund(v_set.projection_horizon_months,
                              v_set.max_payout_amount, v_set.max_payout_amount) s
   order by s.closing asc, s.step asc
   limit 1;

  return next;
end;
$$;
