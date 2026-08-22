-- 001  Identity, and the session variable every audit column reads.
--
-- There is no Supabase Auth here and no `auth.users`. This table IS the
-- identity table: email/username plus a password hash. Hashing happens inside
-- Postgres with pgcrypto, deliberately, for two reasons: the hash never leaves
-- the database, and there is no native npm module (bcrypt) to rebuild against
-- Electron's ABI at packaging time. That second reason is the one that bites.
--
-- RLS is NOT used anywhere in this schema. That is a decision, not an
-- oversight: this app runs on one laptop, as one operating-system user, with
-- the server bound to 127.0.0.1. Row-level security would protect nothing that
-- the login screen and the file-system permissions do not already protect, and
-- it would make every reporting function harder to read. Role checks live in
-- `helpers.js` and in the SECURITY DEFINER functions below.

create extension if not exists pgcrypto;

-- The restricted role the Next.js server connects as. It is created here (with
-- a placeholder) so the GRANTs below have something to name; bootstrap-db.js
-- sets the real, per-install password afterwards and never writes it to a file
-- that ships.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'placeholder-replaced-on-first-run';
  end if;
end
$$;

create table public.users (
  id             uuid primary key default gen_random_uuid(),
  username       text        not null unique,
  full_name      text        not null,
  password_hash  text        not null,
  role           text        not null default 'viewer'
                             check (role in ('manager', 'viewer')),
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);

comment on table public.users is
  'Who may open this app. manager = Muhammad Arshad, full control. viewer = read-only, for a member looking at the books on the same laptop.';

-- Usernames are compared case-insensitively: nobody should be locked out for
-- typing "Arshad" instead of "arshad" at 11pm.
create unique index users_username_lower_idx on public.users (lower(username));

/**
 * Who is making this request. Set per transaction by the app (see withUser in
 * app/_lib/db.js) and read by the audit defaults on the ledger.
 *
 * Returns null rather than raising when unset, so a background or migration
 * context does not have to pretend to be somebody.
 */
create or replace function public.current_uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

/**
 * Is this a brand new install with nobody to sign in as?
 *
 * SECURITY DEFINER and deliberately narrow: the login page needs this answer
 * while signed out, and answering it by letting a signed-out request read the
 * users table would be a much bigger hole than the boolean is worth.
 */
create or replace function public.any_users_exist()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.users where is_active);
$$;

/**
 * Check a password. Returns the user row on success, no rows on failure.
 *
 * crypt() with the stored hash as the salt is pgcrypto's documented way to
 * verify: it re-hashes the candidate with the same algorithm and cost, and the
 * comparison is on the full hash string.
 */
create or replace function public.authenticate(p_username text, p_password text)
returns table (id uuid, username text, full_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.users u
     set last_login_at = now()
   where lower(u.username) = lower(trim(p_username))
     and u.is_active
     and u.password_hash = crypt(p_password, u.password_hash)
  returning u.id, u.username, u.full_name, u.role;
end;
$$;

/**
 * Create a login. The FIRST account an install ever creates is forced to be a
 * manager -- an install whose only account is read-only is a bricked install,
 * and it is a very easy mistake to make on the setup screen.
 */
create or replace function public.create_user(
  p_username  text,
  p_full_name text,
  p_password  text,
  p_role      text default 'viewer'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_role text := p_role;
begin
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'The password needs at least 6 characters.';
  end if;
  if length(trim(coalesce(p_username, ''))) < 3 then
    raise exception 'The username needs at least 3 characters.';
  end if;

  if not public.any_users_exist() then
    v_role := 'manager';
  end if;

  insert into public.users (username, full_name, password_hash, role)
  values (
    trim(p_username),
    trim(p_full_name),
    crypt(p_password, gen_salt('bf')),
    v_role
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'There is already a login called "%". Pick another username.', trim(p_username);
end;
$$;

/**
 * Change a password, proving the old one first. The app never sees either hash.
 */
create or replace function public.change_password(
  p_user_id      uuid,
  p_old_password text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'The new password needs at least 6 characters.';
  end if;

  if not exists (
    select 1 from public.users
     where id = p_user_id
       and password_hash = crypt(p_old_password, password_hash)
  ) then
    raise exception 'The current password is not right.';
  end if;

  update public.users
     set password_hash = crypt(p_new_password, gen_salt('bf'))
   where id = p_user_id;
end;
$$;

/**
 * Reset someone else's password. Manager-only; enforced by the caller AND by
 * the check here, so a stray call from anywhere cannot do it.
 */
create or replace function public.reset_password(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'The new password needs at least 6 characters.';
  end if;
  if not exists (
    select 1 from public.users where id = public.current_uid() and role = 'manager'
  ) then
    raise exception 'Only the committee manager can reset another person''s password.';
  end if;

  update public.users
     set password_hash = crypt(p_new_password, gen_salt('bf'))
   where id = p_user_id;
end;
$$;

grant usage on schema public to app_user;
grant select, insert, update on public.users to app_user;
grant execute on function
  public.current_uid,
  public.any_users_exist,
  public.authenticate,
  public.create_user,
  public.change_password,
  public.reset_password
to app_user;

-- The password hash must never be selectable by the application role: every
-- path that needs it goes through the SECURITY DEFINER functions above.
revoke select (password_hash) on public.users from app_user;
