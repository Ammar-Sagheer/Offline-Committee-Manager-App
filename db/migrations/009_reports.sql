-- 009  Everything the screens read.
--
-- All of it aggregates in Postgres. Nothing on a page adds a column of figures
-- up in JavaScript, because two screens doing that from the same rows will
-- eventually disagree -- usually because one of them is summing a list that
-- had a limit on it, and a cap on a list you are going to total is a cap on
-- the total.

/** Where each member stands. The one query the members page, the month screen and the statements all read. */
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
    select member_id,
           sum(next_installment)::numeric as installment_due,
           count(*)::int                  as active_loans
      from public.loan_positions
     where status = 'active' and outstanding > 0
     group by member_id
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

/**
 * Whose turn it should be.
 *
 * Never-taken first, then longest since last turn. It is a suggestion on a
 * screen, not a rule in the database -- the committee decides this among
 * themselves, and often for reasons an app has no business knowing about
 * (somebody's wedding, somebody's hospital bill).
 */
create or replace function public.payout_queue()
returns table (
  id                uuid,
  full_name         text,
  turns_taken       int,
  last_payout_cycle int,
  months_since      int,
  outstanding       numeric,
  equity            numeric,
  queue_position    int
)
language sql
stable
as $$
  select
    p.id, p.full_name, p.turns_taken, p.last_payout_cycle,
    case when p.last_payout_cycle is null then null
         else public.current_cycle_no() - p.last_payout_cycle end,
    p.outstanding,
    p.equity,
    row_number() over (
      order by p.turns_taken asc,
               coalesce(p.last_payout_cycle, -1) asc,
               p.display_order asc
    )::int
  from public.member_positions() p
  where p.is_active;
$$;

/** The dashboard, in one round trip. */
create or replace function public.dashboard_summary()
returns table (
  balance             numeric,
  member_count        int,
  contribution_amount numeric,
  cycle_no            int,
  period_month        date,
  paid_count          int,
  expected_this_cycle numeric,
  collected_this_cycle numeric,
  payout_done         boolean,
  payout_member       text,
  payout_amount       numeric,
  total_outstanding   numeric,
  total_equity        numeric,
  max_safe            numeric,
  ceiling             numeric,
  safety_buffer       numeric,
  repayment_term      int,
  trough              numeric,
  trough_month        date,
  months_to_trough    int
)
language plpgsql
stable
as $$
declare
  v_set   public.committee_settings;
  v_cycle int;
  v_low   record;
begin
  select * into v_set from public.committee_settings where id = 1;
  v_cycle := public.current_cycle_no();

  balance             := public.fund_balance();
  member_count        := public.active_member_count();
  contribution_amount := v_set.contribution_amount;
  cycle_no            := v_cycle;
  repayment_term      := v_set.repayment_term_months;
  ceiling             := v_set.max_payout_amount;
  safety_buffer       := v_set.safety_buffer;

  select c.period_month into period_month from public.cycles c where c.cycle_no = v_cycle;

  select count(*) filter (where p.paid_this_cycle)::int,
         sum(p.contributed) * 0 + count(*) * v_set.contribution_amount,
         sum(case when p.paid_this_cycle then v_set.contribution_amount else 0 end),
         sum(p.outstanding),
         sum(p.equity)
    into paid_count, expected_this_cycle, collected_this_cycle, total_outstanding, total_equity
    from public.member_positions() p
   where p.is_active;

  select true, m.full_name, e.amount
    into payout_done, payout_member, payout_amount
    from public.ledger_entries e
    join public.members m on m.id = e.member_id
   where e.cycle_no = v_cycle and e.entry_type = 'payout'
     and e.reverses_entry_id is null and e.reversed_by_entry_id is null
   limit 1;
  payout_done := coalesce(payout_done, false);

  max_safe := public.max_safe_payout(v_set.projection_horizon_months);

  -- Where the ceiling amount, kept up every month, would take the fund.
  select s.closing, s.period_month, s.step
    into v_low
    from public.simulate_fund(v_set.projection_horizon_months, v_set.max_payout_amount) s
   order by s.closing asc, s.step asc
   limit 1;

  trough           := v_low.closing;
  trough_month     := v_low.period_month;
  months_to_trough := v_low.step;

  return next;
end;
$$;

/** One member's whole history, newest first, ready to print. */
create or replace function public.member_statement(p_member_id uuid)
returns table (
  id            uuid,
  cycle_no      int,
  period_month  date,
  entry_date    date,
  entry_type    text,
  amount        numeric,
  entry_sign    smallint,
  fund_delta    numeric,
  note          text,
  override_reason text,
  is_reversed   boolean,
  is_reversal   boolean,
  running_equity numeric
)
language sql
stable
as $$
  select
    e.id, e.cycle_no, c.period_month, e.entry_date, e.entry_type,
    e.amount, e.entry_sign, e.fund_delta, e.note, e.override_reason,
    e.reversed_by_entry_id is not null,
    e.reverses_entry_id is not null,
    sum(e.fund_delta) over (order by e.cycle_no, e.created_at, e.id
                            rows between unbounded preceding and current row)
  from public.ledger_entries e
  join public.cycles c on c.cycle_no = e.cycle_no
  where e.member_id = p_member_id
  order by e.cycle_no desc, e.created_at desc;
$$;

/** Everything that happened in one committee month. */
create or replace function public.cycle_summary(p_cycle_no int default null)
returns table (
  cycle_no        int,
  period_month    date,
  status          text,
  contributions   numeric,
  contributors    int,
  repayments      numeric,
  payout          numeric,
  payout_member   text,
  override_reason text,
  net             numeric,
  closing_balance numeric
)
language sql
stable
as $$
  select
    c.cycle_no,
    c.period_month,
    c.status,
    coalesce(sum(e.amount * e.entry_sign) filter (where e.entry_type = 'contribution'), 0)::numeric,
    coalesce(count(*) filter (where e.entry_type = 'contribution' and e.entry_sign = 1
                                and e.reversed_by_entry_id is null), 0)::int,
    coalesce(sum(e.amount * e.entry_sign) filter (where e.entry_type = 'repayment'), 0)::numeric,
    coalesce(sum(e.amount * e.entry_sign) filter (where e.entry_type = 'payout'), 0)::numeric,
    max(m.full_name) filter (where e.entry_type = 'payout' and e.entry_sign = 1
                               and e.reversed_by_entry_id is null),
    max(e.override_reason) filter (where e.entry_type = 'payout'),
    coalesce(sum(e.fund_delta), 0)::numeric,
    (select coalesce(sum(e2.fund_delta), 0)
       from public.ledger_entries e2 where e2.cycle_no <= c.cycle_no)::numeric
  from public.cycles c
  left join public.ledger_entries e on e.cycle_no = c.cycle_no
  left join public.members m        on m.id = e.member_id
  where c.cycle_no = coalesce(p_cycle_no, public.current_cycle_no())
  group by c.cycle_no, c.period_month, c.status;
$$;

/** Every month at a glance, for the history page and the printed summary. */
create or replace function public.cycle_history()
returns table (
  cycle_no        int,
  period_month    date,
  status          text,
  contributions   numeric,
  contributors    int,
  repayments      numeric,
  payout          numeric,
  payout_member   text,
  closing_balance numeric
)
language sql
stable
as $$
  select
    c.cycle_no,
    c.period_month,
    c.status,
    coalesce(sum(e.amount * e.entry_sign) filter (where e.entry_type = 'contribution'), 0)::numeric,
    coalesce(count(*) filter (where e.entry_type = 'contribution' and e.entry_sign = 1
                                and e.reversed_by_entry_id is null), 0)::int,
    coalesce(sum(e.amount * e.entry_sign) filter (where e.entry_type = 'repayment'), 0)::numeric,
    coalesce(sum(e.amount * e.entry_sign) filter (where e.entry_type = 'payout'), 0)::numeric,
    max(m.full_name) filter (where e.entry_type = 'payout' and e.entry_sign = 1
                               and e.reversed_by_entry_id is null),
    sum(coalesce(sum(e.fund_delta), 0)) over (order by c.cycle_no
        rows between unbounded preceding and current row)::numeric
  from public.cycles c
  left join public.ledger_entries e on e.cycle_no = c.cycle_no
  left join public.members m        on m.id = e.member_id
  group by c.cycle_no, c.period_month, c.status
  order by c.cycle_no desc;
$$;

grant execute on function
  public.member_positions, public.payout_queue, public.dashboard_summary,
  public.member_statement, public.cycle_summary, public.cycle_history
to app_user;
