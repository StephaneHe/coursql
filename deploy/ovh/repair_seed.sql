-- Restaure les tables seed_* depuis leurs copies pristines seedref_*.
-- À exécuter avec le compte propriétaire de la base, hors requête apprenant.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM seed_books;
INSERT INTO seed_books SELECT * FROM seedref_books;
DELETE FROM seed_members;
INSERT INTO seed_members SELECT * FROM seedref_members;
DELETE FROM seed_loans;
INSERT INTO seed_loans SELECT * FROM seedref_loans;
DELETE FROM seed_fines;
INSERT INTO seed_fines SELECT * FROM seedref_fines;
DELETE FROM seed_employees;
INSERT INTO seed_employees SELECT * FROM seedref_employees;
SET FOREIGN_KEY_CHECKS=1;
