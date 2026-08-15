import { executorPool } from '../db';
import { config } from '../config';

// Untrusted-SQL execution guards (DESIGN §12.6/§12.7). The learner's SQL only ever reaches
// the executor pool (SELECT-only on seed_* by grant). We add app-side guards on top.

const DB_NAME_RE = /^(seed|ex)_[a-z0-9_]+$/;

export type PreflightResult =
  | { ok: true; clean: string }
  | { ok: false; messageFr: string };

// One statement only, bounded length. Rejects internal ';' (multi-statements are also
// disabled at the driver level, this is a friendly early check).
export function preflightSql(sql: string): PreflightResult {
  const trimmed = sql.trim();
  if (!trimmed) return { ok: false, messageFr: "Écris une requête avant d'exécuter." };
  if (trimmed.length > config.maxSqlLength) {
    return { ok: false, messageFr: `Requête trop longue (maximum ${config.maxSqlLength} caractères).` };
  }
  const noTrailing = trimmed.replace(/;\s*$/, '');
  if (noTrailing.includes(';')) {
    return { ok: false, messageFr: "Une seule instruction SQL à la fois (retire les points-virgules internes)." };
  }
  return { ok: true, clean: noTrailing };
}

export interface RawResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

// Runs a read-only query against a seed database. The default schema is set per call via USE,
// so pooled connections never leak a database across borrowers.
export async function runReadOnly(dbName: string, sql: string): Promise<RawResult> {
  if (!DB_NAME_RE.test(dbName)) throw new Error('invalid db name');
  const conn = await executorPool.getConnection();
  try {
    await conn.query('USE `' + dbName + '`');
    await conn.query('SET SESSION max_execution_time = ' + Number(config.queryTimeoutMs));
    const [rows, fields] = (await conn.query({
      sql,
      rowsAsArray: true,
      timeout: config.queryTimeoutMs + 500,
    })) as unknown as [unknown, unknown];

    const columns = Array.isArray(fields)
      ? (fields as Array<{ name: string }>).map((f) => f.name)
      : [];
    let data: unknown[][] = Array.isArray(rows) ? (rows as unknown[][]) : [];
    let truncated = false;
    if (data.length > config.maxRowsReturned) {
      data = data.slice(0, config.maxRowsReturned);
      truncated = true;
    }
    return { columns, rows: data, truncated };
  } finally {
    conn.release();
  }
}
