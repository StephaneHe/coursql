-- coursSQL 2.2.0 — migration idempotente : colonne de mot de passe (app_users.password_hash).
-- À appliquer sur la base OVH existante (compte propriétaire de la base). Rejouable sans effet.
-- Note : le renseignement initial (password = login) des comptes existants utilise password_hash()
-- et est donc effectué en PHP par le script de déploiement (impossible en SQL pur).

SET NAMES utf8mb4;

-- MySQL ne connaît pas « ADD COLUMN IF NOT EXISTS » : on garde via information_schema.
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'app_users' AND column_name = 'password_hash'
);
SET @ddl := IF(
  @has_col = 0,
  'ALTER TABLE app_users ADD COLUMN password_hash VARCHAR(255) NULL AFTER name_normalized',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
