-- coursSQL 2.1.0 — migration idempotente : table du limiteur de débit (app_rate_limit).
-- À appliquer sur la base OVH existante (le compte propriétaire de la base).
-- Aucun CREATE/DROP DATABASE, USE ni compte MySQL. Rejouable sans effet de bord.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS app_rate_limit (
  bucket_key   VARCHAR(160) NOT NULL,
  window_start DATETIME     NOT NULL,
  hits         INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key),
  KEY idx_app_rate_limit_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
