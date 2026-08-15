-- coursSQL — shared, READ-ONLY seed database for the "books" scenario (cards C4, C5).
-- Versioned name: seed_books_v1. All users share it; coursql_executor has SELECT only,
-- so no user can mutate it and no per-user copy is needed (DESIGN §12.4.a).

-- The MySQL entrypoint may load init files on a latin1 session; force utf8mb4 so accented
-- French data (é, è...) is stored correctly and not double-encoded.
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS seed_books_v1
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE seed_books_v1;

CREATE TABLE IF NOT EXISTS books (
  id     INT          NOT NULL,
  title  VARCHAR(80)  NOT NULL,
  author VARCHAR(80)  NULL,          -- NULL is meaningful (row 3 has no author)
  year   INT          NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Revealing dataset (DESIGN §12.6.a "data reveals the concept"):
--  - row 3 has a NULL author (IS NULL / IS NOT NULL).
--  - rows 2 and 4 are identical + author 'Antoine de Saint-Exupéry' appears 3x (2,4,6) -> DISTINCT.
--  - that author also has a 1931 book (row 6), so 'author = ASE' is NOT equivalent to 'year = 1943'
--    -> AND vs OR give different results.
--  - year 1943 exists (rows 2,4) so '< 1943' excludes them but '<= 1943' includes them.
--  - years 1875 and 1931 exist on the BETWEEN bounds -> inclusive bounds matter.
INSERT INTO books (id, title, author, year) VALUES
  (1, 'Les Misérables',   'Victor Hugo',                1862),
  (2, 'Le Petit Prince',  'Antoine de Saint-Exupéry',   1943),
  (3, 'Contes',           NULL,                         1875),
  (4, 'Le Petit Prince',  'Antoine de Saint-Exupéry',   1943),
  (5, 'Germinal',         'Émile Zola',                 1885),
  (6, 'Vol de Nuit',      'Antoine de Saint-Exupéry',   1931);

-- Second table for variety (NULL city, duplicate city 'Paris' for later DISTINCT/IN cards).
CREATE TABLE IF NOT EXISTS members (
  id     INT          NOT NULL,
  name   VARCHAR(60)  NOT NULL,
  city   VARCHAR(60)  NULL,          -- NULL = unknown city (Bruno, David)
  joined DATE         NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

INSERT INTO members (id, name, city, joined) VALUES
  (1, 'Alice', 'Paris', '2021-03-01'),
  (2, 'Bruno', NULL,    '2022-07-15'),
  (3, 'Chloé', 'Lyon',  '2021-11-20'),
  (4, 'David', NULL,    '2023-01-05'),
  (5, 'Emma',  'Paris', '2022-05-30');
