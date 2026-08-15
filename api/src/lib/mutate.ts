import crypto from 'crypto';
import mysql from 'mysql2/promise';
import { provisionerPool } from '../db';
import { config } from '../config';

// Mutating cards (INSERT/UPDATE/DELETE/DDL) run untrusted SQL that CHANGES data, so they need
// an isolated work database per (user, card) — DESIGN §12.4.a/§12.5. Validation is on the FINAL
// STATE: after the learner's statement we run a HIDDEN verification query and compare its result.
//
// Each attempt resets the work DB from the versioned schema+seed first, so attempts are
// independent and idempotent (no accumulation, no PK clashes on retry, bounded to users x cards).

export type Permissions = 'dml' | 'ddl';

const DB_NAME_RE = /^ex_[a-f0-9]+$/;

export function workDbName(userId: string, cardSlug: string): string {
  const hash = crypto.createHash('sha256').update(`${userId}:${cardSlug}`).digest('hex').slice(0, 24);
  return `ex_${hash}`;
}

// Recreate the work DB from schema+seed. Idempotent. The executor already holds DML+DDL on the
// ex_ pattern (granted at account creation), so no per-DB grant is needed here.
async function provision(dbName: string, schemaSql: string, seedSql: string): Promise<void> {
  if (!DB_NAME_RE.test(dbName)) throw new Error('invalid work db name');
  const conn = await provisionerPool.getConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE \`${dbName}\``);
    await conn.query('SET NAMES utf8mb4');
    if (schemaSql.trim()) await conn.query(schemaSql);
    if (seedSql.trim()) await conn.query(seedSql);
  } finally {
    conn.release();
  }
}

export interface MutationRun {
  columns: string[];
  rows: unknown[][];
}

// Fresh executor connection targeting a work DB (the executor holds DML+DDL on the ex_ pattern).
function executorConn(dbName: string, multi: boolean) {
  return mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.execUser,
    password: config.db.execPassword,
    database: dbName,
    multipleStatements: multi,
    charset: 'utf8mb4',
    dateStrings: true,
    decimalNumbers: false,
  });
}

// Reset -> run learner SQL -> run hidden verification query, all serialized by a MySQL lock so
// two concurrent attempts on the same instance never corrupt it.
export async function runMutation(
  userId: string,
  cardSlug: string,
  opts: {
    schemaSql: string;
    seedSql: string;
    permissions: Permissions;
    learnerSql: string;
    verifySql: string;
    allowMultiStatement?: boolean;
  },
): Promise<MutationRun> {
  const dbName = workDbName(userId, cardSlug);
  const lockName = `reset:${dbName}`;

  const lockConn = await provisionerPool.getConnection();
  try {
    const [lockRows] = (await lockConn.query('SELECT GET_LOCK(?, 10) AS ok', [lockName])) as unknown as [
      Array<{ ok: number }>,
    ];
    if (!lockRows[0] || lockRows[0].ok !== 1) {
      throw new Error('could not acquire work-db lock');
    }
    try {
      await provision(dbName, opts.schemaSql, opts.seedSql);

      // Run the learner statement on its own executor connection, then CLOSE it. Any uncommitted
      // transaction rolls back on close — so a forgotten COMMIT is correctly NOT persisted.
      const exec = await executorConn(dbName, !!opts.allowMultiStatement);
      try {
        await exec.query(`SET SESSION max_execution_time = ${Number(config.queryTimeoutMs)}`);
        await exec.query({ sql: opts.learnerSql, timeout: config.queryTimeoutMs + 500 });
      } finally {
        await exec.end();
      }

      // Validate the PERSISTED final state on a SEPARATE connection (uncommitted changes are
      // invisible here — this is what makes COMMIT/ROLLBACK meaningful).
      const verify = await executorConn(dbName, false);
      try {
        const [rows, fields] = (await verify.query({ sql: opts.verifySql, rowsAsArray: true })) as unknown as [
          unknown,
          unknown,
        ];
        const columns = Array.isArray(fields) ? (fields as Array<{ name: string }>).map((f) => f.name) : [];
        const data: unknown[][] = Array.isArray(rows) ? (rows as unknown[][]) : [];
        return { columns, rows: data };
      } finally {
        await verify.end();
      }
    } finally {
      await lockConn.query('SELECT RELEASE_LOCK(?)', [lockName]);
    }
  } finally {
    lockConn.release();
  }
}

// Reset only (Réinitialiser button): rebuild the work DB from schema+seed.
export async function resetMutation(
  userId: string,
  cardSlug: string,
  opts: { schemaSql: string; seedSql: string; permissions: Permissions },
): Promise<void> {
  const dbName = workDbName(userId, cardSlug);
  const lockName = `reset:${dbName}`;
  const lockConn = await provisionerPool.getConnection();
  try {
    await lockConn.query('SELECT GET_LOCK(?, 10)', [lockName]);
    try {
      await provision(dbName, opts.schemaSql, opts.seedSql);
    } finally {
      await lockConn.query('SELECT RELEASE_LOCK(?)', [lockName]);
    }
  } finally {
    lockConn.release();
  }
}
