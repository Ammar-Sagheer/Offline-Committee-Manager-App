-- 011  The projection was losing a month of repayments, and then another.
--
-- simulate_fund scheduled every outstanding withdrawal's remaining installments
-- from step 2, on the reasoning that anything paid during the month in progress
-- is already in the opening balance. That is true of what has been paid. It is
-- not true of what is still to come -- and by pushing the WHOLE remaining
-- schedule back a month, the error was not one month's caution, it was one
-- month's caution repeated for every withdrawal on the books, compounding as
-- the committee comes round again and members carry two at once.
--
-- It showed up as the fund refusing an amount it had allowed the month before,
-- with nothing having changed except that a withdrawal now existed.
--
-- Contributions were always handled the right way here -- step 1 counts the
-- ones still to come in, not all of them. This makes repayments match: what is
-- still due this month on each withdrawal falls in step 1, and only the rest
-- moves out to step 2.

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

  -- Contributions still to come in this month. What has already arrived is in
  -- the opening balance, and counting it twice is the classic way to build a
  -- projection that quietly flatters itself.
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

  -- Withdrawals already outstanding, on the installment they were issued under.
  -- Whatever is still due on each of them THIS month falls in step 1; the rest
  -- runs on from step 2.
  for rec in
    select
      lp.outstanding,
      lp.installment,
      coalesce((
        select sum(e.amount * e.entry_sign)
          from public.ledger_entries e
         where e.loan_id = lp.id
           and e.entry_type = 'repayment'
           and e.cycle_no = v_cycle
      ), 0) as paid_this_cycle
    from public.loan_positions lp
   where lp.status = 'active' and lp.outstanding > 0
  loop
    v_left := rec.outstanding;

    v_due := least(greatest(rec.installment - rec.paid_this_cycle, 0), v_left);
    if v_due > 0 then
      v_repay[1] := v_repay[1] + v_due;
      v_left := v_left - v_due;
    end if;

    j := 2;
    while v_left > 0 and j <= p_months loop
      v_due := least(rec.installment, v_left);
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
