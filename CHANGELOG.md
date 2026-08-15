# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versionnage [SemVer](https://semver.org/lang/fr/).

## [1.4.0] - 2026-08-15

### Added
- **Contenu C6→C13** (8 cartes) : C6 alias `AS` ; C7 `WHERE` + `=` ; C8 comparaisons `<,>,<=,>=,<>` ; C9 `AND` ; C10 `OR` ; C11 `NOT` + parenthèses ; C12 `IS NULL` ; C13 `IS NOT NULL`. Modules M2→M5. Chaque carte SELECT validée par résultat, gating bienveillant, zone prérequis, indices + solution.
- **Table seed `members`** (ville NULL, doublon « Paris ») ajoutée à `seed_books_v1` pour varier les exercices (et préparer DISTINCT/IN/tri à venir).
- **Règle d'authoring « exercice ≠ exemple »** documentée (DESIGN §12.6.a) + **garde automatique** au démarrage (`assertAuthoringRules`) qui refuse toute carte dont la solution gating est identique à son exemple.

### Fixed
- **Carte C4** : l'exercice était la copie exacte de l'exemple (`SELECT * FROM books;`). Désormais l'exemple porte sur `books` et l'exercice sur `members` (même notion, requête différente).
- **Menu mobile** : le menu de progression s'affiche maintenant en **overlay drawer** (position fixe à droite, scrollable, backdrop cliquable + bouton ✕ de fermeture) au lieu d'être poussé sous le contenu.

## [1.3.0] - 2026-08-15

### Fixed
- **Page vide après connexion (bug bloquant)** : le cookie de session était émis avec l'attribut **`Secure`** (car `NODE_ENV=production`). Sur du **HTTP** (`http://localhost:8080`, réseau the private network privé), les navigateurs **refusent de stocker un cookie Secure** → le client n'était jamais authentifié → `/api/progress` renvoyait `401` → ni cartes ni menu. Le smoke-test curl ne l'avait pas vu (curl ignore la contrainte). Correctif : attribut `Secure` **configurable** via `COOKIE_SECURE` (défaut `false` ici ; passer `true` uniquement derrière HTTPS/Nginx). Robustesse client : état d'erreur affiché au lieu d'une page blanche.

### Added
- **Page d'accueil = sélecteur de comptes en cartes** : nouvel endpoint public `GET /api/accounts` (liste `display_name` + id interne, **jamais de secret**) ; l'accueil affiche une **grille de cartes-comptes cliquables** (clic = ouverture de session par nom, sans mot de passe, §7) + une carte **« ＋ Nouveau profil »**.

## [1.2.1] - 2026-08-15

### Fixed
- **Encodage UTF-8 du seed** : le chargement des scripts d'init MySQL se faisait sur une session latin1, ce qui double-encodait les accents (`Les Misérables` → `Les MisÃ©rables`) et faisait échouer la validation de C4/C5. Ajout de `SET NAMES utf8mb4;` en tête des fichiers `db/init/*.sql`. Vérifié de bout en bout après recréation du volume.

### Verified (smoke test end-to-end, pile Docker dans WSL)
- Pile `up` (MySQL healthy + API), page servie sur `http://localhost:8080` et `http://localhost:8080` (the private network, IP 10.0.0.0).
- Quiz C1–C3 valident + **gating** débloque la carte suivante ; carte verrouillée → `403`.
- C4 `SELECT * FROM books` → **pass** (accents corrects, NULL préservé) ; C5 `SELECT title, year` → **pass**.
- `UPDATE books …` → **bloqué** par privilèges (executor lecture seule) ; colonne inconnue → **erreur pédagogique FR** ; multi-statements → refusé.

## [1.2.0] - 2026-08-15

### Added
- **Décisions figées** (DESIGN §12.0) : portée MVP = tranche verticale **C1→C5** d'abord ; gating **bienveillant** (essais illimités, aucun verrouillage) ; **prérequis visibles** par carte (`cards.prerequisites`, informatif) ; **archivage du texte** des tentatives (`exercise_attempts.submitted_sql`) ; **affichage des erreurs SQL** pédagogiques (exigence UX) ; locale **FR unique** + mots-clés **EN** ; déploiement **mono-serveur WSL + the private network** ; **pas de reaper** (instance réutilisée/réinitialisée) ; constantes d'exécution par défaut (timeout 3 s, cap 1000 lignes, SQL ≤ 4000 car.).
- **Topologie de déploiement** (DESIGN §12.4.c) : toute la pile (MySQL + API + front) dans **WSL via Docker Compose**, API↔MySQL par réseau interne Compose (aucune frontière Windows↔WSL), port publié exposé via the private network (`<host>:<port>`).
- **Implémentation — tranche verticale (Phase B)** : scaffold Docker Compose (MySQL 8.4), API Node/TS (sessions, cards, execute, hint, solution, progression), client React/TS (UI en cartes avec zone prérequis, éditeur SQL, résultat/erreur), 3 comptes MySQL (moindre privilège), base seed lecture seule, cartes **C1→C5**.

### Changed
- `exercise_attempts` archive le SQL soumis ; `exercise_instances` réutilisées (pas de reaper) ; anatomie de carte enrichie (zone prérequis + zone résultat/erreur ferme).

## [1.1.0] - 2026-08-15

### Changed
- **Parcours re-découpé en cartes** : 15 modules courts / **50 cartes** (une notion = une carte), au lieu de 11 modules « gros » (DESIGN §12.2).
- **Progression par carte** : chaque carte porte un exercice **gating** obligatoire dont la réussite débloque la carte suivante (DESIGN §12.2.b). Les exercices détaillés (`select-all-books`, `top-customers-2023`, `mark-books-returned`) deviennent des exercices d'entraînement **`practice`** optionnels (§12.3).
- **Modèle de données** : introduction de `cards` (avec `gating_exercise_id`, `gating_kind`), `exercises.role` (`gating`/`practice`), `user_progress` porté par **(user, card)** avec états `locked/available/in_progress/validated/validated_after_hint` + drapeau `solution_viewed` (§12.5).
- **UI en cartes** : anatomie de la carte-écran (§12.2.a) et 6 états visuels navigables (couleur + icône + libellé) ; cartes validées librement navigables.
- **Routes API** : `/api/cards/:slug`, `/api/cards/:slug/next`, `execute` distingue gating/practice (§12.10).

### Added
- **Décision d'isolation tranchée** (DESIGN §12.4.a) : hybride **base seed partagée en lecture seule** (cartes SELECT) + **base MySQL par utilisateur × exercice mutant** (DML/DDL) ; option **Docker-par-exercice écartée** au MVP à cause de la contrainte **Docker-dans-WSL / API côté Windows** (spawn + réseau) ; comparaison explicite des 3 options (a/b/c).
- Manifeste enrichi (`role`, `card`, dérivation `permissions → isolation`) ; GRANT lecture seule sur bases seed partagées (§12.9).
- Critères d'acceptation supplémentaires : gating/déblocage, practice sans effet, navigation, seed partagée sûre, quiz gating (§12.14 #16–#20).

## [1.0.0] - 2026-08-15

### Added
- Conception détaillée du projet dans `docs/DESIGN.md` (livrable de la section 12 du brief : les 16 points).
- Squelette du dépôt : `README.md`, `CHANGELOG.md`, `package.json` racine (champ `version` = `1.0.0`).
- Parcours pédagogique complet (11 modules M0–M10, spirale) sous forme de tableau.
- Trois exercices entièrement spécifiés (`select-all-books`, `top-customers-2023`, `mark-books-returned`).
- Modèle de données applicatif, format de manifeste d'exercice, modèle de permissions MySQL (3 comptes), routes API, stratégie de reset idempotent, critères d'acceptation.

> Prochaine étape : implémentation selon l'ordre de développement (DESIGN §12.15), à démarrer après arbitrage des questions ouvertes (DESIGN §12.16).
