-- coursSQL — three least-privilege MySQL accounts (DESIGN §12.9).
-- DEV passwords: keep them in sync with .env / docker-compose. Change for any real deployment.
-- The untrusted learner SQL is executed ONLY by coursql_executor, which can only SELECT
-- on shared read-only seed databases (seed_*). It has no access to coursql_app.

-- 1) Application account: full DML on the app DB only.
CREATE USER IF NOT EXISTS 'coursql_app'@'%' IDENTIFIED BY 'coursql_app_pw'
  WITH MAX_USER_CONNECTIONS 50;
GRANT SELECT, INSERT, UPDATE, DELETE ON `coursql_app`.* TO 'coursql_app'@'%';

-- 2) Provisioner: lifecycle of per-user mutating work databases (ex_*). Not used by the
--    C1->C5 slice (read-only), created now for the next slice. Never receives learner SQL.
CREATE USER IF NOT EXISTS 'coursql_provisioner'@'%' IDENTIFIED BY 'coursql_prov_pw';
-- Holds (WITH GRANT OPTION) every privilege it may hand to the executor on a work DB,
-- so it can grant DML (SELECT/INSERT/UPDATE/DELETE) and DDL (CREATE/DROP/ALTER/INDEX/REFERENCES).
GRANT CREATE, DROP, GRANT OPTION, SELECT, INSERT, UPDATE, DELETE, INDEX, ALTER, REFERENCES
  ON `ex\_%`.* TO 'coursql_provisioner'@'%';

-- 3) Executor: runs untrusted learner SQL. SELECT-only on shared seed databases.
--    No global privileges, no FILE, no access to coursql_app or mysql.
CREATE USER IF NOT EXISTS 'coursql_executor'@'%' IDENTIFIED BY 'coursql_exec_pw'
  WITH MAX_USER_CONNECTIONS 20 MAX_QUERIES_PER_HOUR 20000;
-- Read-only on shared seed databases (SELECT cards).
GRANT SELECT ON `seed\_%`.* TO 'coursql_executor'@'%';
-- DML+DDL on per-user work databases (mutating cards). Scoped to the ex_ prefix; work-DB names
-- are unguessable sha256 hashes of (user_id, card) and the server only ever points the executor
-- at the current user's own DB. The critical boundary — no access to coursql_app or other
-- databases — still holds. (Per-DB grants are a future hardening; MySQL refuses pattern-scoped
-- GRANTs from the provisioner, so we grant the pattern once here instead.)
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON `ex\_%`.* TO 'coursql_executor'@'%';

FLUSH PRIVILEGES;
