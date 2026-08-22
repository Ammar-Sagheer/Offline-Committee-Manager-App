-- 012  Every figure is a whole number of rupees.
--
-- Nobody in this committee hands over 67 paisa, and nobody wants to read them.
-- The obvious way to honour that is to round when printing -- and it is the
-- wrong way, because ten rows each rounded to the rupee do not add up to the
-- rounded total, and this is an app whose whole job is figures that add up.
--
-- So the rounding happens at the source instead. Amounts go in whole, the
-- installment is set whole when a withdrawal is recorded, and a constraint
-- keeps it that way. Then dropping the paisa on screen is not a rounding at
-- all -- it is just how the numbers already are.
--
-- The installment rounds UP: Rs 145,000 over 15 months is 9,666.67, so 9,667.
-- Rounding down would leave a few rupees outstanding after the final payment,
-- and a withdrawal that will not close is worse than a last installment a few
-- rupees short. The last payment is always least(installment, outstanding),
-- so it absorbs the difference by itself.

-- Existing rows first, or the constraint below cannot be added. The ledger is
-- append-only, so its guard is lifted for exactly this statement -- a schema
-- migration running as superuser, not the application reaching around a rule.
alter table public.ledger_entries disable trigger ledger_no_update;

update public.ledger_entries set amount = round(amount) where amount <> round(amount);
update public.loans set installment = ceil(installment) where installment <> ceil(installment);

alter table public.ledger_entries enable trigger ledger_no_update;

alter table public.ledger_entries
  add constraint ledger_whole_rupees check (amount = round(amount));

alter table public.loans
  add constraint loans_whole_rupees check (installment = round(installment) and principal = round(principal));

/** As before, with the installment and the amount kept whole. */
create or replace function public.record_payout(
  p_member_id       uuid,
  p_amount          numeric,
  p_cycle_no        int     default null,
  p_term_months     int     default null,
  p_entry_date      date    default null,
  p_note            text    default null,
  p_override_reason text    default null
)
returns uuid
language plpgsql
as $$
declare
  v_loan_id uuid;
  v_entry   uuid;
  v_term    int;
  v_inst    numeric;
  v_amount  numeric := round(coalesce(p_amount, 0));
  v_cycle   int := coalesce(p_cycle_no, public.current_cycle_no());
begin
  if v_amount <= 0 then
    raise exception 'Enter how much is being handed over.';
  end if;

  select coalesce(p_term_months, repayment_term_months) into v_term
    from public.committee_settings where id = 1;

  v_inst := ceil(v_amount::numeric / v_term);

  insert into public.loans (member_id, cycle_no, principal, term_months, installment, note)
  values (p_member_id, v_cycle, v_amount, v_term, v_inst, p_note)
  returning id into v_loan_id;

  -- The solvency trigger fires on this insert. If it refuses, the loan row
  -- above rolls back with it -- which is why both writes are in one function.
  insert into public.ledger_entries
    (cycle_no, member_id, loan_id, entry_type, amount, entry_date, note, override_reason)
  values
    (v_cycle, p_member_id, v_loan_id, 'payout', v_amount,
     coalesce(p_entry_date, current_date), p_note, nullif(trim(coalesce(p_override_reason, '')), ''))
  returning id into v_entry;

  return v_entry;
exception
  when unique_violation then
    raise exception 'The committee for month % has already been given to %. Reverse that first if it was recorded against the wrong person.',
      v_cycle,
      (select m.full_name from public.ledger_entries e join public.members m on m.id = e.member_id
        where e.cycle_no = v_cycle and e.entry_type = 'payout'
          and e.reverses_entry_id is null and e.reversed_by_entry_id is null limit 1);
end;
$$;

create or replace function public.record_contribution(
  p_member_id  uuid,
  p_cycle_no   int     default null,
  p_amount     numeric default null,
  p_entry_date date    default null,
  p_note       text    default null
)
returns uuid
language plpgsql
as $$
declare
  v_id     uuid;
  v_amount numeric;
  v_cycle  int := coalesce(p_cycle_no, public.current_cycle_no());
begin
  select round(coalesce(p_amount, contribution_amount)) into v_amount
    from public.committee_settings where id = 1;

  insert into public.ledger_entries (cycle_no, member_id, entry_type, amount, entry_date, note)
  values (v_cycle, p_member_id, 'contribution', v_amount, coalesce(p_entry_date, current_date), p_note)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception '% has already been marked paid for committee month %.',
      (select full_name from public.members where id = p_member_id), v_cycle;
end;
$$;

create or replace function public.record_repayment(
  p_member_id  uuid,
  p_amount     numeric,
  p_cycle_no   int     default null,
  p_entry_date date    default null,
  p_note       text    default null,
  p_loan_id    uuid    default null
)
returns int
language plpgsql
as $$
declare
  v_cycle     int := coalesce(p_cycle_no, public.current_cycle_no());
  v_amount    numeric := round(coalesce(p_amount, 0));
  v_left      numeric;
  v_total_out numeric;
  v_take      numeric;
  v_count     int := 0;
  rec         record;
begin
  if v_amount <= 0 then
    raise exception 'Enter how much has been repaid.';
  end if;
  v_left := v_amount;

  select coalesce(sum(outstanding), 0) into v_total_out
    from public.loan_positions
   where member_id = p_member_id and status = 'active' and outstanding > 0
     and (p_loan_id is null or id = p_loan_id);

  if v_total_out <= 0 then
    raise exception '% has nothing outstanding on the committee, so there is nothing to repay.',
      (select full_name from public.members where id = p_member_id);
  end if;

  if v_amount > v_total_out then
    raise exception '% owes Rs % in total. Enter that or less.',
      (select full_name from public.members where id = p_member_id),
      to_char(v_total_out, 'FM999,999,999');
  end if;

  for rec in
    select id, outstanding from public.loan_positions
     where member_id = p_member_id and status = 'active' and outstanding > 0
       and (p_loan_id is null or id = p_loan_id)
     order by cycle_no, opened_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, rec.outstanding);

    insert into public.ledger_entries
      (cycle_no, member_id, loan_id, entry_type, amount, entry_date, note)
    values
      (v_cycle, p_member_id, rec.id, 'repayment', v_take, coalesce(p_entry_date, current_date), p_note);

    v_left  := v_left - v_take;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

/** The projection works in whole rupees too, so its figures match the ledger's. */
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
      coalesce((
        select sum(e.amount * e.entry_sign)
          from public.ledger_entries e
         where e.loan_id = lp.id and e.entry_type = 'repayment' and e.cycle_no = v_cycle
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
