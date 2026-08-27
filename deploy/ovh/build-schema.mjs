/**
 * Construit le dump mono-base OVH depuis les SQL historiques versionnés.
 * Aucun CREATE/DROP DATABASE, USE ou compte MySQL n'est émis dans le livrable.
 *
 * Usage : node deploy/ovh/build-schema.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const appSource = fs.readFileSync(path.join(root, 'db', 'init', '01-schema.sql'), 'utf8');
const seedSource = fs.readFileSync(path.join(root, 'db', 'init', '03-seed-books.sql'), 'utf8');

function createTable(source, logicalName) {
  const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS ${logicalName} \\([\\s\\S]*?\\n\\) ENGINE=InnoDB;`, 'i');
  const match = source.match(pattern);
  if (!match) throw new Error(`CREATE TABLE introuvable pour ${logicalName}`);
  return match[0];
}

function insertRows(source, logicalName) {
  const pattern = new RegExp(`INSERT INTO ${logicalName} \\([\\s\\S]*?;`, 'i');
  const match = source.match(pattern);
  if (!match) throw new Error(`INSERT introuvable pour ${logicalName}`);
  return match[0];
}

function qualifyTable(sql) {
  return sql.replace(
    /\) ENGINE=InnoDB;/g,
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;',
  );
}

function appTable(sourceName, physicalName) {
  let sql = createTable(appSource, sourceName)
    .replace(new RegExp(`CREATE TABLE IF NOT EXISTS ${sourceName}\\b`, 'i'), `CREATE TABLE IF NOT EXISTS ${physicalName}`)
    .replace(/\bREFERENCES users\b/g, 'REFERENCES app_users');
  const renames = {
    uq_users_name_normalized: 'uq_app_users_name_normalized',
    idx_progress_user_status: 'idx_app_progress_user_status',
    idx_attempts_user_card: 'idx_app_attempts_user_card',
    fk_progress_user: 'fk_app_progress_user',
    fk_attempts_user: 'fk_app_attempts_user',
  };
  for (const [before, after] of Object.entries(renames)) sql = sql.replaceAll(before, after);
  return qualifyTable(sql);
}

function seedTable(logicalName) {
  const physicalName = `seed_${logicalName}`;
  const create = qualifyTable(
    createTable(seedSource, logicalName)
      .replace(new RegExp(`CREATE TABLE IF NOT EXISTS ${logicalName}\\b`, 'i'), `CREATE TABLE IF NOT EXISTS ${physicalName}`)
      .replaceAll(`idx_${logicalName}_`, `idx_seed_${logicalName}_`),
  );
  const insert = insertRows(seedSource, logicalName)
    .replace(new RegExp(`INSERT INTO ${logicalName}\\b`, 'i'), `INSERT INTO ${physicalName}`);
  return `${create}\n\n${insert}`;
}

const seedNames = ['books', 'members', 'loans', 'fines', 'employees'];
const appLocks = `CREATE TABLE IF NOT EXISTS app_locks (
  lock_key    VARCHAR(80) NOT NULL,
  holder      CHAR(64)    NOT NULL,
  acquired_at DATETIME    NOT NULL,
  PRIMARY KEY (lock_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;

const appRateLimit = `CREATE TABLE IF NOT EXISTS app_rate_limit (
  bucket_key   VARCHAR(160) NOT NULL,
  window_start DATETIME     NOT NULL,
  hits         INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key),
  KEY idx_app_rate_limit_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;

const referenceCopies = seedNames.map((name) => `CREATE TABLE IF NOT EXISTS seedref_${name} LIKE seed_${name};
INSERT INTO seedref_${name} SELECT * FROM seed_${name};`).join('\n\n');

const schema = `-- coursSQL 2.2.0 — schéma mono-base pour OVH mutualisé.
-- Généré par deploy/ovh/build-schema.mjs depuis db/init/*.sql.
-- À importer dans la base existante : aucun CREATE/DROP DATABASE, USE ou CREATE USER.

SET NAMES utf8mb4;

-- Tables applicatives
${appTable('users', 'app_users')}

${appTable('user_progress', 'app_progress')}

${appTable('exercise_attempts', 'app_attempts')}

${appLocks}

${appRateLimit}

-- Données pédagogiques partagées
${seedNames.map(seedTable).join('\n\n')}

-- Copies pristines, jamais exposées aux requêtes apprenant
${referenceCopies}
`;

const repair = `-- Restaure les tables seed_* depuis leurs copies pristines seedref_*.
-- À exécuter avec le compte propriétaire de la base, hors requête apprenant.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
${seedNames.map((name) => `DELETE FROM seed_${name};\nINSERT INTO seed_${name} SELECT * FROM seedref_${name};`).join('\n')}
SET FOREIGN_KEY_CHECKS=1;
`;

const schemaPath = path.join(here, 'schema.sql');
const repairPath = path.join(here, 'repair_seed.sql');
fs.writeFileSync(schemaPath, schema, 'utf8');
fs.writeFileSync(repairPath, repair, 'utf8');
console.log(`Dump généré : ${schemaPath}`);
console.log(`Réparation seeds : ${repairPath}`);
