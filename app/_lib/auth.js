import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { query, queryOne, withUser } from "./db";

/**
 * Signing in, offline.
 *
 * There is no hosted auth service to lean on, so the four things one provides
 * come from here instead: the identity table is `users`, the password hashing
 * is pgcrypto inside Postgres, the token is a signed httpOnly cookie, and the
 * "who is asking" that the database sees is a session variable set per
 * transaction by withUser().
 *
 * Passwords are hashed and checked in SQL on purpose. The hash never leaves the
 * database, and there is no native npm module to rebuild against Electron's ABI
 * when the app is packaged -- which is a class of pain best not discovered late.
 */

const sessionOptions = {
  // Generated per install on first run and kept in the app-data folder beside
  // the database. Nothing secret ships in the installer.
  password: process.env.SESSION_SECRET ?? "development-only-secret-at-least-32-characters",
  cookieName: "committee_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    // Served over plain http on 127.0.0.1 by a child process of Electron.
    // A Secure cookie would simply never be stored.
    secure: false,
    maxAge: 60 * 60 * 12,
  },
};

export async function getSession() {
  return getIronSession(await cookies(), sessionOptions);
}

/** The signed-in user, or null. Cheap: it reads the cookie, not the database. */
export async function getSessionUser() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  return session.user;
}

/** Does this install have anybody to sign in as yet? */
export async function anyUsersExist() {
  // Asked through a narrow SECURITY DEFINER function rather than by reading the
  // users table: the login page needs this answer while signed out, and
  // widening a policy to get it would be a bigger hole than the boolean is
  // worth.
  const row = await queryOne("select any_users_exist() as exists");
  return Boolean(row?.exists);
}

export async function signIn(username, password) {
  const rows = await query("select * from authenticate($1, $2)", [username, password]);
  const user = rows[0];
  if (!user) return null;

  const session = await getSession();
  session.user = { id: user.id, username: user.username, name: user.full_name, role: user.role };
  await session.save();
  return session.user;
}

export async function signOut() {
  const session = await getSession();
  session.destroy();
}

/**
 * Run something as the signed-in user, refusing if nobody is.
 *
 * Every write in actions.js goes through this or requireManager below, so the
 * check is structural rather than something each action has to remember.
 */
export async function asUser(fn) {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in first.");
  return withUser(user.id, (client) => fn(client, user));
}

export async function requireManager() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in first.");
  if (user.role !== "manager") {
    throw new Error("Only the committee manager can change the books. You are signed in as a viewer.");
  }
  return user;
}

/** Same as asUser, but for the writes only the manager may make. */
export async function asManager(fn) {
  const user = await requireManager();
  return withUser(user.id, (client) => fn(client, user));
}
