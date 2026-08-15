import mysql from 'mysql2/promise';
import { config } from './config';

// Application pool: full DML on coursql_app only. Used for users/sessions/progress/attempts.
// All queries through this pool are parameterized (OWASP Query Parameterization).
export const appPool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.appUser,
  password: config.db.appPassword,
  database: config.db.appName,
  connectionLimit: 10,
  multipleStatements: false,
  charset: 'utf8mb4',
  waitForConnections: true,
});

// Executor pool: runs UNTRUSTED learner SQL. SELECT-only on seed_* databases (enforced by
// MySQL grants, not by the app). No default database — the target seed DB is selected per query.
export const executorPool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.execUser,
  password: config.db.execPassword,
  connectionLimit: 10,
  multipleStatements: false,
  charset: 'utf8mb4',
  dateStrings: true,     // keep DATE/DATETIME as strings for deterministic comparison
  decimalNumbers: false, // keep DECIMAL as string, exact (no float rounding)
  waitForConnections: true,
});

// Provisioner pool: creates/resets per-user work databases (ex_*) for mutating cards.
// It runs ONLY our versioned schema/seed SQL (never learner SQL), so multipleStatements is
// enabled to load multi-statement schema/seed files.
export const provisionerPool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.provUser,
  password: config.db.provPassword,
  connectionLimit: 4,
  multipleStatements: true,
  charset: 'utf8mb4',
  waitForConnections: true,
});

export async function pingDatabases(): Promise<void> {
  const c1 = await appPool.getConnection();
  try { await c1.query('SELECT 1'); } finally { c1.release(); }
  const c2 = await executorPool.getConnection();
  try { await c2.query('SELECT 1'); } finally { c2.release(); }
  const c3 = await provisionerPool.getConnection();
  try { await c3.query('SELECT 1'); } finally { c3.release(); }
}
