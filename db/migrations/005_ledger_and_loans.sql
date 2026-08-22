-- 005  The ledger, and the loans a payout creates.
--
-- Every rupee that moves is one row in one table. Contributions, payouts,
-- repayments and corrections are the same shape, which is what lets thirteen
-- months of history, a flexible over-payment and a reduced withdrawal all be
-- the same mechanism instead of three special cases.
--
-- Two identities fall straight out of this and are worth stating, because the
-- whole app is built on them:
--
--     bank balance     = sum(fund_delta) over every row
--     member's equity  = sum(fund_delta) over that member's rows
--                      = what he has contributed  -  what he still owes
--
-- So the members' equity always adds up to exactly the money in the bank. That
-- is the number that gets divided up if the committee is ever resolved, and it
-- cannot drift, because it is not stored anywhere -- it is the same sum read
-- two ways.

create table public.loans (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id),
  cycle_no     int  not null references public.cycles (cycle_no),

  -- Recorded as issued. A later change to the settings does not rewrite a loan
  -- somebody is already halfway through repaying.
  principal    numeric(14,2) not null check (principal > 0),
  term_months  int           not null check (term_months between 1 and 120),
  installment  numeric(14,2) not null check (installment > 0),

  status       text not null default 'active' check (status in ('active', 'settled', 'void')),
  opened_at    timestamptz not null default now(),
  settled_at   timestamptz,
  note         text
);

comment on table public.loans is
  'A committee withdrawal, which the member repays month by month on top of his ordinary contribution. Paying more than the installment does not lower the installment -- it just ends the loan sooner.';

create index loans_member_idx on public.loans (member_id, status);
create index loans_cycle_idx  on public.loans (cycle_no);

create table public.ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  cycle_no    int  not null references public.cycles (cycle_no),
  member_id   uuid not null references public.members (id),
  loan_id     uuid references public.loans (id),

  entry_type  text not null check (entry_type in ('contribution', 'payout', 'repayment', 'adjustment')),

  -- Always positive. Which way the money went is the entry_type's job, not the
  -- sign's -- a negative "contribution" would be unreadable in a printed
  -- statement, which is where these rows finally get checked by ten people.
  amount      numeric(14,2) not null check (amount > 0),

  -- +1 for a real entry, -1 for the entry that cancels one. A correction is a
  -- new row, never an edit: the ledger is append-only, so the mistake and its
  -- reversal both stay visible and the two net to nothing.
  entry_sign  smallint not null default 1 check (entry_sign in (-1, 1)),

  -- Signed from the fund's point of view. Everything the app reports -- the
  -- bank balance, a member's equity, the monthly summary -- is a sum of this
  -- one column, which is why no two screens can disagree about a total.
  fund_delta  numeric(14,2)
              generated always as (
                amount * entry_sign * (case when entry_type = 'payout' then -1 else 1 end)
              ) stored,

  entry_date  date not null default current_date,
  note        text,

  -- Set only when the manager knowingly pushed past a solvency refusal. It is
  -- kept on the row forever and reprinted in the monthly summary, so an
  -- override is a decision on the record rather than a thing that happened.
  override_reason      text,

  reverses_entry_id    uuid unique references public.ledger_entries (id),
  reversed_by_entry_id uuid unique references public.ledger_entries (id),

  created_by  uuid references public.users (id) default public.current_uid(),
  created_at  timestamptz not null default now(),

  constraint ledger_reversal_sign check (
    (reverses_entry_id is null and entry_sign = 1) or
    (reverses_entry_id is not null and entry_sign = -1)
  ),
  constraint ledger_loan_required check (
    case entry_type
      when 'contribution' then loan_id is null
      when 'adjustment'   then true
      else loan_id is not null      -- payout and repayment always belong to a loan
    end
  )
);

create index ledger_member_idx on public.ledger_entries (member_id, cycle_no);
create index ledger_cycle_idx  on public.ledger_entries (cycle_no, entry_type);
create index ledger_loan_idx   on public.ledger_entries (loan_id) where loan_id is not null;

-- "Active" means a row that still counts: not itself a reversal, and not
-- reversed by one. Both halves of a reversed pair stay in the table and cancel
-- out in every sum, so nothing has to remember to filter them -- this index
-- exists for the uniqueness rules below, not for the arithmetic.

-- One person gets the committee each month. That is the whole idea of it.
create unique index ledger_one_payout_per_cycle
  on public.ledger_entries (cycle_no)
  where entry_type = 'payout'
    and reverses_entry_id is null
    and reversed_by_entry_id is null;

-- One contribution per member per month. A second one is a typo, or it is a
-- repayment that has been filed as a contribution -- either way, ask.
create unique index ledger_one_contribution_per_member_per_cycle
  on public.ledger_entries (cycle_no, member_id)
  where entry_type = 'contribution'
    and reverses_entry_id is null
    and reversed_by_entry_id is null;

/**
 * Where each loan stands. Paid-out and repaid are both read as sums of the
 * ledger rather than kept as columns, so reversing an entry corrects the loan
 * automatically and there is no second number that can go stale.
 */
create or replace view public.loan_positions as
select
  l.id,
  l.member_id,
  l.cycle_no,
  l.principal,
  l.term_months,
  l.installment,
  l.status,
  l.opened_at,
  l.settled_at,
  coalesce(p.paid_out, 0) as paid_out,
  coalesce(r.repaid,   0) as repaid,
  coalesce(p.paid_out, 0) - coalesce(r.repaid, 0) as outstanding,
  -- What falls due next month: the installment, or whatever is left of it.
  greatest(least(l.installment, coalesce(p.paid_out, 0) - coalesce(r.repaid, 0)), 0) as next_installment,
  -- Months left at the standing installment. This is the number that shrinks
  -- when somebody pays extra.
  ceil((coalesce(p.paid_out, 0) - coalesce(r.repaid, 0)) / nullif(l.installment, 0))::int as months_remaining
from public.loans l
left join (
  select loan_id, sum(amount * entry_sign) as paid_out
    from public.ledger_entries where entry_type = 'payout' group by loan_id
) p on p.loan_id = l.id
left join (
  select loan_id, sum(amount * entry_sign) as repaid
    from public.ledger_entries where entry_type = 'repayment' group by loan_id
) r on r.loan_id = l.id;

grant select, insert, update on public.loans, public.ledger_entries to app_user;
grant select on public.loan_positions to app_user;
