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
GRANT CREATE, DROP, GRANT OPTION, SELECT, INSERT, INDEX, ALTER, REFERENCES
  ON `ex\_%`.* TO 'coursql_provisioner'@'%';

-- 3) Executor: runs untrusted learner SQL. SELECT-only on shared seed databases.
--    No global privileges, no FILE, no access to coursql_app or mysql.
CREATE USER IF NOT EXISTS 'coursql_executor'@'%' IDENTIFIED BY 'coursql_exec_pw'
  WITH MAX_USER_CONNECTIONS 20 MAX_QUERIES_PER_HOUR 20000;
GRANT SELECT ON `seed\_%`.* TO 'coursql_executor'@'%';

FLUSH PRIVILEGES;
