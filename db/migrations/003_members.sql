-- 003  The ten people.
--
-- A member is not a user. Nine of the ten will never sign in to anything; they
-- exist here because money moves in their name. Keeping the two tables apart is
-- what lets Arshad hand out a read-only login without inventing a member, and
-- lets a member leave without deleting a login.

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null check (length(trim(full_name)) > 0),
  phone         text,
  joined_on     date        not null default current_date,
  left_on       date,
  is_active     boolean     not null default true,
  display_order int         not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),

  -- A member who has left has a date; one who has not, has not. Two fields that
  -- can disagree are two fields that eventually will.
  constraint members_left_state check (
    (is_active and left_on is null) or (not is_active and left_on is not null)
  ),
  constraint members_left_after_joined check (left_on is null or left_on >= joined_on)
);

create unique index members_name_idx on public.members (lower(trim(full_name)));
create index members_active_idx on public.members (is_active, display_order);

/** How many people are expected to pay in this month. Used by every projection. */
create or replace function public.active_member_count()
returns int
language sql
stable
as $$
  select count(*)::int from public.members where is_active;
$$;

grant select, insert, update on public.members to app_user;
grant execute on function public.active_member_count to app_user;
