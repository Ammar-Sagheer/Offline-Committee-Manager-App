import "server-only";

/**
 * Shared server-side logic. This module reads request cookies through auth.js,
 * so it can never enter a client bundle -- which is exactly why date-helpers.js
 * and format-helpers.js are separate modules that client components can import.
 */
export { getSessionUser, requireManager, asUser, asManager, anyUsersExist } from "./auth";

export const ROLES = { MANAGER: "manager", VIEWER: "viewer" };

/**
 * Turns a database error into something worth reading.
 *
 * Almost everything passes straight through: the triggers and functions in db/
 * migrations raise sentences aimed at Arshad, naming the person and the
 * figures, precisely so they can be shown as-is. This maps the handful that
 * surface as raw Postgres noise -- a constraint name has no voice of its own.
 */
export function describeError(error, fallback = "That could not be saved.") {
  if (!error) return fallback;
  const message = error.message ?? String(error);

  if (message.includes("ledger_one_payout_per_cycle")) {
    return "This month's committee has already been given to somebody. Reverse that first if it went to the wrong person.";
  }
  if (message.includes("ledger_one_contribution_per_member_per_cycle")) {
    return "That person is already marked paid for this month.";
  }
  if (message.includes("members_name_idx")) {
    return "There is already a member with that name.";
  }
  if (message.includes("users_username_lower_idx")) {
    return "That username is taken.";
  }
  if (message.includes("ECONNREFUSED") || message.includes("connect ETIMEDOUT")) {
    return "The app cannot reach its database. Close it and open it again.";
  }
  return message || fallback;
}

/** Builds a URL keeping the current query string and overriding part of it. */
export function hrefWith(pathname, current, overrides) {
  const params = new URLSearchParams(current ?? {});
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
