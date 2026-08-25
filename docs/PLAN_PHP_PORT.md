# Plan d'implémentation — Port PHP de coursSQL pour l'hébergement mutualisé OVH

> **Statut** : plan de conception, à exécuter par un autre musicien. Aucun code de port n'est écrit ici.
> **Cible de version** : `2.0.0` (port majeur).
> **Contrainte ferme** : UNE base MySQL, UN utilisateur MySQL, pas de `CREATE/DROP DATABASE`, pas de
> process Node. L'isolation par bases `ex_*` devient une isolation **par tables préfixées**.

---

## 0. Résumé exécutif (à lire avant tout)

| Sujet | Décision |
|---|---|
| Front | **Garder le build React statique**, servi au même domaine. Seule l'**API** est réécrite en PHP. Zéro CORS, zéro réécriture des 50 cartes côté UI. |
| API | Front-controller unique `api/index.php` + routeur, PDO MySQL, PHP **8.1+**. |
| Contenu des cartes | **Exporté en JSON** depuis le `cards.ts` existant (script Node one-shot) → source unique, pas de retranscription manuelle de 1910 lignes. |
| Isolation SQL | **Namespace de tables par (utilisateur × carte)** + **réécriture des identifiants** + **allowlist positive** (parser `phpmyadmin/sql-parser`). |
| Sécurité | ⚠️ **Dégradation assumée** : la barrière MySQL (3 comptes + grants) disparaît. La seule barrière devient le filtre applicatif PHP. Voir §3.1 et §8. |
| Verrous | `GET_LOCK` → table `app_locks` (verrou applicatif portable). |
| Schéma | **Un seul dump** `deploy/ovh/schema.sql` à importer via phpMyAdmin. |
| Étapes | **12 étapes** ordonnées (§6). |

---

## 1. Inventaire de l'existant à porter

### 1.1 Modules Node actuels

| Fichier | Lignes | Rôle | Devient |
|---|---|---|---|
| `api/src/index.ts` | 423 | Express, 13 routes, garde de session, service statique | `api/index.php` (routeur) + `api/routes/*.php` |
| `api/src/content/cards.ts` | 1910 | **Contenu des 50 cartes** (énoncés, exemples, solutions, expected, indices, schémas/seeds des cartes mutantes) | **`content/cards.json`** (exporté) + `api/lib/Cards.php` (chargement) |
| `api/src/lib/mutate.ts` | 138 | Provisioning base `ex_<hash>`, exécution SQL mutant, verify sur connexion séparée, reset, `GET_LOCK` | `api/lib/Workspace.php` (tables préfixées) |
| `api/src/progress.ts` | 132 | Progression par carte, gating, statuts, tentatives | `api/lib/Progress.php` |
| `api/src/lib/compare.ts` | 84 | Comparaison de résultats (multi-ensemble, NULL, ordre, colonnes) | `api/lib/Compare.php` |
| `api/src/session.ts` | 79 | Users (normalisation nom), sessions opaques en base | `api/lib/Auth.php` (sessions PHP natives) |
| `api/src/lib/execute.ts` | 61 | Garde-fous SQL (longueur, statement unique), exécution lecture seule | `api/lib/SqlGuard.php` + `api/lib/Runner.php` |
| `api/src/db.ts` | 54 | 3 pools MySQL (app / executor / provisioner) | `api/lib/Db.php` (**1 seul PDO**) |
| `api/src/config.ts` | 53 | Config env, bascule `DB_TARGET` | `api/config.php` |
| `api/src/lib/sqlErrors.ts` | 44 | Mapping erreurs MySQL → messages FR pédagogiques | `api/lib/SqlErrors.php` |

### 1.2 Routes actuelles → fichiers PHP

Toutes sous `/api/`. Le routeur `api/index.php` dispatche sur `REQUEST_METHOD` + chemin.

| Méthode | Route Node | Auth | Handler PHP |
|---|---|---|---|
| GET | `/api/health` | non | `routes/health.php` |
| GET | `/api/accounts` | non | `routes/accounts.php` |
| POST | `/api/users` | non | `routes/users_create.php` |
| POST | `/api/sessions` | non | `routes/session_login.php` |
| GET | `/api/me` | non | `routes/me.php` |
| DELETE | `/api/sessions/current` | oui | `routes/session_logout.php` |
| GET | `/api/progress` | oui | `routes/progress.php` |
| GET | `/api/cards/:slug` | oui | `routes/card_get.php` |
| GET | `/api/cards/:slug/next` | oui | `routes/card_next.php` |
| POST | `/api/cards/:slug/execute` | oui | `routes/card_execute.php` ⭐ (cœur) |
| POST | `/api/cards/:slug/reset` | oui | `routes/card_reset.php` |
| POST | `/api/cards/:slug/hint` | oui | `routes/card_hint.php` |
| POST | `/api/cards/:slug/solution` | oui | `routes/card_solution.php` |

**Contrats JSON à préserver à l'identique** (le front React n'est pas modifié) : voir les réponses
actuelles dans `api/src/index.ts` (champs `status`, `kind`, `columns`, `rows`, `messageFr`,
`card_validated`, `next_card_slug`, `truncated`, `hint_fr`, `solution_sql`, `explanation_fr`,
`modules[].cards[]{slug,title,status,hint_used,solution_viewed}`).

### 1.3 Schéma applicatif actuel (`db/init/01-schema.sql`)

- `users` (id CHAR(36), display_name, name_normalized UNIQUE, created_at, last_active_at)
- `user_sessions` (id CHAR(64), user_id, created_at, expires_at, revoked_at)
- `user_progress` (user_id, card_slug, status ENUM, attempts_count, hint_used, solution_viewed, first_validated_at, last_attempt_at) — PK (user_id, card_slug)
- `exercise_attempts` (id BIGINT, user_id, card_slug, exercise_slug, submitted_sql TEXT, outcome ENUM, duration_ms, error_category, submitted_at)

### 1.4 Données de démonstration (`db/init/03-seed-books.sql`) — base `seed_books_v1`

Tables **partagées en lecture** utilisées par **38 cartes SELECT** : `books` (6 lignes), `members` (5),
`loans` (5), `fines` (4, DECIMAL), `employees` (4, autojointure).
Les données sont *calibrées* (bornes, décorrélation, doublons, NULL) : **ne rien y changer**, les
`expected` de 38 cartes en dépendent.

### 1.5 Cartes mutantes C42→C49 (le point délicat)

| Carte | Type | Tables logiques | Vérification actuelle |
|---|---|---|---|
| C42 `INSERT` | dml | `todo` | `SELECT id,label,done FROM todo ORDER BY id` |
| C43 `UPDATE` | dml | `todo` | `SELECT id,done FROM todo ORDER BY id` |
| C44 `DELETE` | dml | `todo` | `SELECT id FROM todo ORDER BY id` |
| C45 transactions | dml **multi-instructions** | `todo` | idem, **sur une connexion séparée** (c'est ce qui rend `COMMIT` significatif) |
| C46 `CREATE TABLE` | ddl | `produits` (créée par l'apprenant) | `information_schema.columns WHERE table_schema=DATABASE() AND table_name='produits'` |
| C47 `ALTER TABLE` | ddl | `produits` (pré-créée) | idem |
| C48 contraintes | ddl | `utilisateurs` (créée par l'apprenant) | `information_schema.columns` (`is_nullable`) |
| C49 index | ddl | `catalogue` (pré-créée) | `information_schema.statistics` (`index_name='idx_annee'`) |

**Mécanique actuelle** (`mutate.ts`) : à chaque `execute`, on (1) prend un `GET_LOCK`, (2) `DROP
DATABASE` + `CREATE DATABASE` + rejoue schema+seed, (3) exécute le SQL apprenant sur une connexion,
(4) **ferme** cette connexion (⇒ transaction non committée annulée), (5) ouvre une **seconde**
connexion pour la requête de vérification cachée, (6) compare l'état final.

---

## 2. Architecture PHP cible

### 2.1 Choix du front : **garder React statique** (recommandé)

**Décision : conserver le build Vite existant, réécrire uniquement l'API.**

| | React statique conservé | Rendu PHP (réécriture UI) |
|---|---|---|
| Effort | build déjà fait, 0 ligne d'UI à réécrire | réécrire 50 cartes + éditeur + menu + états |
| Risque de régression | quasi nul (contrats JSON identiques) | élevé (toute l'UX à revalider) |
| CORS | **aucun** (même origine) | sans objet |
| Compatibilité mutualisé | fichiers statiques = cas nominal | idem |

Le front appelle déjà `/api/*` en **relatif** (`api.ts`) : servi depuis `coursql.shoette.com`, il
tape l'API PHP du même domaine. **Aucune modification du client n'est nécessaire.**

### 2.2 Arborescence à déployer dans `~/coursql/`

```
~/coursql/
├── .htaccess                 # SPA fallback + routage /api/* + protections
├── index.html                # build React (Vite)
├── assets/                   # build React (js/css hashés)
├── api/
│   ├── index.php             # front-controller (routeur)
│   ├── config.php            # lit env/config (OVH_*), pas de secret en dur
│   ├── routes/*.php          # 13 handlers (cf. §1.2)
│   └── lib/
│       ├── Db.php            # PDO unique
│       ├── Auth.php          # sessions PHP natives, users
│       ├── Cards.php         # chargement content/cards.json
│       ├── Progress.php      # progression/gating
│       ├── Compare.php       # comparaison de résultats
│       ├── SqlGuard.php      # ⭐ parser/allowlist/réécriture
│       ├── Workspace.php     # ⭐ tables de travail préfixées, reset, locks
│       ├── Runner.php        # exécution bornée (timeout, cap lignes)
│       └── SqlErrors.php     # messages FR
├── private/                  # ⛔ NON servi (protégé par .htaccess + hors index)
│   ├── cards.json            # contient solutions + expected → jamais exposé
│   └── config.local.php      # identifiants DB (600)
└── vendor/                   # phpmyadmin/sql-parser (vendored, pas de composer sur OVH)
```

> ⚠️ `private/cards.json` contient **solutions et résultats attendus**. Il DOIT être hors de portée
> HTTP : `.htaccess` `Require all denied` **et** placé hors du dossier web si l'hébergement le permet
> (ex. `~/private_coursql/` avec `coursql/` comme racine web). **Vérifier par un `curl` explicite** (§7).

### 2.3 `.htaccess` (racine)

Responsabilités : (1) router `/api/...` vers `api/index.php`, (2) fallback SPA vers `index.html`,
(3) refuser l'accès à `private/`, `vendor/`, `*.json` sensibles, (4) en-têtes de sécurité.

```apache
RewriteEngine On
# API -> front controller
RewriteRule ^api/(.*)$ api/index.php [QSA,L]
# SPA fallback (tout ce qui n'est pas un fichier réel)
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```
+ blocs `<Directory>`/`<Files>` de refus pour `private/` et `vendor/`.

### 2.4 PHP / PDO

- **PHP 8.1+** (sélectionner dans l'espace client OVH ; 8.1/8.2 dispo).
- **PDO MySQL** avec `ATTR_ERRMODE=EXCEPTION`, `ATTR_EMULATE_PREPARES=false`,
  `MYSQL_ATTR_MULTI_STATEMENTS=false` (⚠️ **critique** : empêche `; DROP TABLE` par construction).
- **Toutes** les requêtes applicatives sont **préparées/paramétrées**. Le SQL de l'apprenant est
  le seul SQL non paramétré, et il passe par `SqlGuard` (§3).

### 2.5 Auth / sessions

**Décision : sessions PHP natives** (`session_start()`), cookie `HttpOnly`, `SameSite=Lax`,
`Secure` (le sous-domaine sera en HTTPS), `session.use_strict_mode=1`.

- La table `user_sessions` **disparaît**. Motif de sécurité (non cosmétique) : dans une base
  partagée avec un seul compte MySQL, y stocker des **jetons de session** créerait une cible de vol
  directe si le filtre SQL était contourné. Les sessions en fichiers PHP sont hors de portée du SQL.
- `POST /api/sessions` = login par nom (sans mot de passe, comme aujourd'hui) → `$_SESSION['user_id']`.
- `DELETE /api/sessions/current` = `session_destroy()`.

---

## 3. 🔴 Isolation & sécurité (cœur du port)

### 3.1 Modèle de menace — ce qui change, honnêtement

Aujourd'hui, l'isolation repose sur **MySQL lui-même** : 3 comptes, grants par base, base jetable
par (user × exercice). Même un bug applicatif ne permettait pas d'atteindre la base applicative.

Sur OVH mutualisé **avec un seul compte MySQL**, cette barrière **n'existe plus** : tout ce que
l'application peut faire, une requête d'apprenant non filtrée le peut aussi (lire `users`, modifier
`user_progress`, `DROP TABLE`). **La seule barrière devient le filtre PHP.** C'est une dégradation
réelle et irréductible sous la contrainte imposée ; elle est acceptable pour un usage
familial/scolaire de confiance, et doit être conçue avec le sérieux d'un bac à sable.

Barrière résiduelle conservée : l'utilisateur MySQL OVH n'a de droits **que sur sa propre base**,
donc `mysql.user`, les autres bases et `FILE` restent refusés **par MySQL**. C'est le dernier filet.

### 3.2 Mécanisme retenu : namespace de tables + réécriture + allowlist positive

**Principe** : l'apprenant écrit des noms **logiques** (`todo`, `books`) ; l'application **réécrit**
ces noms vers des noms **physiques** préfixés avant exécution. Tout identifiant en position de table
qui n'appartient pas à l'allowlist logique de la carte ⇒ **refus**.

C'est une **allowlist par construction** (et non un denylist à trous) : `app_users` n'est pas un nom
logique de carte, donc il n'est jamais traduisible, donc jamais atteignable.

**Conventions de nommage** (identifiants MySQL ≤ 64 caractères) :

| Type | Motif | Exemple |
|---|---|---|
| Applicatif | `app_<nom>` | `app_users`, `app_progress`, `app_attempts`, `app_locks` |
| Démo (lecture) | `seed_<nom>` | `seed_books`, `seed_members`, `seed_loans`, `seed_fines`, `seed_employees` |
| Référence pristine | `seedref_<nom>` | `seedref_books` (copie de contrôle, §3.6) |
| Travail apprenant | `wk_<uid8>_<card>_<table>` | `wk_a46e0114_c42_todo` |

`uid8` = 8 premiers hex de `sha256(user_id)` (jamais le nom affiché). `card` = slug minuscule.

**Table des correspondances par carte** (dérivée de `cards.json`) :

- Cartes `read_only` : `books → seed_books`, `members → seed_members`, `loans → seed_loans`,
  `fines → seed_fines`, `employees → seed_employees`.
- Cartes `dml`/`ddl` : `todo → wk_<uid8>_c42_todo`, `produits → wk_<uid8>_c47_produits`, etc.
  Pour C46/C48 (l'apprenant **crée** la table), le nom logique attendu (`produits`, `utilisateurs`)
  est déclaré dans la carte et mappé au nom physique : `CREATE TABLE produits (...)` devient
  `CREATE TABLE wk_<uid8>_c48_utilisateurs (...)` après réécriture.

### 3.3 Pipeline d'exécution du SQL apprenant (`SqlGuard` + `Runner`)

Ordre **impératif** — chaque étape peut refuser :

1. **Pré-vol** : longueur ≤ 4000 caractères ; chaîne non vide.
2. **Lexing** avec `phpmyadmin/sql-parser` (MIT, pur PHP, vendorable). Les commentaires `--`, `#`,
   `/* */` sont supprimés ; les **commentaires exécutables `/*! ... */` provoquent un REFUS** (vecteur
   classique de contournement de filtre).
3. **Découpage en instructions**. Pour toutes les cartes sauf C45 : **une seule** instruction admise.
   Pour C45 : liste d'instructions, chacune passant tout le pipeline.
4. **Allowlist de type d'instruction**, selon `permissions` de la carte :
   - `read_only` : `SELECT`, `WITH … SELECT` uniquement.
   - `dml` : `SELECT`, `INSERT`, `UPDATE`, `DELETE` (+ `START TRANSACTION` / `COMMIT` / `ROLLBACK`
     pour C45 uniquement).
   - `ddl` : `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX`, `DROP INDEX`, `SELECT`.
   Tout autre type ⇒ refus (message pédagogique, cf. §3.5).
5. **Allowlist de tokens** (grammaire positive) : seuls sont admis les mots-clés de l'allowlist, les
   identifiants, les littéraux, les opérateurs et les espaces. Tout token inconnu ⇒ refus.
6. **Résolution des identifiants en position de table** : chaque nom de table doit exister dans la
   table de correspondance de la carte ⇒ sinon refus. **Réécriture** vers le nom physique.
7. **Contrôle post-réécriture (belt & braces)** : re-lexer le SQL final et **vérifier** que les seuls
   identifiants en position de table sont exactement les noms physiques attendus (préfixes
   `wk_<uid8>_<card>_` ou `seed_`). Toute divergence ⇒ refus **et journalisation** (signal d'attaque).
8. **Exécution bornée** (`Runner`) : `SET SESSION max_execution_time=3000` (SELECT), cap de
   `1000+1` lignes lues côté PHP, `set_time_limit` PHP.

### 3.4 Vecteurs d'évasion et parades (analyse adversariale)

| # | Vecteur | Exemple | Parade |
|---|---|---|---|
| 1 | Lire les tables applicatives | `SELECT * FROM app_users` | `app_users` n'est pas un nom **logique** ⇒ non résoluble (étape 6). |
| 2 | Tricher sur la progression | `UPDATE app_progress SET status='validated'` | idem + type `UPDATE` refusé sur cartes `read_only`. |
| 3 | Détruire l'app | `DROP TABLE app_users` | `DROP TABLE` admis seulement en `ddl`, **et** cible réécrite/limitée aux noms logiques de la carte. |
| 4 | Voler la table d'un autre apprenant | `SELECT * FROM wk_ffff1111_c42_todo` | Nom physique ⇒ pas un nom logique ⇒ refus (étape 6). Le `uid8` d'autrui est de toute façon un hash. |
| 5 | Injection multi-instructions | `SELECT 1; DROP TABLE app_users` | `MULTI_STATEMENTS=false` (PDO) **+** découpage/refus étape 3. Double barrière. |
| 6 | Commentaire exécutable MySQL | `/*!50000 DROP */ TABLE x` | Refus explicite de `/*!` (étape 2). |
| 7 | SQL dynamique | `PREPARE s FROM 'DROP TABLE app_users'; EXECUTE s` | `PREPARE`/`EXECUTE`/`DEALLOCATE` hors allowlist de types (étape 4). |
| 8 | Vue-piège différée | `CREATE VIEW v AS SELECT * FROM app_users` | `CREATE VIEW` hors allowlist (seul `CREATE TABLE/INDEX` admis). |
| 9 | Routine stockée / trigger | `CREATE PROCEDURE…`, `CREATE TRIGGER…`, `CALL…` | Hors allowlist de types. |
| 10 | Exfiltration fichier | `SELECT … INTO OUTFILE '/tmp/x'`, `LOAD_FILE()` | Hors allowlist de tokens **+** privilège `FILE` absent côté OVH (filet MySQL). |
| 11 | Recensement du schéma | `SELECT * FROM information_schema.tables` | `information_schema`/`mysql`/`sys`/`performance_schema` ne sont pas des noms logiques ⇒ refus. Les cartes DDL n'en ont pas besoin : **c'est la requête cachée de l'app** qui interroge `information_schema` (§3.7). |
| 12 | Cross-schema | `SELECT * FROM autrebase.t` | Identifiant qualifié ⇒ refus (étape 6) **+** droits MySQL limités à la base OVH. |
| 13 | UNION vers table interdite | `SELECT * FROM todo UNION SELECT * FROM app_users` | La résolution d'identifiants parcourt **toutes** les branches ; `app_users` ⇒ refus. |
| 14 | Déni de service | `SELECT SLEEP(30)`, `BENCHMARK(…)`, produit cartésien | `SLEEP`/`BENCHMARK`/`GET_LOCK` hors allowlist de fonctions ; `max_execution_time` ; `set_time_limit` PHP ; cap de lignes. |
| 15 | Variables système | `SELECT @@datadir`, `SET GLOBAL …` | `@@` et `SET` (hors transactions C45) hors allowlist. |
| 16 | Renommage furtif | `RENAME TABLE todo TO app_users` | `RENAME` hors allowlist de types. |
| 17 | Corruption des données de démo | `UPDATE books SET year=0` | `UPDATE` refusé sur cartes `read_only` (les 38 cartes SELECT). Filet : `seedref_*` + script de réparation (§3.6). |
| 18 | Collision de noms physiques | forger un nom qui ressemble à `wk_…` | Impossible : l'apprenant ne fournit jamais un nom physique (tout passe par la table de correspondance). |
| 19 | Identifiants échappés/backquotes/casse | `` SELECT * FROM `App_Users` `` | Normalisation (backquotes retirées, casse repliée) **avant** la recherche dans la table de correspondance. |
| 20 | Unicode/espaces exotiques | homoglyphes, `\t`, commentaires imbriqués | Le lexer normalise ; la grammaire positive (étape 5) refuse tout token non prévu. |

> **Principe directeur** : ne jamais compter sur un denylist de mots-clés (contournable). Le refus par
> défaut vient de l'**allowlist de types + allowlist de tokens + résolution obligatoire des noms de
> tables**. Le denylist (`SLEEP`, `OUTFILE`, …) n'est qu'un **second filet** lisible.

### 3.5 Messages d'erreur

Réutiliser le mapping FR existant (`sqlErrors.ts` → `SqlErrors.php`) et **ajouter** les refus du
garde, formulés **pédagogiquement** sans révéler la structure interne :
- « Pour cette carte, seule la lecture (`SELECT`) est permise. »
- « Table inconnue pour cet exercice : tu peux utiliser `todo`. »
- « Cette instruction n'est pas autorisée dans l'exercice. »
Ne **jamais** renvoyer le nom physique préfixé ni le message MySQL brut.

### 3.6 Intégrité des données de démonstration

Les tables `seed_*` sont partagées. Bien que les cartes SELECT n'autorisent que `SELECT` :
- conserver des tables `seedref_*` (copies pristines, jamais référencées par une carte) ;
- fournir `deploy/ovh/repair_seed.sql` qui restaure `seed_*` depuis `seedref_*` ;
- vérification périodique optionnelle (comparaison de `COUNT(*)`/checksum) exposée en admin.

### 3.7 Vérification cachée des cartes DDL (C46–C49)

Aujourd'hui : `information_schema … WHERE table_schema = DATABASE() AND table_name='produits'`.
Dans une base unique, `table_schema = DATABASE()` verrait **toutes** les tables de tous les
apprenants. La requête de vérification (écrite par l'app, **pas** par l'apprenant) devient :

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = :physical_table      -- ex. wk_a46e0114_c48_utilisateurs
ORDER BY ordinal_position
```

⚠️ **Point de vigilance** : `information_schema.columns.column_name` renvoie les colonnes réelles ;
comme la **table** est renommée mais pas ses colonnes, les `expected` des cartes C46–C49 restent
valides **inchangés**. À confirmer en test (§7, test 6).

### 3.8 Verrous (remplacement de `GET_LOCK`)

Table dédiée :

```sql
CREATE TABLE app_locks (
  lock_key   VARCHAR(80) NOT NULL PRIMARY KEY,
  holder     CHAR(64)    NOT NULL,
  acquired_at DATETIME   NOT NULL
) ENGINE=InnoDB;
```

Acquisition : `INSERT … ON DUPLICATE KEY UPDATE holder=IF(acquired_at < NOW()-INTERVAL 30 SECOND, VALUES(holder), holder)`
puis relecture pour confirmer la détention ; libération = `DELETE`. Expiration 30 s (protège des
requêtes PHP interrompues). Clé = `wk:<uid8>:<card>`.

### 3.9 Réinitialisation (remplacement du `DROP DATABASE`)

`Workspace::reset(user, card)` :
1. prendre le verrou (§3.8) ;
2. `DROP TABLE IF EXISTS` **chacune** des tables physiques de la carte (liste connue, jamais un
   `LIKE 'wk_%'` non borné) ;
3. rejouer `schemaSql` puis `seedSql` de la carte, **après réécriture** des noms logiques → physiques ;
4. libérer le verrou.

Comme aujourd'hui, **chaque `execute` d'une carte mutante commence par ce reset** ⇒ idempotence,
pas d'accumulation, pas de collision de clé primaire au réessai.

### 3.10 Transactions (C45) — préserver la sémantique de `COMMIT`

Ce qui rend la carte significative : un `COMMIT` oublié doit **échouer**. Procédure PHP :
1. connexion **A** (PDO neuf) : exécuter les instructions de l'apprenant, dans l'ordre ;
2. **fermer A** (`$pdoA = null`) ⇒ toute transaction non committée est annulée par MySQL ;
3. connexion **B** (PDO neuf) : exécuter la requête de vérification cachée ;
4. comparer.
⚠️ Ne **pas** réutiliser une connexion persistante (`PDO::ATTR_PERSISTENT=false` obligatoire), sinon
la sémantique tombe.

---

## 4. Migration du schéma — un dump unique

Livrable : **`deploy/ovh/schema.sql`** (un seul fichier, importable dans phpMyAdmin OVH).

Contenu, dans cet ordre :
1. `SET NAMES utf8mb4;`
2. **Tables applicatives** (renommées avec préfixe `app_`) :
   `app_users`, `app_progress`, `app_attempts`, `app_locks`.
   (⚠️ `user_sessions` **n'est pas** reprise — sessions PHP natives, §2.5.)
   - `app_users` : reprendre `users` tel quel (id CHAR(36), display_name, name_normalized UNIQUE…).
   - `app_progress` : reprendre `user_progress` (PK `(user_id, card_slug)`).
   - `app_attempts` : reprendre `exercise_attempts` (archive du SQL soumis conservée).
3. **Tables de démonstration** `seed_books`, `seed_members`, `seed_loans`, `seed_fines`,
   `seed_employees` — **structures et données reprises telles quelles** de `db/init/03-seed-books.sql`
   (données calibrées, cf. §1.4), simplement renommées.
4. **Tables de référence** `seedref_*` (mêmes données, §3.6).
5. Optionnel : `INSERT` du profil `Alex` (sinon créé via l'UI).

**Pas de tables `wk_*` dans le dump** : elles sont créées à la volée par `Workspace`.

Script de génération conseillé : `deploy/ovh/build-schema.mjs` (Node, one-shot local) qui lit
`db/init/*.sql`, applique les renommages et écrit `schema.sql` — évite les divergences manuelles.

---

## 5. Configuration & déploiement

### 5.1 Configuration

- `private/config.local.php` (non versionné, non servi, `chmod 600`) renvoie un tableau :
  `['host'=>…, 'name'=>…, 'user'=>…, 'password'=>…]`.
- Valeurs issues du `.env` local : `OVH_SERVER_ADD` → **host** (ex. `xxxxxxx.mysql.db`),
  `OVH_DB_NAME`, `OVH_DB_USER`, `OVH_DB_PASSWORD`. `OVH_SERVER` = référence informative (non utilisée
  par PDO).
- **Bascule local ↔ OVH** : `api/config.php` charge `private/config.local.php` s'il existe, sinon les
  variables d'environnement (dev local Docker). Aucun identifiant en dur, jamais journalisé.
- Générateur conseillé : `deploy/ovh/make-config.mjs` (lit `.env`, écrit `private/config.local.php`),
  exécuté **localement** avant l'upload ; le fichier généré ne doit **pas** être committé
  (ajouter `private/config.local.php` au `.gitignore`).

### 5.2 Déploiement SFTP (procédure sûre — impérative)

- Identifiants dans **`<deploy-env>`** : `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PASSWORD`,
  `DEPLOY_PROTOCOL=sftp`. **Nettoyer les CRLF** à la lecture (`tr -d '\r'`).
- `lftp` en sftp, **non interactif** : `set sftp:auto-confirm yes`.
- Mot de passe passé **via l'entrée du client ou une variable d'environnement**, **jamais** en
  argument de ligne de commande, **jamais** `echo`/`set -x`/`cat`, **jamais** dans un log.
- Cible **exacte** : `~/coursql/` — **ne toucher à aucun autre dossier** de la racine.
- **Exclure** : `.git`, `node_modules`, `.env`, `api/src` (TypeScript), `db/`, tests, dumps inutiles.
- Après l'opération : vérifier qu'aucun fichier temporaire/sortie ne contient le mot de passe, et
  supprimer les résidus. Aucun secret dans les réponses.

### 5.3 Sous-domaine

`coursql.shoette.com` → dossier racine `coursql/` (multisite OVH). PHP **8.1+**. Activer HTTPS
(certificat OVH/Let's Encrypt) puis passer le cookie de session en `Secure`.

---

## 6. Étapes d'implémentation (ordonnées, actionnables)

| # | Étape | Livrable | Vérification |
|---|---|---|---|
| 1 | **Pré-vol OVH** : relever la **version MySQL** (`SELECT VERSION()`) et la version PHP dispo | note dans le CHANGELOG | ⚠️ si MySQL < 8.0.31 ⇒ **C41 (`INTERSECT`/`EXCEPT`) non supportée** → cf. §8 |
| 2 | **Export du contenu** : script Node one-shot `deploy/ovh/export-cards.mjs` | `private/cards.json` (50 cartes, solutions + expected + schema/seed mutants + `tables` logiques) | JSON valide, 50 cartes, aucune perte de champ |
| 3 | **Dump schéma** : `deploy/ovh/build-schema.mjs` | `deploy/ovh/schema.sql` | import local dans un MySQL vierge sans erreur |
| 4 | **Socle PHP** : `api/index.php` (routeur), `config.php`, `lib/Db.php`, `lib/SqlErrors.php` | squelette | `GET /api/health` renvoie `{ok:true,version:"2.0.0"}` |
| 5 | **Auth & progression** : `lib/Auth.php`, `lib/Progress.php`, routes `users`, `sessions`, `me`, `accounts`, `progress` | 5 routes | login `Alex`, `/api/progress` renvoie 50 cartes, gating identique |
| 6 | **Contenu & cartes** : `lib/Cards.php`, routes `card_get`, `card_next`, `hint`, `solution` | 4 routes | la carte C1 s'affiche ; `solution` ne valide pas la carte |
| 7 | **Comparaison** : `lib/Compare.php` (port de `compare.ts` : multi-ensemble, ordre optionnel, NULL distinct, DECIMAL exact) | lib | tests unitaires (§7 test 3) |
| 8 | ⭐ **Garde SQL** : `lib/SqlGuard.php` (parser vendored, allowlists, résolution+réécriture, contrôle post-réécriture) | lib + `vendor/` | **suite d'évasion (§7 test 5) : tout doit être refusé** |
| 9 | **Exécution lecture seule** : `lib/Runner.php` + `card_execute` pour les 38 cartes SELECT | route | C4, C8, C18, C50 passent ; variantes naïves échouent |
| 10 | ⭐ **Espace de travail mutant** : `lib/Workspace.php` (tables préfixées, reset, `app_locks`, 2 connexions pour C45) + cartes C42→C49 + `card_reset` | route | C42–C49 passent ; `COMMIT` oublié échoue ; reset restaure |
| 11 | **Empaquetage** : build React (`npm run build`), `.htaccess`, arborescence `~/coursql/`, `private/` protégé | archive de déploiement | `curl` sur `private/cards.json` ⇒ **403/404** |
| 12 | **Déploiement + recette** : import `schema.sql`, upload SFTP (§5.2), pointage sous-domaine, PHP 8.1, HTTPS | site en ligne | procédure §7 rejouée sur `coursql.shoette.com` |

Jalons de commit conseillés : après chaque étape (`feat(php): …`), version `2.0.0-alpha.N`, puis
`2.0.0` à l'étape 12. CHANGELOG mis à jour à chaque jalon. **Ne jamais committer** `.env`,
`private/config.local.php`.

---

## 7. Procédure de vérification (recette)

À exécuter **en local d'abord** (PHP + MySQL de test), puis **sur OVH**.

1. **Santé & front** : `GET /api/health` = 200 ; la page d'accueil se charge ; la grille de comptes
   s'affiche.
2. **Login** : cliquer le compte `Alex` ⇒ session ouverte, `/api/progress` renvoie les 50 cartes
   avec les bons statuts (C1 `available`, suite `locked` pour un profil neuf).
3. **Carte SELECT simple (C4)** : `SELECT * FROM members;` ⇒ `pass`, carte validée, C5 débloquée.
   Vérifier aussi qu'une **variante naïve échoue** là où le concept l'exige :
   - C8 : `year <= 1943` ⇒ **fail** ; `year < 1943` ⇒ pass.
   - C18 : `ORDER BY year DESC` seul ⇒ **fail** ; `ORDER BY year DESC, title ASC` ⇒ pass.
4. **Erreur pédagogique** : `SELECT titre FROM books;` ⇒ message FR « Colonne inconnue… » **affiché**
   (jamais le message MySQL brut).
5. ⭐ **Suite d'évasion — CHAQUE ligne DOIT être refusée** (et journalisée), sans effet de bord :

   | Requête d'attaque | Attendu |
   |---|---|
   | `SELECT * FROM app_users` | refus « table inconnue pour cet exercice » |
   | `SELECT * FROM user_progress` / `app_progress` | refus |
   | `UPDATE app_progress SET status='validated'` | refus (type + table) |
   | `DROP TABLE app_users` | refus |
   | `SELECT * FROM information_schema.tables` | refus |
   | `SELECT * FROM mysql.user` | refus |
   | `SELECT 1; DROP TABLE app_users` | refus (multi-instructions) |
   | `/*!50000 SELECT*/ * FROM app_users` | refus (commentaire exécutable) |
   | `PREPARE s FROM 'SELECT * FROM app_users'` | refus |
   | `CREATE VIEW v AS SELECT * FROM app_users` | refus |
   | `SELECT * FROM books UNION SELECT id,display_name,'','' FROM app_users` | refus |
   | `SELECT * FROM wk_<autre_uid>_c42_todo` | refus |
   | `UPDATE books SET year=0` (carte SELECT) | refus ; `seed_books` **intact** (comparer avec `seedref_books`) |
   | `SELECT SLEEP(10)` | refus |
   | `SELECT LOAD_FILE('/etc/passwd')` | refus |
   | `` SELECT * FROM `App_Users` `` | refus (normalisation casse/backquotes) |

   **Après la suite complète** : vérifier que `app_users`, `app_progress` et `seed_*` sont **inchangées**.
6. **Cartes mutantes** :
   - C42 `INSERT` ⇒ pass ; vérifier en base que la table physique est bien `wk_<uid8>_c42_todo`.
   - C43 `UPDATE todo SET done=1` **sans** `WHERE` ⇒ **fail** ; avec `WHERE id=1` ⇒ pass.
   - C45 : `START TRANSACTION; INSERT …;` **sans** `COMMIT` ⇒ **fail** ; avec `COMMIT` ⇒ pass.
   - C46/C48 (`CREATE TABLE`) et C47/C49 (`ALTER`/`CREATE INDEX`) ⇒ pass, vérification par
     `information_schema` sur le **nom physique**.
   - **Bouton Réinitialiser** ⇒ table restaurée à l'état initial ; **progression conservée**.
7. **Isolation entre apprenants** : créer un 2ᵉ profil, faire C42 avec les deux, vérifier deux jeux de
   tables `wk_` distincts et **aucune interférence**.
8. **Protection des fichiers** : `curl https://coursql.shoette.com/private/cards.json` ⇒ **403/404** ;
   idem `vendor/`. Aucune solution ne doit être servie avant les routes dédiées.
9. **Non-régression pédagogique** : rejouer le parcours complet C1→C50 avec les solutions officielles
   ⇒ **50/50 pass** (l'équivalent du smoke-test Node actuel).

---

## 8. Points durs, non-répliquables et décisions assumées

| # | Point | Décision / alternative retenue |
|---|---|---|
| 1 | **Isolation MySQL perdue** (3 comptes + bases jetables ⇒ 1 compte) | Isolation **logique** en PHP (§3). Assumé, documenté. Filet résiduel : droits OVH limités à la base. Le filtre `SqlGuard` devient un composant **critique** : revue + suite d'évasion obligatoire à chaque modification. |
| 2 | **`CREATE/DROP DATABASE` interdits** | Tables préfixées `wk_<uid8>_<card>_<table>` + `DROP TABLE` ciblés. |
| 3 | **`GET_LOCK` évité** (et interdit à l'apprenant) | Table `app_locks` avec expiration 30 s. |
| 4 | **Sessions révocables en base supprimées** | Sessions PHP natives (hors de portée du SQL). Perte : révocation centralisée — acceptable, justifiée par la sécurité. |
| 5 | **`INTERSECT`/`EXCEPT` (C41)** | Dépend de la version MySQL OVH (**≥ 8.0.31** requis). **Étape 1 : vérifier.** Si indisponible : reformuler C41 avec `NOT EXISTS`/`JOIN` (l'équivalence est déjà expliquée dans la carte) et adapter `expected`. |
| 6 | **Pas de `KILL QUERY`** sur requête longue | `max_execution_time` (SELECT) + `set_time_limit` PHP + refus de `SLEEP`/`BENCHMARK` + cap de lignes. Couverture légèrement inférieure sur DML long. |
| 7 | **Prolifération de tables `wk_*`** | Bornée par `apprenants × 8 cartes mutantes`. Ajouter `deploy/ovh/gc_workspaces.php` (suppression des tables `wk_` d'un profil supprimé / inactif) et surveiller le quota OVH. |
| 8 | **Intégrité des `seed_*` partagées** | Tables `seedref_*` + `repair_seed.sql` (§3.6). |
| 9 | **Parser SQL en PHP** | Dépendance `phpmyadmin/sql-parser` **vendored** (pas de composer sur mutualisé). Ne jamais s'appuyer sur le seul parser : allowlist de tokens + contrôle post-réécriture (étapes 5 et 7 du pipeline). |
| 10 | **Perf mutualisé** | Chaque `execute` mutant = reset (DROP+CREATE+INSERT) : quelques requêtes, acceptable pour l'usage visé ; à surveiller si l'usage s'élargit. |

---

## 9. Versioning

- Cible **`2.0.0`** (port majeur, rupture d'architecture).
- Champ `version` à mettre à jour dans `package.json` (racine + `api/` + `client/`) et dans la réponse
  `/api/health` **PHP** (`api/routes/health.php`).
- Entrée CHANGELOG `[2.0.0]` : « port PHP pour mutualisé OVH — API réécrite en PHP, isolation par
  tables préfixées, front React conservé », en listant les non-répliquables du §8.
- Le stack Node/Docker actuel **reste dans le dépôt** (référence + environnement de développement du
  contenu) ; `DEPLOY.md` doit renvoyer vers ce plan.
