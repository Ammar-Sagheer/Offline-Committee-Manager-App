-- 004  Committee months.
--
-- The committee thinks in months, not dates: "the 13th committee", "who got
-- month 14". Money is therefore filed against a cycle number, and the calendar
-- date on an entry is only ever a note about when it physically happened. That
-- distinction matters because contributions arrive "at the end or the start of
-- the next month" -- a payment made on the 2nd may well belong to the month
-- that just ended, and the person recording it knows which, the calendar does
-- not.

create table public.cycles (
  cycle_no     int         primary key check (cycle_no >= 1),
  period_month date        not null unique,
  status       text        not null default 'open' check (status in ('open', 'closed')),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  closed_by    uuid references public.users (id),
  notes        text,

  -- A cycle is a whole month, always addressed by its first day.
  constraint cycles_month_is_first_day check (period_month = date_trunc('month', period_month)::date),
  constraint cycles_closed_state check (
    (status = 'open'   and closed_at is null) or
    (status = 'closed' and closed_at is not null)
  )
);

comment on table public.cycles is
  'One row per committee month. cycle_no 1 is the first month money was collected; it counts up forever until the members resolve the committee.';

/** The cycle everything currently posts into: the highest open one. */
create or replace function public.current_cycle_no()
returns int
language sql
stable
as $$
  select max(cycle_no) from public.cycles where status = 'open';
$$;

/**
 * Open the next month. Idempotent -- calling it twice in a month is a no-op
 * rather than an error, because it is called from a screen someone may reload.
 */
create or replace function public.open_next_cycle()
returns int
language plpgsql
as $$
declare
  v_last  record;
  v_next  int;
  v_month date;
begin
  select * into v_last from public.cycles order by cycle_no desc limit 1;

  if v_last is null then
    raise exception 'The committee has not been set up yet.';
  end if;

  if v_last.status = 'open' then
    return v_last.cycle_no;
  end if;

  v_next  := v_last.cycle_no + 1;
  v_month := (v_last.period_month + interval '1 month')::date;

  insert into public.cycles (cycle_no, period_month) values (v_next, v_month);
  return v_next;
end;
$$;

/**
 * Lock a month so nothing else posts into it, and open the next one.
 *
 * Closing is allowed with contributions still missing -- people genuinely do
 * pay late, and a database that refuses to move on is a database someone works
 * around. What it will not do is close silently: the caller is handed the list
 * of who had not paid, and the app shows it before asking.
 */
create or replace function public.close_cycle(p_cycle_no int)
returns int
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.cycles where cycle_no = p_cycle_no;

  if v_status is null then
    raise exception 'There is no committee month numbered %.', p_cycle_no;
  end if;
  if v_status = 'closed' then
    raise exception 'Committee month % is already closed.', p_cycle_no;
  end if;
  if exists (select 1 from public.cycles where cycle_no < p_cycle_no and status = 'open') then
    raise exception 'Close the earlier months first -- month % is still open.',
      (select min(cycle_no) from public.cycles where cycle_no < p_cycle_no and status = 'open');
  end if;

  update public.cycles
     set status = 'closed', closed_at = now(), closed_by = public.current_uid()
   where cycle_no = p_cycle_no;

  return public.open_next_cycle();
end;
$$;

/** Unlock a month, so a late payment can still be filed where it belongs. */
create or replace function public.reopen_cycle(p_cycle_no int)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public.cycles where cycle_no = p_cycle_no and status = 'closed') then
    raise exception 'Committee month % is not a closed month.', p_cycle_no;
  end if;

  update public.cycles
     set status = 'open', closed_at = null, closed_by = null
   where cycle_no = p_cycle_no;
end;
$$;

grant select, insert, update on public.cycles to app_user;
grant execute on function
  public.current_cycle_no, public.open_next_cycle,
  public.close_cycle, public.reopen_cycle
to app_user;
