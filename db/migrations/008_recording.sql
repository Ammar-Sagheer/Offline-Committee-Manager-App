-- 008  The four things that actually happen each month.
--
-- Recording lives in SQL rather than in a Server Action for one practical
-- reason: a payout is two writes (the loan and the ledger entry) and a
-- repayment can be several (one per withdrawal it clears), and any of them
-- failing halfway would leave the books wrong. One function, one transaction,
-- one place to read when a figure looks odd.

/** Somebody paid his Rs 4,000 for the month. */
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
  select coalesce(p_amount, contribution_amount) into v_amount
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

/**
 * The committee is handed to somebody.
 *
 * Creates the withdrawal and its ledger entry together. The installment is
 * fixed here, at the term in force today, and is never recalculated -- a member
 * halfway through repaying should not find his monthly figure changed because
 * the committee voted on something else.
 */
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
  v_cycle   int := coalesce(p_cycle_no, public.current_cycle_no());
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter how much is being handed over.';
  end if;

  select coalesce(p_term_months, repayment_term_months) into v_term
    from public.committee_settings where id = 1;

  v_inst := round(p_amount / v_term, 2);

  insert into public.loans (member_id, cycle_no, principal, term_months, installment, note)
  values (p_member_id, v_cycle, p_amount, v_term, v_inst, p_note)
  returning id into v_loan_id;

  -- The solvency trigger fires on this insert. If it refuses, the loan row
  -- above is rolled back with it -- which is the reason both writes are here.
  insert into public.ledger_entries
    (cycle_no, member_id, loan_id, entry_type, amount, entry_date, note, override_reason)
  values
    (v_cycle, p_member_id, v_loan_id, 'payout', p_amount,
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

/**
 * A repayment against what somebody has taken out.
 *
 * Spread oldest-withdrawal-first when he owes on more than one, which happens
 * from the eleventh month onwards -- the rotation comes round again before a
 * fifteen-month repayment has finished. Arshad should not have to decide which
 * bucket a note goes into; the answer is always the oldest.
 *
 * Paying more than the installment is allowed and is the point: the extra comes
 * straight off the outstanding, so the withdrawal finishes early and the money
 * is back in the fund sooner, which is what lets everyone else take more.
 */
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
  v_left      numeric := p_amount;
  v_total_out numeric;
  v_take      numeric;
  v_count     int := 0;
  rec         record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter how much has been repaid.';
  end if;

  select coalesce(sum(outstanding), 0) into v_total_out
    from public.loan_positions
   where member_id = p_member_id and status = 'active' and outstanding > 0
     and (p_loan_id is null or id = p_loan_id);

  if v_total_out <= 0 then
    raise exception '% has nothing outstanding on the committee, so there is nothing to repay.',
      (select full_name from public.members where id = p_member_id);
  end if;

  if p_amount > v_total_out then
    raise exception '% owes Rs % in total. Enter that or less.',
      (select full_name from public.members where id = p_member_id),
      to_char(v_total_out, 'FM999,999,999.99');
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

/**
 * Undo an entry by writing its opposite. The original stays exactly where it
 * was; both rows show on the statement, and they cancel out in every total.
 */
create or replace function public.reverse_entry(p_entry_id uuid, p_note text default null)
returns uuid
language plpgsql
as $$
declare
  v_orig  public.ledger_entries;
  v_new   uuid;
  v_cycle text;
begin
  select * into v_orig from public.ledger_entries where id = p_entry_id;
  if v_orig is null then
    raise exception 'That entry could not be found.';
  end if;

  select status into v_cycle from public.cycles where cycle_no = v_orig.cycle_no;
  if v_cycle = 'closed' then
    raise exception 'Committee month % is closed. Reopen it before correcting anything in it.', v_orig.cycle_no;
  end if;

  insert into public.ledger_entries
    (cycle_no, member_id, loan_id, entry_type, amount, entry_sign, entry_date, note, reverses_entry_id)
  values
    (v_orig.cycle_no, v_orig.member_id, v_orig.loan_id, v_orig.entry_type, v_orig.amount, -1,
     current_date, coalesce(p_note, 'Correction'), p_entry_id)
  returning id into v_new;

  update public.ledger_entries set reversed_by_entry_id = v_new where id = p_entry_id;

  -- A withdrawal that never really happened should not leave a loan behind.
  if v_orig.entry_type = 'payout' and v_orig.loan_id is not null then
    update public.loans set status = 'void' where id = v_orig.loan_id;
  end if;

  return v_new;
end;
$$;

/**
 * First run: turn a list of names and a start month into a committee with real
 * history behind it.
 *
 * The thirteen months already collected are written as thirteen months of
 * contributions rather than one opening balance, because "how much has Iqbal
 * put in" is a question that gets asked, and an opening balance cannot answer
 * it. Any month somebody actually missed is unticked afterwards on the month
 * screen.
 */
create or replace function public.bootstrap_committee(
  p_member_names     text[],
  p_start_month      date,
  p_months_collected int,
  p_contribution     numeric,
  p_term_months      int,
  p_max_payout       numeric,
  p_safety_buffer    numeric default 50000,
  p_mark_all_paid    boolean default true
)
returns void
language plpgsql
as $$
declare
  v_name  text;
  v_month date := date_trunc('month', p_start_month)::date;
  i       int;
  v_order int := 0;
begin
  if exists (select 1 from public.members) then
    raise exception 'This committee has already been set up.';
  end if;
  if array_length(p_member_names, 1) is null then
    raise exception 'Add at least one member.';
  end if;
  if p_months_collected < 0 then
    raise exception 'Months already collected cannot be negative.';
  end if;

  insert into public.committee_settings
    (id, contribution_amount, repayment_term_months, max_payout_amount, safety_buffer, started_on)
  values
    (1, p_contribution, p_term_months, p_max_payout, p_safety_buffer, v_month);

  foreach v_name in array p_member_names loop
    if length(trim(v_name)) > 0 then
      v_order := v_order + 1;
      insert into public.members (full_name, display_order, joined_on)
      values (trim(v_name), v_order, v_month);
    end if;
  end loop;

  -- Every collected month, plus the one now in progress.
  for i in 1..(p_months_collected + 1) loop
    insert into public.cycles (cycle_no, period_month)
    values (i, (v_month + ((i - 1) || ' month')::interval)::date);
  end loop;

  if p_mark_all_paid then
    insert into public.ledger_entries (cycle_no, member_id, entry_type, amount, entry_date, note)
    select c.cycle_no, m.id, 'contribution', p_contribution,
           (c.period_month + interval '1 month - 1 day')::date,
           'Recorded when the app was set up'
      from public.cycles c
     cross join public.members m
     where c.cycle_no <= p_months_collected;
  end if;

  -- Lock the history. The month in progress stays open.
  update public.cycles set status = 'closed', closed_at = now()
   where cycle_no <= p_months_collected;
end;
$$;

grant execute on function
  public.record_contribution, public.record_payout, public.record_repayment,
  public.reverse_entry, public.bootstrap_committee
to app_user;
