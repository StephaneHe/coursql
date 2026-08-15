-- coursSQL — application database schema (coursql_app).
-- Runs once on a fresh MySQL data directory (docker-entrypoint-initdb.d), as root.
-- Card/exercise CONTENT lives in versioned files (api/src/content), not here (see DESIGN §12.6).
-- This DB holds only users, sessions, per-card progress and the attempts log.

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS coursql_app
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE coursql_app;

-- Learners. Internal id is independent from the display name (never derived from it).
CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36)     NOT NULL,
  display_name    VARCHAR(40)  NOT NULL,
  name_normalized VARCHAR(40)  NOT NULL,
  created_at      DATETIME     NOT NULL,
  last_active_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_name_normalized (name_normalized)
) ENGINE=InnoDB;

-- Opaque, revocable sessions. The cookie carries the id (signed); it is NOT the secret itself.
CREATE TABLE IF NOT EXISTS user_sessions (
  id         CHAR(64)  NOT NULL,
  user_id    CHAR(36)  NOT NULL,
  created_at DATETIME  NOT NULL,
  expires_at DATETIME  NOT NULL,
  revoked_at DATETIME  NULL,
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

-- Progress is carried by the CARD (not by each exercise). One row per (user, card).
CREATE TABLE IF NOT EXISTS user_progress (
  user_id           CHAR(36)    NOT NULL,
  card_slug         VARCHAR(16) NOT NULL,
  status            ENUM('available','in_progress','validated','validated_after_hint') NOT NULL DEFAULT 'in_progress',
  attempts_count    INT         NOT NULL DEFAULT 0,
  hint_used         TINYINT(1)  NOT NULL DEFAULT 0,
  solution_viewed   TINYINT(1)  NOT NULL DEFAULT 0,
  first_validated_at DATETIME   NULL,
  last_attempt_at   DATETIME    NULL,
  PRIMARY KEY (user_id, card_slug),
  KEY idx_progress_user_status (user_id, status),
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

-- Append-only attempts log. We ARCHIVE the submitted text (decision 1.2.0).
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id             BIGINT      NOT NULL AUTO_INCREMENT,
  user_id        CHAR(36)    NOT NULL,
  card_slug      VARCHAR(16) NOT NULL,
  exercise_slug  VARCHAR(64) NOT NULL,
  submitted_sql  TEXT        NOT NULL,
  outcome        ENUM('pass','fail','error','timeout','blocked') NOT NULL,
  duration_ms    INT         NULL,
  error_category VARCHAR(64) NULL,
  submitted_at   DATETIME    NOT NULL,
  PRIMARY KEY (id),
  KEY idx_attempts_user_card (user_id, card_slug, submitted_at),
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;
