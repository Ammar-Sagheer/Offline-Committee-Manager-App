import "server-only";
import pg from "pg";

/**
 * The one place that talks to Postgres.
 *
 * In the web-app version of this structure there would be three Supabase
 * clients here. Offline there is no Supabase, no PostgREST and no GoTrue -- the
 * database is a child process of Electron on 127.0.0.1, and this file plus
 * auth.js replace all three.
 */

/* -------------------------------------------------------------------------
 * Type parsing
 *
 * The pg driver and a hosted Postgres reached over HTTP disagree about several
 * column types, silently, with no error on either side. Fix it once here rather
 * than teaching thirty call sites a second possible shape.
 * ---------------------------------------------------------------------- */

// A `date` is a calendar day with no time and no zone. Left alone, pg turns it
// into a JavaScript Date, which reintroduces midnight and timezone drift and
// leaves every <input type="date"> blank, because the browser only accepts
// YYYY-MM-DD. Keep the string. (timestamptz stays a Date -- that one really is
// an instant.)
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

// numeric and int8 come back as STRINGS by default, deliberately, to protect
// precision beyond what a JS number holds. That protection is worth nothing
// here and the cost is real: "124000" + 4000 is "1240004000", and it renders
// perfectly happily. Every amount in this app is rupees with two decimals and
// well under 2^53, so parsing to a number is exact.
//
// The arithmetic that matters does not happen in JavaScript anyway -- it
// happens in the PL/pgSQL functions these values come out of.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => (value === null ? null : Number(value)));

/* ---------------------------------------------------------------------- */

function createPool() {
  return new pg.Pool({
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? 55437),
    database: process.env.PGDATABASE ?? "committee",
    user: process.env.PGUSER ?? "app_user",
    password: process.env.PGPASSWORD,
    max: 8,
    idleTimeoutMillis: 30_000,
    // One laptop, one user. If a connection cannot be had in five seconds
    // something is wrong that waiting will not fix.
    connectionTimeoutMillis: 5_000,
  });
}

// Cached on globalThis so the dev server's hot reload does not leak a new pool
// on every edit until Postgres runs out of connections.
const globalForPool = globalThis;
export const pool = globalForPool.__committeePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForPool.__committeePool = pool;

/** A read. Returns rows. */
export async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

/** A read expected to return one row, or nothing. */
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/**
 * A write, inside a transaction, with the signed-in user's id visible to the
 * database for the length of it.
 *
 * `set_config(..., true)` is transaction-local, which is the whole point: a
 * pooled connection handed back cannot carry one request's identity into the
 * next one's. Every audit column and every SECURITY DEFINER check reads it
 * through current_uid().
 */
export async function withUser(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId) {
      await client.query("select set_config($1, $2, true)", ["app.current_user_id", userId]);
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Has the database been reached at all? Used by the first-run screens. */
export async function databaseIsReachable() {
  try {
    await query("select 1");
    return true;
  } catch {
    return false;
  }
}
