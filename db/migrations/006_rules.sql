-- 006  The rules the database will not be talked out of.
--
-- Everything in this file could have been written as a check in a Server
-- Action. None of it is, and the reason is worth stating once: an application
-- check is a courtesy. A second window, a direct psql session, a future
-- refactor or a restored backup walks straight past it. These are money rules
-- for ten people's savings, so they live where nothing can go around them.
--
-- The error messages are written as sentences aimed at Arshad, naming the
-- person and the figures, because they are what he will actually see.

/** The money in the committee account, right now. One sum, one definition. */
create or replace function public.fund_balance()
returns numeric
language sql
stable
as $$
  select coalesce(sum(fund_delta), 0)::numeric(14,2) from public.ledger_entries;
$$;

/** What one member's stake in the fund is worth today. */
create or replace function public.member_equity(p_member_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fund_delta), 0)::numeric(14,2)
    from public.ledger_entries
   where member_id = p_member_id;
$$;

-- ---------------------------------------------------------------------------
-- Append-only
-- ---------------------------------------------------------------------------

/**
 * The ledger cannot be edited or deleted. A mistake is corrected by writing the
 * opposite entry, which leaves both rows visible.
 *
 * The single exception is stamping an entry as reversed, and only from null --
 * so a row can be cancelled once and never quietly re-cancelled or un-cancelled.
 */
create or replace function public.ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Ledger entries are never deleted. Reverse the entry instead -- the original stays on the record.';
  end if;

  if new.reversed_by_entry_id is not null and old.reversed_by_entry_id is null then
    -- Allow the stamp, and nothing else on the row to move with it.
    if (new.id, new.cycle_no, new.member_id, new.loan_id, new.entry_type,
        new.amount, new.entry_sign, new.entry_date, new.reverses_entry_id)
       is distinct from
       (old.id, old.cycle_no, old.member_id, old.loan_id, old.entry_type,
        old.amount, old.entry_sign, old.entry_date, old.reverses_entry_id)
    then
      raise exception 'A ledger entry cannot be changed while it is being reversed.';
    end if;
    return new;
  end if;

  raise exception
    'Ledger entries are never edited. Reverse this entry and record the right one.';
end;
$$;

create trigger ledger_no_update
  before update on public.ledger_entries
  for each row execute function public.ledger_is_append_only();

create trigger ledger_no_delete
  before delete on public.ledger_entries
  for each row execute function public.ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- What may be posted, and where
-- ---------------------------------------------------------------------------

create or replace function public.ledger_entry_is_valid()
returns trigger
language plpgsql
as $$
declare
  v_cycle_status text;
  v_member       record;
  v_loan         record;
  v_outstanding  numeric;
  v_original     record;
begin
  select status into v_cycle_status from public.cycles where cycle_no = new.cycle_no;
  if v_cycle_status = 'closed' then
    raise exception
      'Committee month % is closed. Reopen it first if this payment really belongs to that month.',
      new.cycle_no;
  end if;

  select * into v_member from public.members where id = new.member_id;
  if not v_member.is_active and new.entry_sign = 1 then
    raise exception
      '% has left the committee, so nothing new can be recorded against him.',
      v_member.full_name;
  end if;

  -- A reversal must match the entry it cancels, or it is not a reversal.
  if new.reverses_entry_id is not null then
    select * into v_original from public.ledger_entries where id = new.reverses_entry_id;
    if v_original is null then
      raise exception 'The entry being reversed no longer exists.';
    end if;
    if v_original.reversed_by_entry_id is not null then
      raise exception 'That entry has already been reversed.';
    end if;
    if v_original.entry_sign = -1 then
      raise exception 'A reversal cannot itself be reversed. Record the entry again instead.';
    end if;
    if (new.entry_type, new.amount, new.member_id, new.loan_id)
       is distinct from
       (v_original.entry_type, v_original.amount, v_original.member_id, v_original.loan_id)
    then
      raise exception 'A reversal must be for the same person, type and amount as the entry it cancels.';
    end if;
    return new;
  end if;

  if new.entry_type = 'repayment' then
    select * into v_loan from public.loan_positions where id = new.loan_id;
    if v_loan is null then
      raise exception 'That committee withdrawal could not be found.';
    end if;
    if v_loan.member_id <> new.member_id then
      raise exception 'That withdrawal belongs to somebody else. A repayment can only go against the withdrawer''s own committee.';
    end if;

    v_outstanding := v_loan.outstanding;
    if new.amount > v_outstanding then
      raise exception
        '% owes only Rs % on this committee withdrawal. Enter that or less -- anything more is money the committee has no claim on.',
        v_member.full_name,
        to_char(v_outstanding, 'FM999,999,999.99');
    end if;
  end if;

  return new;
end;
$$;

create trigger ledger_validate
  before insert on public.ledger_entries
  for each row execute function public.ledger_entry_is_valid();

-- ---------------------------------------------------------------------------
-- Keeping the loan's status honest
-- ---------------------------------------------------------------------------

/**
 * After anything touches a loan, restate whether it is finished. Derived from
 * the ledger, never from counting installments, so paying double for two months
 * closes it two months early with no further arithmetic anywhere.
 */
create or replace function public.refresh_loan_status()
returns trigger
language plpgsql
as $$
declare
  v_loan_id uuid := coalesce(new.loan_id, old.loan_id);
  v_pos     record;
begin
  if v_loan_id is null then
    return null;
  end if;

  select * into v_pos from public.loan_positions where id = v_loan_id;

  update public.loans
     set status = case
                    when v_pos.paid_out <= 0    then 'void'
                    when v_pos.outstanding <= 0 then 'settled'
                    else 'active'
                  end,
         settled_at = case when v_pos.outstanding <= 0 and v_pos.paid_out > 0
                           then coalesce(settled_at, now()) else null end
   where id = v_loan_id;

  return null;
end;
$$;

create trigger ledger_refresh_loan
  after insert on public.ledger_entries
  for each row execute function public.refresh_loan_status();

grant execute on function public.fund_balance, public.member_equity to app_user;
