-- 015  The month you take the committee, you owe nothing back yet.
--
-- Arshed was handed the committee in month 15 and the same screen showed him
-- Rs 15,000 already due, in the month he received it. He owes his ordinary
-- contribution that month and nothing else; the first installment falls due the
-- month after.
--
-- Two places had it wrong, and they had to agree:
--
--   member_positions() summed the installment of every active withdrawal
--   regardless of when it was made, so a withdrawal handed over an hour ago
--   produced an instalment due today.
--
--   simulate_fund() did the same in step 1, counting an inflow this month from
--   a withdrawal made this month. It made the fund look better off than it is,
--   in the one month where the money has just left the account -- so a payout
--   could be accepted partly on the strength of its own repayment.
--
-- The withdrawal the projection *itself* hands out at each step was always
-- scheduled from the following step. This makes the withdrawals already on the
-- books behave the same way.
--
-- Nothing stops a member paying early if he wants to. This is about what falls
-- due, not what is allowed.

create or replace function public.member_positions(p_cycle_no int default null)
returns table (
  id                 uuid,
  full_name          text,
  display_order      int,
  is_active          boolean,
  contributed        numeric,
  withdrawn          numeric,
  repaid             numeric,
  outstanding        numeric,
  equity             numeric,
  months_paid        int,
  paid_this_cycle    boolean,
  repaid_this_cycle  numeric,
  installment_due    numeric,
  due_this_month     numeric,
  active_loans       int,
  last_payout_cycle  int,
  turns_taken        int
)
language sql
stable
as $$
  with cyc as (
    select coalesce(p_cycle_no, public.current_cycle_no()) as cycle_no
  ),
  settings as (select contribution_amount from public.committee_settings where id = 1),
  totals as (
    select
      e.member_id,
      sum(case when e.entry_type = 'contribution' then e.amount * e.entry_sign else 0 end) as contributed,
      sum(case when e.entry_type = 'payout'       then e.amount * e.entry_sign else 0 end) as withdrawn,
      sum(case when e.entry_type = 'repayment'    then e.amount * e.entry_sign else 0 end) as repaid,
      sum(e.fund_delta)                                                                    as equity,
      count(*) filter (
        where e.entry_type = 'contribution' and e.entry_sign = 1 and e.reversed_by_entry_id is null
      )::int                                                                               as months_paid,
      count(*) filter (
        where e.entry_type = 'payout' and e.entry_sign = 1 and e.reversed_by_entry_id is null
      )::int                                                                               as turns_taken,
      max(case when e.entry_type = 'payout' and e.entry_sign = 1 and e.reversed_by_entry_id is null
               then e.cycle_no end)                                                        as last_payout_cycle
    from public.ledger_entries e
    group by e.member_id
  ),
  this_cycle as (
    select
      e.member_id,
      bool_or(e.entry_type = 'contribution' and e.entry_sign = 1 and e.reversed_by_entry_id is null) as paid_this_cycle,
      sum(case when e.entry_type = 'repayment' then e.amount * e.entry_sign else 0 end)              as repaid_this_cycle
    from public.ledger_entries e, cyc
    where e.cycle_no = cyc.cycle_no
    group by e.member_id
  ),
  loans as (
    -- Only a withdrawal from an EARLIER month has an installment falling due
    -- in this one. The count still includes this month's, because he does have
    -- it -- he just has not started repaying it.
    select
      lp.member_id,
      sum(case when lp.cycle_no < c.cycle_no then lp.next_installment else 0 end)::numeric as installment_due,
      count(*)::int                                                                        as active_loans
    from public.loan_positions lp
    cross join cyc c
    where lp.status = 'active' and lp.outstanding > 0
    group by lp.member_id
  ),
  owed as (
    select member_id, sum(outstanding)::numeric as outstanding
      from public.loan_positions where outstanding > 0 group by member_id
  )
  select
    m.id,
    m.full_name,
    m.display_order,
    m.is_active,
    coalesce(t.contributed, 0)::numeric,
    coalesce(t.withdrawn, 0)::numeric,
    coalesce(t.repaid, 0)::numeric,
    coalesce(o.outstanding, 0)::numeric,
    coalesce(t.equity, 0)::numeric,
    coalesce(t.months_paid, 0),
    coalesce(tc.paid_this_cycle, false),
    coalesce(tc.repaid_this_cycle, 0)::numeric,
    coalesce(l.installment_due, 0)::numeric,
    (case when coalesce(tc.paid_this_cycle, false) then 0 else s.contribution_amount end
       + coalesce(l.installment_due, 0) - coalesce(tc.repaid_this_cycle, 0))::numeric,
    coalesce(l.active_loans, 0),
    t.last_payout_cycle,
    coalesce(t.turns_taken, 0)
  from public.members m
  cross join settings s
  left join totals     t  on t.member_id  = m.id
  left join this_cycle tc on tc.member_id = m.id
  left join loans      l  on l.member_id  = m.id
  left join owed       o  on o.member_id  = m.id
  order by m.display_order, m.full_name;
$$;

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
  p_recurring_payout := round(coalesce(p_recurring_payout, v_set.max_payout_amount));
  v_contrib_each     := round(coalesce(p_contribution, v_set.contribution_amount));
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

  v_first_pay := round(coalesce(
    p_first_payout,
    case when exists (
           select 1 from public.ledger_entries
            where cycle_no = v_cycle and entry_type = 'payout'
              and reverses_entry_id is null and reversed_by_entry_id is null
         ) then 0 else p_recurring_payout end
  ));

  v_repay := array_fill(0::numeric, array[p_months]);

  for rec in
    select
      lp.outstanding,
      lp.installment,
      lp.cycle_no,
      coalesce((
        select sum(e.amount * e.entry_sign)
          from public.ledger_entries e
         where e.loan_id = lp.id and e.entry_type = 'repayment' and e.cycle_no = v_cycle
      ), 0) as paid_this_cycle
    from public.loan_positions lp
   where lp.status = 'active' and lp.outstanding > 0
  loop
    v_left := rec.outstanding;

    -- A withdrawal handed over THIS month is repaid from next month, exactly
    -- like the ones this projection hands out at each later step. Counting an
    -- installment now would let a payout be approved partly on the strength of
    -- its own repayment, in the very month the money leaves.
    if rec.cycle_no < v_cycle then
      v_due := least(greatest(rec.installment - rec.paid_this_cycle, 0), v_left);
      if v_due > 0 then
        v_repay[1] := v_repay[1] + v_due;
        v_left := v_left - v_due;
      end if;
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
    out_row.opening       := round(v_balance);
    out_row.contributions := case when i = 1 then v_pending else v_full_contrib end;
    out_row.repayments    := round(v_repay[i]);
    out_row.payout        := v_pay;

    v_balance := v_balance + out_row.contributions + v_repay[i] - v_pay;
    out_row.closing := round(v_balance);
    return next out_row;

    if v_pay > 0 and v_term > 0 then
      v_inst := ceil(v_pay / v_term);
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
