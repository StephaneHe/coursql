# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versionnage [SemVer](https://semver.org/lang/fr/).

## [1.7.4] - 2026-08-15

### Deployment — coursql.shoette.com (porte de compatibilité : INCOMPATIBLE mutualisé OVH)
- **Décision : NON déployable sur l'hébergement mutualisé OVH.** Audit de compatibilité (gate avant tout upload) : rien n'a été uploadé.
- **Raisons** :
  1. Le backend est un **serveur Node.js/Express persistant** (`api/`, `express` + `mysql2`) ; le mutualisé OVH n'exécute que **PHP + fichiers statiques**, aucun process Node long-running.
  2. Toute l'UI dépend de l'API (`/api/accounts|cards|me|progress|sessions|users`) : le front React statique seul est inutilisable.
  3. La sécurité (exécution de SQL non fiable) exige `CREATE DATABASE`/`DROP DATABASE` à la volée (bases isolées `ex_*` par utilisateur), `GET_LOCK`, et **3 comptes MySQL** (app/provisioner/executor) — impossible sur mutualisé (une base fixe, un utilisateur).
- **Options remontées** (voir callback) : **A** — héberger le stack Node+MySQL tel quel sur un hôte Node-capable (VPS OVH / machine actuelle) derrière un reverse proxy HTTPS pointé par `coursql.shoette.com` (**recommandé, zéro réécriture**) ; **B** — hybride (front statique sur mutualisé + API Node hébergée ailleurs, CORS) ; **C** — réécriture PHP (gros chantier + dégrade le modèle d'isolation de sécurité, déconseillé).
- Aucun secret modifié/committé ; `.env` (dont `OVH_DB_*`) non versionné.

## [1.7.3] - 2026-08-15

### Added — résilience au redémarrage
- **Démarrage automatique de la pile après reboot Windows**, sur deux niveaux :
  - `the host init config` (`linux-host`) : section `[boot]` **unique** exécutant (entre autres) `service docker start` → le démon Docker démarre au boot de WSL (en root), puis les conteneurs reviennent seuls via `restart: unless-stopped`.
  - Tâche planifiée Windows `startup-task` (déclencheur *ONLOGON*) → `scripts/startup-script` réveille WSL (déclenche le `[boot]`), attend le démon Docker, puis `docker-compose up -d` idempotent.
- Nouveau `scripts/startup-script` ; section « Démarrage automatique » dans le README.

### Fixed
- **`the host init config` avait deux sections `[boot]`** (invalide : seule la dernière s'exécutait, donc le `sysctl` de ports non privilégiés était perdu). Fusionné en une seule section `[boot]` chaînant `sysctl … ; modprobe kvm_intel && chmod 666 /dev/kvm ; service docker start` — bénéficie à **tous** les services WSL du services.

### Proof
- Résilience prouvée sans reboot : `service docker stop` + `wsl --shutdown` (état à froid) → déclenchement de la tâche → Docker redémarre **automatiquement** via `[boot]`, conteneurs `courssql-mysql-1`/`courssql-app-1` `Up`/healthy, `GET /api/health` = 200, login Alex OK. Données (volumes) préservées.

## [1.7.2] - 2026-08-15

### Fixed
- **Carte C18 « ORDER BY DESC et deuxième clé » — données ne révélaient pas le concept** : la 2ᵉ clé était `id ASC` (= l'ordre naturel InnoDB), donc `ORDER BY year DESC, id` donnait le même résultat que `ORDER BY year DESC` seul. Correctif : 2ᵉ clé passée à **`title ASC`**, et le livre id 4 (ex-æquo 1943 avec id 2) renommé **« Courrier Sud »** (Saint-Exupéry) — un titre qui trie AVANT « Le Petit Prince ». Ainsi les ex-æquo sont réordonnés par rapport à l'ordre d'id : `year DESC` seul ≠ `year DESC, title ASC` (vérifié via l'API : la variante à une clé échoue). Seed appliqué à la base en cours sans effacer le profil Alex ; expected de C5/C9/C10/C13/C22/C24/C35 mis à jour (id 4). Jointures non impactées (book 4 n'est pas emprunté).

## [1.7.1] - 2026-08-15

### Changed
- **Purge des comptes** : suppression de tous les comptes de test de la base en cours (ne reste que `Alex`), avec leurs données liées (`user_sessions`, `exercise_attempts`, `user_progress`) via le compte applicatif ; nettoyage des bases de travail isolées `ex_*` orphelines via le provisioner. (L'init `db/init/*` ne crée aucun compte : une install fraîche démarre sans profil.)
- **UI** : retrait du message « Il n'y a pas de mot de passe… usage de confiance » sur la page d'accueil / sélecteur de comptes.

## [1.7.0] - 2026-08-15

### Added — CURRICULUM COMPLET (50 cartes / 15 modules)
- **C21–C24** : fonctions texte/nombre/date, `CASE` (M8).
- **C25–C29** : `COUNT/SUM/AVG/MIN/MAX`, `GROUP BY`, `HAVING` (M9, M10).
- **C30–C34** : PK/FK (quiz), `INNER/LEFT JOIN`, jointures multiples, autojointure (M11).
- **C35–C41** : sous-requêtes (scalaire/IN/corrélée), `EXISTS/NOT EXISTS`, CTE `WITH`, `UNION`, `INTERSECT/EXCEPT` (M12).
- **Infra cartes mutantes** : `provisionerPool` crée/réinitialise une base de travail isolée `ex_<hash(user,card)>` (schéma+seed versionnés) ; executor DML+DDL sur le motif `ex_` (noms = hash sha256 non devinables ; `coursql_app` reste inaccessible) ; validation par **état final** via requête de vérification cachée, sur une **connexion séparée** (donc `COMMIT` est significatif) ; route `reset` idempotente, verrou `GET_LOCK`, une instance par user×carte réutilisée (pas de reaper).
- **C42–C45** : `INSERT`, `UPDATE`, `DELETE`, transactions `START TRANSACTION/COMMIT/ROLLBACK` (M13).
- **C46–C49** : `CREATE TABLE`, `ALTER TABLE`, contraintes (`NOT NULL`/`PRIMARY KEY`), index + intro `EXPLAIN` — validés via `information_schema` (M14).
- **C50** : projet final combinant `INNER JOIN` + `GROUP BY`/`COUNT` + `ORDER BY` (M15).
- Seed enrichi : tables `loans`, `fines` (DECIMAL), `employees` (autojointure) ; données révélatrices (non-appariés, doublons, NULL, décorrélation, bornes).

### Notes
- `INTERSECT`/`EXCEPT` confirmés fonctionnels en MySQL 8.4.
- Smoke-test end-to-end : les 50 cartes valident avec leur solution ; variantes naïves (opérateur, `COMMIT` oublié, `NOT NULL` manquant, `WHERE` manquant) échouent → concepts significatifs. Isolation vérifiée : accès à `coursql_app` depuis l'executor mutant bloqué.

## [1.5.0] - 2026-08-15

### Fixed
- **Défaut pédagogique « données révèlent le concept »** :
  - **C8** (comparaisons) : aucune ligne n'était pile sur la borne, donc `<` et `<=` donnaient le même résultat. Reformulé sur la borne **1943** (deux livres pile en 1943) → `< 1943` les EXCLUT, `<= 1943` les inclut. Vérifié via l'API : la variante `<= 1943` échoue (résultat distinct).
  - **C9** (`AND`) : dans les données, `author = Saint-Exupéry` était équivalent à `year = 1943`, donc `AND` et `OR` coïncidaient. Ajout d'un livre de Saint-Exupéry en **1931** (décorrélation) → `AND` ≠ `OR`. Vérifié : la variante `OR` échoue.

### Added
- **Table `books` enrichie** (6 livres : + Germinal/Émile Zola/1885, + Vol de Nuit/Saint-Exupéry/1931) pour révéler bornes, décorrélation, doublons d'auteur.
- **Cartes C14→C20** : C14 `IN`, C15 `BETWEEN` (bornes incluses), C16 `LIKE`, C17 `ORDER BY`, C18 `ORDER BY DESC` + 2ᵉ clé, C19 `LIMIT`, C20 `DISTINCT`. Modules M6 (Filtres pratiques) et M7 (Trier et limiter). Chaque carte : exercice ≠ exemple, données révélatrices, validation par résultat.
- **Principe d'authoring « les données révèlent le concept »** documenté dans `docs/DESIGN.md` §12.6.a (cas-limite obligatoire : borne pour `<`/`BETWEEN`, décorrélation pour `AND`/`OR`, doublons pour `DISTINCT`, NULL, non-appariés pour LEFT JOIN…).

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
