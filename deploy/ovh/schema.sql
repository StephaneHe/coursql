-- coursSQL 2.2.0 — schéma mono-base pour OVH mutualisé.
-- Généré par deploy/ovh/build-schema.mjs depuis db/init/*.sql.
-- À importer dans la base existante : aucun CREATE/DROP DATABASE, USE ou CREATE USER.

SET NAMES utf8mb4;

-- Tables applicatives
CREATE TABLE IF NOT EXISTS app_users (
  id              CHAR(36)     NOT NULL,
  display_name    VARCHAR(40)  NOT NULL,
  name_normalized VARCHAR(40)  NOT NULL,
  password_hash   VARCHAR(255) NULL,
  created_at      DATETIME     NOT NULL,
  last_active_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_name_normalized (name_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_progress (
  user_id           CHAR(36)    NOT NULL,
  card_slug         VARCHAR(16) NOT NULL,
  status            ENUM('available','in_progress','validated','validated_after_hint') NOT NULL DEFAULT 'in_progress',
  attempts_count    INT         NOT NULL DEFAULT 0,
  hint_used         TINYINT(1)  NOT NULL DEFAULT 0,
  solution_viewed   TINYINT(1)  NOT NULL DEFAULT 0,
  first_validated_at DATETIME   NULL,
  last_attempt_at   DATETIME    NULL,
  PRIMARY KEY (user_id, card_slug),
  KEY idx_app_progress_user_status (user_id, status),
  CONSTRAINT fk_app_progress_user FOREIGN KEY (user_id) REFERENCES app_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_attempts (
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
  KEY idx_app_attempts_user_card (user_id, card_slug, submitted_at),
  CONSTRAINT fk_app_attempts_user FOREIGN KEY (user_id) REFERENCES app_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_locks (
  lock_key    VARCHAR(80) NOT NULL,
  holder      CHAR(64)    NOT NULL,
  acquired_at DATETIME    NOT NULL,
  PRIMARY KEY (lock_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_rate_limit (
  bucket_key   VARCHAR(160) NOT NULL,
  window_start DATETIME     NOT NULL,
  hits         INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key),
  KEY idx_app_rate_limit_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Données pédagogiques partagées
CREATE TABLE IF NOT EXISTS seed_books (
  id     INT          NOT NULL,
  title  VARCHAR(80)  NOT NULL,
  author VARCHAR(80)  NULL,          -- NULL is meaningful (row 3 has no author)
  year   INT          NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO seed_books (id, title, author, year) VALUES
  (1, 'Les Misérables',   'Victor Hugo',                1862),
  (2, 'Le Petit Prince',  'Antoine de Saint-Exupéry',   1943),
  (3, 'Contes',           NULL,                         1875),
  (4, 'Courrier Sud',     'Antoine de Saint-Exupéry',   1943),
  (5, 'Germinal',         'Émile Zola',                 1885),
  (6, 'Vol de Nuit',      'Antoine de Saint-Exupéry',   1931);

CREATE TABLE IF NOT EXISTS seed_members (
  id     INT          NOT NULL,
  name   VARCHAR(60)  NOT NULL,
  city   VARCHAR(60)  NULL,          -- NULL = unknown city (Bruno, David)
  joined DATE         NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO seed_members (id, name, city, joined) VALUES
  (1, 'Alice', 'Paris', '2021-03-01'),
  (2, 'Bruno', NULL,    '2022-07-15'),
  (3, 'Chloé', 'Lyon',  '2021-11-20'),
  (4, 'David', NULL,    '2023-01-05'),
  (5, 'Emma',  'Paris', '2022-05-30');

CREATE TABLE IF NOT EXISTS seed_loans (
  id        INT  NOT NULL,
  member_id INT  NOT NULL,
  book_id   INT  NOT NULL,
  loan_date DATE NOT NULL,
  returned  TINYINT(1) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_seed_loans_member (member_id),
  KEY idx_seed_loans_book (book_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO seed_loans (id, member_id, book_id, loan_date, returned) VALUES
  (1, 1, 1, '2023-01-10', 1),
  (2, 1, 2, '2023-02-15', 0),
  (3, 2, 2, '2023-03-01', 1),
  (4, 3, 5, '2023-03-20', 0),
  (5, 5, 1, '2023-04-05', 1);

CREATE TABLE IF NOT EXISTS seed_fines (
  id        INT NOT NULL,
  member_id INT NOT NULL,
  amount    DECIMAL(6,2) NOT NULL,
  paid      TINYINT(1) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO seed_fines (id, member_id, amount, paid) VALUES
  (1, 1, 5.50, 1),
  (2, 1, 2.00, 0),
  (3, 3, 10.00, 0),
  (4, 2, 3.25, 1);

CREATE TABLE IF NOT EXISTS seed_employees (
  id         INT NOT NULL,
  name       VARCHAR(60) NOT NULL,
  manager_id INT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO seed_employees (id, name, manager_id) VALUES
  (1, 'Diane', NULL),
  (2, 'Karim', 1),
  (3, 'Léa',   1),
  (4, 'Tom',   2);

-- Copies pristines, jamais exposées aux requêtes apprenant
CREATE TABLE IF NOT EXISTS seedref_books LIKE seed_books;
INSERT INTO seedref_books SELECT * FROM seed_books;

CREATE TABLE IF NOT EXISTS seedref_members LIKE seed_members;
INSERT INTO seedref_members SELECT * FROM seed_members;

CREATE TABLE IF NOT EXISTS seedref_loans LIKE seed_loans;
INSERT INTO seedref_loans SELECT * FROM seed_loans;

CREATE TABLE IF NOT EXISTS seedref_fines LIKE seed_fines;
INSERT INTO seedref_fines SELECT * FROM seed_fines;

CREATE TABLE IF NOT EXISTS seedref_employees LIKE seed_employees;
INSERT INTO seedref_employees SELECT * FROM seed_employees;
