# coursSQL — Conception détaillée (DESIGN)

> Livrable de la **section 12** du brief. La conception est **en cours d'implémentation** par tranches (voir §12.12).
> Version du document : **1.2.0** — voir `CHANGELOG.md`.
> Convention de langue : le **contenu pédagogique et l'interface** sont en français ; le **code, les identifiants techniques, les noms de variables et les commentaires** sont en anglais (section 9 du brief).

> **Révision 1.1.0 — raffinements validés par l'utilisateur.** Quatre changements structurants, intégrés ci-dessous :
> 1. **UI en cartes** : une notion = une **carte**. L'écran principal est une carte.
> 2. **Modules courts, plus nombreux** : chaque carte introduit **une seule notion** et la **valide immédiatement** par un exercice porté par la carte elle-même. Le parcours est re-découpé en **15 modules / 50 cartes** (§12.2).
> 3. **Progression par carte** : chaque carte porte **un exercice « gating » obligatoire** ; réussir cet exercice **débloque la carte suivante**. Les exercices détaillés antérieurs (`select-all-books`, `top-customers-2023`, `mark-books-returned`) deviennent des **exercices d'entraînement OPTIONNELS** (§12.3), sans effet sur la progression.
> 4. **Cartes validées navigables** : toute carte validée redevient **librement navigable** dans le menu (§12.2.b).
>
> **Décision d'isolation tranchée (§12.4.a)** : hybride centré sur une **base MySQL par utilisateur × exercice mutant** + **base seed partagée en lecture seule** pour les cartes `SELECT` ; **Docker-par-exercice écarté au MVP** à cause de la contrainte Docker-dans-WSL / API côté Windows.

## 12.0 — Décisions figées (révision 1.2.0)

Réponses de l'utilisateur aux questions ouvertes, désormais **actées** et reflétées dans les sections concernées.

| Sujet | Décision figée | Où c'est traité |
|---|---|---|
| **Portée MVP (contenu)** | On ne construit PAS les 50 cartes. On livre d'abord une **tranche verticale C1→C5** (concepts + `SELECT`/`FROM` + choix de colonnes) pour valider le mécanisme de bout en bout. | §12.12 |
| **Gating (bienveillant)** | Règle maintenue (réussir le gating débloque la suivante) **mais** : **essais illimités**, **aucun anti-blocage forcé**, **aucun verrouillage** de rythme. Indices/solution libres, sans pénalité dure. `solution_viewed ≠ réussite`. | §12.2.b |
| **Prérequis visibles** | Chaque carte affiche une **zone informative** listant les **cartes précédentes nécessaires** (prérequis notionnels). **Informatif, non bloquant.** Modélisé par `cards.prerequisites`. | §12.2.a, §12.5 |
| **Cartes quiz** | `role: quiz` autorisé **quand le format quiz est plus adapté** que rédiger du SQL (notions conceptuelles). Sinon `role: sql`. | §12.2, §12.6 |
| **Archivage tentatives** | On **archive le texte** de chaque tentative dans `exercise_attempts` (SQL soumis, horodatage, résultat/erreur). | §12.5 |
| **Erreurs SQL affichées** | **Exigence UX ferme** : si MySQL renvoie une erreur, on **affiche** un message pédagogique lisible (sans fuite de structure interne) pour corriger. La zone résultat montre **soit** le résultat **soit** l'erreur. | §12.7, §12.11 |
| **Locale** | **FR unique** (pas de multi-locale). Les **mots-clés/concepts techniques** restent en **anglais MySQL** (`SELECT`, `WHERE`, `JOIN`, `NULL`, `DECIMAL`…) — pas de traduction inventée. | §12.1 |
| **Déploiement** | **Mono-serveur**, exposé sur le réseau privé de l'hôte (`<host>:<port>`). Toute la pile (**MySQL + API + front**) tourne **via Docker Compose** → l'API atteint MySQL par le **réseau interne Compose** (nom de service). | §12.4, §12.4.c |
| **Nettoyage** | **Aucun reaper** au MVP. Conséquence maîtrisée : **une instance mutante par (user × exercice), réutilisée/réinitialisée** à la revisite → borné par `users × cartes-mutantes`, pas de création répétée. | §12.5, §12.8, §12.11 |
| **Instances mutantes simultanées** | Défaut : pool `EXECUTOR` `MAX_USER_CONNECTIONS = 20` ; provisioning sérialisé par `GET_LOCK`. Borne réelle = réutilisation (pas de prolifération). | §12.9 |
| **Timeouts / caps** | Défaut : **timeout requête apprenant = 3000 ms** ; **cap lignes retournées = 1000** ; **taille max requête = 4000 caractères** ; **multi-statements désactivés** ; **une instruction/soumission**. | §12.4.b |
| **Collation** | Défaut **`utf8mb4_0900_ai_ci`** (insensible casse/accents) ; exercices explicitement sensibles surchargent dans `schema.sql`. | §12.7 |
| **Versionnage exercice** | SemVer par exercice ; au bump, une carte mutante **migre au prochain reset** ; une base seed partagée **bascule immédiatement** vers `seed_<exo>@v`. | §12.5 |
| **Accessibilité** | Cible **WCAG 2.1 AA** ; états de carte = **couleur + icône + libellé** (jamais couleur seule). | §12.2.b |
| **Session** | **Cookie signé, `HttpOnly`, `SameSite=Lax`, `Secure` en prod** + table `user_sessions` révocable (opaque id). | §12.5, §12.10 |

### 12.4.b — Constantes d'exécution par défaut (justifiées)

- `QUERY_TIMEOUT_MS = 3000` — assez pour les agrégations/jointures sur petits jeux, assez court pour couper une boucle. Appliqué via hint `MAX_EXECUTION_TIME` (SELECT) + `KILL QUERY` (DML).
- `MAX_ROWS_RETURNED = 1000` — les jeux d'exercice font quelques dizaines de lignes ; 1000 protège l'UI/mémoire ; lecture bornée à `1000+1` pour signaler « tronqué ».
- `MAX_SQL_LENGTH = 4000` — large pour toute requête pédagogique, bloque les payloads abusifs.
- `MULTI_STATEMENTS = false`, `SINGLE_STATEMENT = true` — défaut `mysql2`, une instruction par soumission.
- `EXECUTOR MAX_USER_CONNECTIONS = 20`, `MAX_QUERIES_PER_HOUR = 20000` — garde-fous d'abus (Account Resource Limits).

## Sources officielles citées

Priorité aux sources officielles MySQL 8.4 LTS et aux références de sécurité reconnues.

- MySQL 8.4 — Privileges Provided by MySQL : https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html
- MySQL 8.4 — GRANT Statement : https://dev.mysql.com/doc/refman/8.4/en/grant.html
- MySQL 8.4 — CREATE USER Statement : https://dev.mysql.com/doc/refman/8.4/en/create-user.html
- MySQL 8.4 — Setting Account Resource Limits : https://dev.mysql.com/doc/refman/8.4/en/user-resources.html
- MySQL 8.4 — Optimizer Hints (`MAX_EXECUTION_TIME`) : https://dev.mysql.com/doc/refman/8.4/en/optimizer-hints.html
- MySQL 8.4 — General Security Issues : https://dev.mysql.com/doc/refman/8.4/en/general-security-issues.html
- MySQL 8.4 — Security Guidelines (moindre privilège) : https://dev.mysql.com/doc/refman/8.4/en/security-guidelines.html
- MySQL 8.4 — Making MySQL Secure Against Attackers : https://dev.mysql.com/doc/refman/8.4/en/security-against-attack.html
- MySQL 8.4 — Server System Variables (`max_execution_time`, `sql_mode`, `max_connections`, `read_only`, `super_read_only`) : https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html
- MySQL 8.4 — The `DECIMAL` Data Type (exactitude fixe) : https://dev.mysql.com/doc/refman/8.4/en/precision-math-decimal-characteristics.html
- MySQL 8.4 — `GET_LOCK()` / `RELEASE_LOCK()` (verrous applicatifs) : https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html
- MySQL 8.4 — Set Operations (`UNION`, `INTERSECT`, `EXCEPT`) : https://dev.mysql.com/doc/refman/8.4/en/set-operations.html
- OWASP — Query Parameterization Cheat Sheet : https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html
- OWASP — SQL Injection Prevention Cheat Sheet : https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- node `mysql2` — `multipleStatements` désactivé par défaut (sécurité) : https://github.com/sidorares/node-mysql2
- OWASP — Session Management Cheat Sheet (cookies `HttpOnly`/`SameSite`) : https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

---

## 12.1 — Hypothèses retenues

Chaque hypothèse est un choix qui sera confirmé/infirmé en section 16 (questions ouvertes).

1. **Public** : un adulte francophone, novice total en bases de données et peu à l'aise avec l'informatique. Objectif : rassurer, jamais intimider.
2. **Contexte de déploiement du MVP** : environnement personnel / familial / scolaire / démonstration, **de confiance**, potentiellement sur un seul serveur ou une machine locale via Docker Compose. Pas d'exposition Internet publique au MVP.
3. **Identification sans mot de passe** au MVP (imposé par le brief §7). Ce n'est **pas** de l'authentification : quiconque connaît le nom affiché accède au profil. Assumé et affiché à l'utilisateur.
4. **Un seul serveur MySQL 8.4 LTS**, partagé. Isolation **hybride** (§12.4.a) : une **base seed partagée en lecture seule** par version d'exercice pour les cartes `SELECT` ; une **base de travail par utilisateur × exercice** créée/détruite dynamiquement pour les exercices qui **modifient** les données (DML/DDL). **Pas de conteneur Docker par exercice** au MVP (contrainte Docker-dans-WSL, §12.4.a).
11. **UI en cartes** : l'unité d'apprentissage et l'unité d'écran sont la **carte** (une notion). Chaque carte porte **un exercice gating** dont la réussite débloque la carte suivante ; une carte validée reste **navigable** (§12.2).
12. **Deux natures de gating** : `sql` (validé sur le **résultat** d'exécution, la règle générale) et `quiz` (choix validé côté app) pour les toutes premières cartes conceptuelles (ce qu'est une table/colonne/type) qui précèdent l'écriture de SQL.
5. **Une seule instruction SQL par soumission** au MVP ; multi-statements désactivés côté driver (`multipleStatements: false`, le défaut de `mysql2`).
6. **Le jeu de données de chaque exercice est petit** (quelques dizaines de lignes max) et versionné dans le dépôt. La performance n'est pas un critère d'évaluation avant le module « index / EXPLAIN ».
7. **Le navigateur cible** est un navigateur de bureau moderne + mobile responsive. Pas de support IE.
8. **La validation se fait uniquement sur le résultat observable** (§4), jamais sur le texte de la requête.
9. **Langue** : contenu FR, code EN. **Locale FR unique** (pas de multi-locale, pas d'i18n). Les **mots-clés et concepts techniques MySQL** (`SELECT`, `WHERE`, `JOIN`, `NULL`, `DECIMAL`, `PRIMARY KEY`…) sont **cités en anglais** dans le texte FR — on ne traduit pas les mots-clés.
10. **Fuseau horaire** : le serveur MySQL et l'API tournent en **UTC** ; les colonnes temporelles des exercices utilisent `DATE`/`DATETIME` sans fuseau, avec des valeurs fixes versionnées, pour rendre la comparaison déterministe.

---

## 12.2 — Parcours pédagogique en cartes (une notion = une carte)

Progression en **spirale**, mais l'unité n'est plus le « gros module » : c'est la **carte**. Une carte introduit **une seule notion**, la montre par l'exemple, puis la **valide immédiatement** par son **exercice gating**. Réussir le gating **débloque la carte suivante** (§12.2.b). Les modules sont **courts et nombreux** (regroupements thématiques de 2 à 7 cartes), pour que l'apprenant avance par petits paliers rassurants. La numérotation (1)–(30) reprend celle du brief §1.

### Vue d'ensemble : 15 modules courts

| Module | Titre | Cartes | Notions (brief) | Gating dominant |
|---|---|---|---|---|
| **M1** | Découvrir une base | C1–C3 | (1) | `quiz` (avant SQL) |
| **M2** | Lire une table | C4–C6 | (2)(3)(4) | `sql` SELECT |
| **M3** | Filtrer (comparaisons) | C7–C8 | (5) | `sql` |
| **M4** | Combiner des conditions | C9–C11 | (6) | `sql` |
| **M5** | L'absence de valeur | C12–C13 | (7) | `sql` |
| **M6** | Filtres pratiques | C14–C16 | (8) | `sql` |
| **M7** | Trier & limiter | C17–C20 | (9)(10)(11) | `sql` |
| **M8** | Transformer les valeurs | C21–C24 | (12)(13) | `sql` |
| **M9** | Agréger | C25–C27 | (14) | `sql` |
| **M10** | Regrouper | C28–C29 | (15)(16) | `sql` |
| **M11** | Relier les tables | C30–C34 | (17)(18)(19)(20) | `quiz` + `sql` |
| **M12** | Requêtes imbriquées | C35–C41 | (21)(22)(23)(24) | `sql` |
| **M13** | Modifier les données | C42–C45 | (25)(26) | `sql` DML |
| **M14** | Concevoir un schéma | C46–C49 | (27)(28)(29) | `sql` DDL |
| **M15** | Projet final | C50 | (30) | `sql` multi |

**Décision** : **15 modules / 50 cartes** au lieu de 11 modules « gros ». **Alternative** : garder de gros modules avec exercices de synthèse en fin (conception 1.0.0). **Conséquence** : la charge cognitive par palier est minimale (1 notion), la progression est lisible dans le menu, et chaque notion est prouvée par un gating avant de continuer — au prix d'un menu plus long (atténué par le repli de modules validés, §12.2.b).

### Catalogue détaillé des 50 cartes

Chaque carte = **1 notion → 1 exercice gating**. « Réutilise » remobilise les notions déjà validées (spirale). Gating `sql` = validé sur le **résultat** (§12.7) ; `quiz` = choix validé côté app.

| Carte | Notion neuve (pt) | Gating (type) — ce que l'apprenant doit produire | Réutilise | Piège / erreur fréquente |
|---|---|---|---|---|
| C1 | Base, table (1) | `quiz` : repérer la table dans un schéma | — | Confondre base et table |
| C2 | Colonne, ligne (1) | `quiz` : distinguer une colonne d'une ligne / d'une valeur | C1 | « colonne = une valeur » |
| C3 | Types de données (1) | `quiz` : associer valeur ↔ type (INT/VARCHAR/DATE/DECIMAL) | C1–C2 | Nombre vs texte, date en texte |
| C4 | `SELECT * FROM` (2) | `sql` : afficher toute une table | — | Oublier `FROM` |
| C5 | Choisir des colonnes (3) | `sql` : afficher 2 colonnes précises | C4 | Colonne inexistante |
| C6 | Alias `AS` (4) | `sql` : renommer une colonne à l'affichage | C4–C5 | Croire que l'alias renomme en base |
| C7 | `WHERE` + `=` (5) | `sql` : filtrer sur une égalité | C4–C5 | `WHERE` avant `FROM` |
| C8 | Comparaisons `<,>,<=,>=,<>` (5) | `sql` : filtrer sur un seuil | C7 | `<>` vs `!=` ; bornes strictes |
| C9 | `AND` (6) | `sql` : deux conditions vraies ensemble | C7–C8 | Croire `AND` = « ou » |
| C10 | `OR` (6) | `sql` : l'une **ou** l'autre condition | C9 | `OR` élargit trop |
| C11 | `NOT` + parenthèses (6) | `sql` : négation + priorité explicite | C9–C10 | Priorité `AND`/`OR` sans `()` |
| C12 | `NULL` / `IS NULL` (7) | `sql` : trouver les lignes sans valeur | C7 | `= NULL` |
| C13 | `IS NOT NULL` (7) | `sql` : exclure les valeurs absentes | C12 | `<> NULL` |
| C14 | `IN (...)` (8) | `sql` : appartenance à une liste | C7,C10 | `IN` vs `=` |
| C15 | `BETWEEN` (8) | `sql` : plage inclusive | C8 | Bornes exclusives supposées |
| C16 | `LIKE` / `%` `_` (8) | `sql` : motif de texte | C7 | `LIKE` sans `%` |
| C17 | `ORDER BY` (9) | `sql` : trier croissant | C4–C5 | Croire que `SELECT` trie |
| C18 | `ORDER BY DESC` / multi-clés (9) | `sql` : tri décroissant, puis 2e clé | C17 | Sens du tri |
| C19 | `LIMIT` (10) | `sql` : « top N » (avec tri) | C17–C18 | `LIMIT` sans `ORDER BY` |
| C20 | `DISTINCT` (11) | `sql` : valeurs uniques d'une colonne | C5 | `DISTINCT` mal placé |
| C21 | Fonctions texte (12) | `sql` : `UPPER`/`CONCAT`/`LENGTH` | C6 | Concat avec `+` |
| C22 | Fonctions nombre (12) | `sql` : `ROUND`/`ABS`/arithmétique | C6 | Priorité arithmétique |
| C23 | Fonctions date (12) | `sql` : `YEAR`/`DATEDIFF` (dates fixes) | C6 | Comparer date à texte |
| C24 | `CASE` (13) | `sql` : catégoriser en colonne calculée | C6,C21 | Oublier `ELSE` |
| C25 | `COUNT` (14) | `sql` : compter des lignes | C7 | `COUNT(col)` ignore `NULL` |
| C26 | `SUM` / `AVG` (14) | `sql` : total / moyenne (DECIMAL) | C25 | Moyenne et `NULL` |
| C27 | `MIN` / `MAX` (14) | `sql` : extrêmes | C25 | Min sur texte |
| C28 | `GROUP BY` (15) | `sql` : agrégat par groupe | C25–C27 | Colonne non agrégée hors `GROUP BY` |
| C29 | `HAVING` (16) | `sql` : filtrer un agrégat | C28 | `WHERE` sur agrégat |
| C30 | Clés PK / FK (17) | `quiz` : repérer PK et FK dans un schéma | C1–C3 | Confondre PK et FK |
| C31 | `INNER JOIN` (18) | `sql` : relier 2 tables | C30,C7 | Produit cartésien |
| C32 | `LEFT JOIN` (19) | `sql` : garder les non-appariés | C31 | Confondre inner/left |
| C33 | Jointures multiples (20) | `sql` : relier 3 tables | C31 | Ambiguïté de colonnes |
| C34 | Autojointure (20) | `sql` : table jointe à elle-même | C31 | Alias de table oubliés |
| C35 | Sous-requête scalaire (21) | `sql` : comparer à une valeur calculée | C26,C8 | Sous-requête multi-lignes |
| C36 | Sous-requête liste `IN (SELECT …)` (21) | `sql` : filtrer par un ensemble calculé | C14,C35 | `NOT IN` + `NULL` |
| C37 | Sous-requête corrélée (21) | `sql` : dépend de la ligne courante | C36 | Oublier la corrélation |
| C38 | `EXISTS` / `NOT EXISTS` (22) | `sql` : présence/absence liée | C37 | `NOT EXISTS` vs `NOT IN` |
| C39 | CTE `WITH` (23) | `sql` : réécrire une requête en CTE | C35–C38 | Portée de la CTE |
| C40 | `UNION` (`ALL`) (24) | `sql` : empiler deux résultats | C5 | Colonnes incompatibles |
| C41 | `INTERSECT` / `EXCEPT` (24) | `sql` : intersection / différence | C40 | Dispo MySQL 8.4 (8.0.31+) |
| C42 | `INSERT` (25) | `sql` **DML** : ajouter une ligne (vérif cachée) | C3 | Types/ordre des colonnes |
| C43 | `UPDATE … WHERE` (25) | `sql` **DML** : modifier les bonnes lignes | C7,C12 | `UPDATE` sans `WHERE` |
| C44 | `DELETE … WHERE` (25) | `sql` **DML** : supprimer les bonnes lignes | C43 | `DELETE` sans `WHERE` |
| C45 | Transactions `COMMIT`/`ROLLBACK` (26) | `sql` **DML** : annuler par `ROLLBACK` | C43–C44 | Oublier `COMMIT` |
| C46 | `CREATE TABLE` (27) | `sql` **DDL** : créer une table typée | C3 | Type inadapté |
| C47 | `ALTER TABLE` (27) | `sql` **DDL** : ajouter une colonne | C46 | Contrainte sur données existantes |
| C48 | Contraintes PK/FK/NOT NULL/UNIQUE (28) | `sql` **DDL** : poser des contraintes | C30,C46 | FK vers colonne non indexée/PK |
| C49 | Index + intro `EXPLAIN` (29) | `sql` : créer un index, lire un plan | C48 | Croire qu'un index change le résultat |
| C50 | Projet final (30) | `sql` multi : scénario combinant filtrage, jointures, agrégats, sous-requêtes, éventuellement DML | tous | Décomposition insuffisante |

**Notes de conception**

- **`quiz` pour C1–C3 et C30** : ces notions sont **conceptuelles** et précèdent (ou ne nécessitent pas) l'écriture de SQL. Leur gating est un **choix validé côté app** (`gating.kind: quiz`), pas une exécution SQL — évite d'exiger du SQL avant de l'avoir enseigné, tout en gardant la règle « toute notion validée par un exercice ».
- **`INTERSECT`/`EXCEPT` (C41)** : disponibles en MySQL 8.4 (introduits en 8.0.31) — voir Set Operations. Traités pleinement ; les équivalents `JOIN`/`NOT EXISTS` sont montrés en aparté « pour aller plus loin ».
- **Aucune carte ne mobilise une notion non encore validée** : garanti par `prerequisite_concepts` du manifeste (§12.6) + test statique (§12.14 #15) vérifiant que le gating d'une carte n'emploie que des concepts de position ≤ la sienne.
- **Exercices de synthèse** : portés par les dernières cartes d'un thème (C11, C24, C29, C33/C34, C39, C50) et par les **exercices d'entraînement optionnels** (§12.3).

### 12.2.a — Anatomie d'une carte (écran principal)

Une carte suit l'ordre imposé par le brief §2, condensé sur **un seul écran** :

0. **Zone « Prérequis »** (informative, en tête de carte) : liste des **cartes précédentes nécessaires** pour aborder la notion (ex. C7 → « Nécessite : C4 *Lire une table*, C5 *Choisir des colonnes* »). **Purement indicatif, jamais bloquant** ; chaque prérequis est un lien vers la carte concernée. Alimentée par `cards.prerequisites` (§12.5).
1. **Titre + notion** (1 phrase). 2. **Explication** courte (un seul concept, terme technique défini à sa 1re apparition). 3. **Exemple SQL** lisible + **résultat commenté**. 4. **Exercice gating** : énoncé FR, schéma/données initiales en petits tableaux, éditeur SQL (ou choix pour `quiz`), bouton **Exécuter**, **zone résultat OU erreur** (voir ci-dessous), message de validation. 5. **Indices** dévoilables progressivement. 6. **Solution** masquée par défaut + courte explication. 7. Bouton **Réinitialiser** (recharge données initiales pour les cartes mutantes ; simple vidage pour les cartes SELECT). 8. Bloc **« Pour s'entraîner »** listant les exercices **optionnels** rattachés (n'affecte pas la progression).

**Zone résultat/erreur (exigence UX ferme)** : après un `Exécuter`, la zone affiche **exactement l'un** des trois cas : (a) **résultat** (tableau de lignes/colonnes) + verdict `pass`/`fail` ; (b) **erreur SQL** rendue en **message pédagogique lisible** (ex. « Colonne inconnue `titre` — vérifie l'orthographe des colonnes ») pour que l'apprenant **corrige**, sans exposer la structure interne ni le message brut du serveur ; (c) **timeout** (« Requête interrompue : trop longue »). L'erreur n'est jamais masquée.

**Décision** : tout tient sur la carte, l'apprenant pratique **avant** de longues explications. **Alternative** : leçon paginée (explication → page exercice). **Conséquence** : la carte réduit les allers-retours et matérialise « 1 notion = 1 palier » ; le contenu long est renvoyé aux indices/solution repliés.

### 12.2.b — États d'une carte et navigation (menu de progression)

Le menu (hiérarchie **Module > Carte**) reflète l'état par carte. **Jamais la couleur seule** : couleur **+ icône + libellé** (brief §8, accessibilité).

| État (technique) | Libellé FR | Navigable ? | Débloque la suivante ? | Repère visuel |
|---|---|---|---|---|
| `locked` | Verrouillé | non | — | 🔒 grisé |
| `available` | Accessible (à faire) | oui (carte courante) | non (gating non réussi) | ▶ contour bleu |
| `in_progress` | Commencé | oui | non | ✎ demi-cercle |
| `validated` | Validé | **oui, librement** | **oui** | ✔ plein vert |
| `validated_after_hint` | Validé (avec indice) | **oui, librement** | **oui** | ✔ vert + 💡 |
| *(drapeau)* `solution_viewed` | Solution consultée | selon état | **non** à lui seul | 👁 badge |

- **Règle de gating (bienveillante)** : la carte `N+1` passe de `locked` à `available` **uniquement** quand la carte `N` atteint `validated`/`validated_after_hint`. Mais l'accès au gating est **sans friction** : **essais illimités**, **aucun anti-blocage** ni gating « allégé » forcé, **aucun verrouillage de rythme** ni délai imposé. Le nombre d'essais est **compté à titre indicatif** (`attempts_count`) mais **ne limite jamais**. Indices et solution restent **librement accessibles** ; les consulter n'inflige **aucune pénalité dure** (au plus le badge `💡`/`👁`).
- **Navigation libre des cartes validées** : toute carte `validated*` reste **rejouable et consultable** à volonté ; y revenir ne change pas la progression déjà acquise. Les cartes `locked` restent inaccessibles (403 côté API).
- **`solution_viewed` ≠ réussite** : consulter la solution pose le **drapeau** `solution_viewed` mais **ne valide jamais** la carte ni ne débloque la suivante (brief §4/§7). L'apprenant doit quand même réussir le gating (le badge 👁 reste ensuite affiché).
- **Reprise** : au retour, le menu ouvre la **dernière carte `available`/`in_progress`** ; toutes les cartes validées restent accessibles au-dessus.

---

## 12.3 — Exercices : gating (sur la carte) + entraînement optionnel

Depuis la révision 1.1.0 il faut distinguer deux **rôles** d'exercice (même format de manifeste, §12.6, avec un champ `role`) :

- **`gating`** — l'exercice **obligatoire** porté par une carte ; sa réussite débloque la carte suivante. Court, ciblé sur **la seule notion** de la carte. Exemple compact ci-dessous.
- **`practice`** — exercice **optionnel** d'entraînement, rattaché à une carte ou à un module, **sans effet sur la progression**. Les trois exercices détaillés ci-dessous (`select-all-books`, `top-customers-2023`, `mark-books-returned`) sont désormais des **`practice`**. Ils restent pleinement spécifiés et servent de synthèse/approfondissement et de bancs de test.

### Exemple de gating (carte C7 · `WHERE` + `=`) — `gate-where-equals`

- **Rôle** : `gating` · **Carte** : C7 · **Concept** : `WHERE col = valeur` · **Type d'exécution** : `select`.
- **Énoncé (FR)** : « Affiche les livres dont l'année (`year`) est exactement **1943**. »
- **Table `books`** (réutilise le seed de C4) : mêmes 4 lignes qu'en §12.3-A ci-dessous.
- **Solution officielle** : `SELECT * FROM books WHERE year = 1943;`
- **Résultat attendu** : les 2 lignes `Le Petit Prince` (multi-ensemble, doublons comptés, 4 colonnes).
- **Comparaison** : `order_sensitive:false`, `compare_column_names:false`, `null_is_distinct:true`.
- **Indices** : (1) « Filtrer = `WHERE`. » (2) « Égalité stricte : `year = 1943`. »
- **Isolation** : `permissions: read_only` → **base seed partagée** (aucune instance par utilisateur, §12.4.a).

> Chaque carte `sql` possède un gating de ce gabarit : minimal, une notion, données déjà connues. Les cartes `quiz` (C1–C3, C30) portent un gating de type choix (pas de SQL).

### Exercices d'entraînement OPTIONNELS (`practice`) — entièrement spécifiés

> Ces trois exercices **ne conditionnent pas** la progression. Ils sont rattachés respectivement à C4/C20 (débutant), au module M12 (multi-concepts) et à C43 (DML + reset).

### Exercice A — Très débutant · `select-all-books`

- **Identifiant technique** : `select-all-books`
- **Rôle / Carte** : `practice` (optionnel) · rattaché à **C4** (`SELECT *`) et **C20** (`DISTINCT`)
- **Concept principal** : `SELECT * FROM table`
- **Concepts réutilisés** : aucun (premier exercice pratique)
- **Énoncé (FR)** : « Affiche **toutes les colonnes de tous les livres** de la table `books`. »
- **Schéma** : une table.

Table `books`

| Colonne | Type | Clé | Notes |
|---|---|---|---|
| `id` | `INT` | PK | |
| `title` | `VARCHAR(80)` | | |
| `author` | `VARCHAR(80)` | | peut être `NULL` |
| `year` | `INT` | | |

- **Données initiales** (seed) :

| id | title | author | year |
|---|---|---|---|
| 1 | Les Misérables | Victor Hugo | 1862 |
| 2 | Le Petit Prince | Antoine de Saint-Exupéry | 1943 |
| 3 | Contes anonymes | *NULL* | 1875 |
| 4 | Le Petit Prince | Antoine de Saint-Exupéry | 1943 |

> Piège pédagogique : ligne 4 = doublon quasi total de la ligne 3 (titre/auteur/année) mais `id` différent → montre plus tard l'intérêt de la PK et de `DISTINCT`. Auteur `NULL` en ligne 3.

- **Solution officielle** : `SELECT * FROM books;`
- **Résultat attendu** : les 4 lignes ci-dessus, 4 colonnes.
- **Comparaison** : multi-ensemble (ordre ignoré, doublons comptés), colonnes attendues = 4, alias non évalués, NULL significatif.
- **Indices** (dévoilables) : (1) « Une lecture commence par `SELECT`. » (2) « `*` veut dire *toutes les colonnes*. » (3) « Précise la table avec `FROM books`. »
- **Explication de la solution** : `SELECT` choisit les colonnes, `*` les prend toutes, `FROM books` indique où lire.
- **Type d'exécution** : lecture (`SELECT`) → comparaison directe des lignes.

### Exercice B — Multi-concepts · `top-customers-2023`

- **Identifiant technique** : `top-customers-2023`
- **Rôle / Module** : `practice` (optionnel) · synthèse après **M11** (réutilise M3→M11)
- **Concept principal** : `INNER JOIN` + `GROUP BY` + `HAVING` + `ORDER BY`
- **Concepts réutilisés** : `WHERE`, comparaisons, `SUM`, alias, tri
- **Énoncé (FR)** : « Pour les commandes passées en **2023**, affiche le **nom du client** et le **total dépensé** (`total_spent`), **uniquement** pour les clients dont le total dépasse **100 €**, **du plus gros au plus petit**. »
- **Schéma** : deux tables liées.

Table `customers`

| Colonne | Type | Clé |
|---|---|---|
| `id` | `INT` | PK |
| `name` | `VARCHAR(60)` | |

Table `orders`

| Colonne | Type | Clé |
|---|---|---|
| `id` | `INT` | PK |
| `customer_id` | `INT` | FK → `customers.id` |
| `order_date` | `DATE` | |
| `amount` | `DECIMAL(8,2)` | |

- **Données initiales** :

`customers`

| id | name |
|---|---|
| 1 | Alice |
| 2 | Bruno |
| 3 | Chloé |
| 4 | David |

`orders`

| id | customer_id | order_date | amount |
|---|---|---|---|
| 1 | 1 | 2023-02-10 | 60.00 |
| 2 | 1 | 2023-07-01 | 45.50 |
| 3 | 2 | 2023-05-20 | 100.00 |
| 4 | 2 | 2022-12-31 | 500.00 |
| 5 | 3 | 2023-03-03 | 70.00 |
| 6 | 3 | 2023-03-04 | 70.00 |
| 7 | 1 | 2024-01-02 | 999.00 |

> Pièges : Bruno a une grosse commande **hors 2023** (ne compte pas) et une commande **égale à 100** (doit être *exclue* car « dépasse 100 » = strictement `> 100`). David n'a **aucune** commande (absent du résultat avec `INNER JOIN`). Alice a une commande en 2024 à ignorer. Chloé a deux montants identiques (test des doublons dans `SUM`). `DECIMAL` pour éviter l'imprécision flottante.

- **Solution officielle** :
```sql
SELECT c.name AS name, SUM(o.amount) AS total_spent
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.order_date >= '2023-01-01' AND o.order_date < '2024-01-01'
GROUP BY c.id, c.name
HAVING SUM(o.amount) > 100
ORDER BY total_spent DESC;
```
- **Résultat attendu** :

| name | total_spent |
|---|---|
| Alice | 105.50 |
| Chloé | 140.00 |

- **Comparaison** : `ordered` (car l'énoncé demande un classement) → l'ordre des lignes **est** vérifié ; 2 colonnes ; noms d'alias `name`/`total_spent` **évalués** (font partie du concept) ; `total_spent` en `DECIMAL`, comparaison exacte, pas de tolérance flottante.
- **Indices** : (1) « Deux tables à relier : par quelle colonne commune ? » (2) « Filtrer 2023 = une plage de dates, pas seulement l'année via une fonction. » (3) « Regrouper par client, puis filtrer le regroupement avec `HAVING`. » (4) « `> 100` est *strict*. »
- **Explication de la solution** : la jointure relie commandes et clients ; `WHERE` réduit aux dates 2023 ; `GROUP BY` agrège par client ; `HAVING` filtre l'agrégat ; `ORDER BY ... DESC` classe.

### Exercice C — Modifie les données, nécessite un reset · `mark-books-returned`

- **Identifiant technique** : `mark-books-returned`
- **Rôle / Carte** : `practice` (optionnel) · rattaché à **C43** (`UPDATE ... WHERE`)
- **Concept principal** : `UPDATE ... WHERE`
- **Concepts réutilisés** : `WHERE`, comparaisons, `NULL`, `IS NOT NULL`
- **Énoncé (FR)** : « Dans la table `loans`, marque comme **rendus** (mets `returned = 1`) **tous les emprunts effectivement retournés**, c'est-à-dire ceux dont la date de retour `return_date` **n'est pas vide**. Ne touche pas aux autres. »
- **Schéma** :

Table `loans`

| Colonne | Type | Clé | Notes |
|---|---|---|---|
| `id` | `INT` | PK | |
| `book_title` | `VARCHAR(80)` | | |
| `return_date` | `DATE` | | `NULL` si non rendu |
| `returned` | `TINYINT(1)` | | 0/1, vaut 0 au départ |

- **Données initiales** :

| id | book_title | return_date | returned |
|---|---|---|---|
| 1 | Les Misérables | 2023-06-01 | 0 |
| 2 | Le Petit Prince | *NULL* | 0 |
| 3 | Contes | 2023-06-02 | 0 |
| 4 | Dune | *NULL* | 0 |

> Pièges : deux lignes ont `return_date` = `NULL` → ne doivent **pas** être marquées ; test direct de `IS NOT NULL` vs `= ''`.

- **Solution officielle** :
```sql
UPDATE loans SET returned = 1 WHERE return_date IS NOT NULL;
```
- **Type d'exécution** : **DML** → pas de comparaison de lignes retournées ; à la place, exécution d'une **requête de vérification CACHÉE** (`expected.sql`) sur l'état final :
```sql
-- expected.sql (hidden verification, run by the EXECUTOR after the user's statement)
SELECT id, returned FROM loans ORDER BY id;
```
- **État final attendu** :

| id | returned |
|---|---|
| 1 | 1 |
| 2 | 0 |
| 3 | 1 |
| 4 | 0 |

- **Comparaison** : `ordered` par `id` (choisi par la requête de vérification cachée) ; l'apprenant est libre de la forme de son `UPDATE`.
- **Indices** : (1) « Modifier des lignes = `UPDATE`, pas `SELECT`. » (2) « Sélectionne les bonnes lignes avec `WHERE`. » (3) « *Pas vide* pour une date se dit `IS NOT NULL`. »
- **Reset nécessaire** : oui — l'exercice modifie l'état ; le bouton **Réinitialiser** reconstruit `loans` à partir de `schema.sql` + `seed.sql` (voir §12.8). Idempotent.

---

## 12.4 — Architecture technique proposée

### Vue d'ensemble (Docker Compose, local)

```
Navigateur (React + TypeScript)
        │  HTTPS
        ▼
┌───────────────────┐
│   Nginx           │  reverse proxy + static + TLS + rate-limit edge
└─────────┬─────────┘
          │  HTTP JSON (interne)
          ▼
┌───────────────────┐        ┌──────────────────────────┐
│  API (Node + TS)  │───────▶│  App DB  (MySQL schema    │
│  - auth léger     │  pool  │  `coursql_app`)           │
│  - progression    │  APP_RW│  users, progress, ...     │
│  - orchestration  │        └──────────────────────────┘
└───┬───────────┬───┘
    │           │
    │ pool      │ pool
    │ PROVISIONER (DDL bases exo)   EXECUTOR (SQL non fiable, restreint)
    ▼           ▼
┌──────────────────────────────────────────────────────────┐
│  MySQL 8.4 LTS  (une seule instance, PAS de Docker/exo)   │
│   seed_<exo>@v   (base SEED partagée, LECTURE SEULE,      │
│                   1 par version d'exercice SELECT)        │
│   ex_<hash> ...  (base de TRAVAIL par user × exercice     │
│                   MUTANT : DML/DDL uniquement)            │
└──────────────────────────────────────────────────────────┘
```

### Responsabilités précises

- **Nginx** : terminaison TLS ; sert les fichiers statiques du client React ; reverse proxy vers l'API (`/api/*`) ; en-têtes de sécurité (`Content-Security-Policy`, `X-Content-Type-Options`, etc.) ; rate-limiting périmétrique (`limit_req`) comme première barrière avant l'API. Ne parle **jamais** à MySQL.
- **Client React + TypeScript** : rend les **cartes** (FR) ; éditeur SQL (CodeMirror) ; envoie les requêtes de l'apprenant à l'API ; affiche résultats/erreurs/validation ; **ne détient jamais** la solution ni la requête de validation avant qu'elles soient nécessaires (§4).
- **API (Node + TypeScript)** : cœur applicatif. Sous-modules logiques : `auth` (identification légère, sessions) ; `progress` (progression par carte + gating) ; `content` (lecture des cartes et manifestes versionnés) ; `exercise-orchestrator` (préparation d'instance, exécution, validation, reset). C'est le **seul** composant qui décide *quel* pool utiliser pour *quelle* action.
- **Service d'exécution SQL** : au MVP, **un module** de l'API (pas un microservice séparé) qui exécute le SQL non fiable **via le pool EXECUTOR**, avec timeout, cap de lignes, statement unique. Isolé par *identifiants MySQL restreints*, pas par processus. Il vise **la base seed partagée (lecture seule)** pour les cartes `SELECT`, ou **la base de travail `ex_<hash>`** de l'utilisateur pour les cartes mutantes (§12.4.a).
- **Provisionneur** : module de l'API utilisant le pool **PROVISIONER** pour `CREATE DATABASE`/`DROP DATABASE`/`GRANT`. Il crée **une fois par version** les bases seed partagées, et **à la demande** les bases de travail mutantes. **Ne reçoit jamais** le SQL de l'apprenant (§6).
- **MySQL 8.4 LTS** : héberge la base applicative (`coursql_app`), les bases **seed partagées** en lecture seule et les bases de **travail** `ex_<hash>` éphémères. `sql_mode` strict, `max_execution_time` par défaut, comptes à privilèges séparés.
- **Système de progression** : tables applicatives (`user_progress`, `exercise_attempts`) + logique de déblocage (spirale) dans l'API. Écrit toujours via le pool **APP_RW**, requêtes **paramétrées**.

### Décision : provisionneur vs exécuteur — deux jeux d'identifiants MySQL (MVP)

- **Décision recommandée** : **un seul service (l'API)**, mais **trois comptes MySQL distincts** = trois pools de connexions :
  1. `coursql_app` — CRUD sur `coursql_app` uniquement (base applicative).
  2. `coursql_provisioner` — droits de création/suppression/GRANT limités au *motif* des bases de travail.
  3. `coursql_executor` — droits **minimaux** (voir §12.9), utilisé pour le SQL non fiable.
- **Pourquoi** : la frontière de sécurité qui compte est la **frontière de privilèges MySQL** (moindre privilège — voir Security Guidelines), pas la frontière de processus. Trois comptes suffisent à garantir que le SQL non fiable ne peut atteindre ni la base applicative ni les autres bases de travail.
- **Alternative 1 — deux services OS séparés (executor en microservice)** : meilleure défense en profondeur (un plantage/faille de l'exécuteur n'expose pas le code d'orchestration), permet de le mettre dans un conteneur plus contraint (seccomp, réseau restreint). **Conséquence** : plus de complexité opérationnelle ; **retenu comme évolution post-MVP** (§12.13).
- **Alternative 2 — un seul compte MySQL pour tout** : simple mais **inacceptable** (le SQL non fiable pourrait lire/écrire la base applicative). Rejetée.

### 12.4.a — DÉCISION : stratégie d'isolation de l'exécution

Trois options ont été pesées. Rappel du critère : le SQL de l'apprenant est **non fiable** et deux apprenants (ou deux tentatives) ne doivent jamais interférer, surtout dès qu'un exercice **modifie** les données.

| Critère | (a) **Une seule BDD partagée** | (b) **Une BDD MySQL par user × exercice** (1 instance) | (c) **Un container Docker par exercice à la volée** |
|---|---|---|---|
| Isolation lecture (`SELECT`) | OK (lecture seule) | OK | OK (surdimensionné) |
| Isolation écriture (DML/DDL) | ❌ **collisions** entre users/tentatives | ✅ base dédiée par couple | ✅ frontière OS/kernel |
| Besoin de Docker | non | **non** | **oui** |
| Contrainte **Docker-dans-WSL / API Windows** | — | — | ⚠️ **spawn + réseau complexes** (voir ci-dessous) |
| Latence de préparation | nulle | faible (`CREATE DATABASE` + seed) | élevée (démarrage container ; warm pool requis) |
| Coût ressources | minimal | faible (schémas légers) | élevé (un moteur MySQL par exo/instance) |
| Reset propre | trivial (rien à isoler) mais **impossible sans casser autrui** en écriture | ✅ `DROP`+`CREATE` ciblé, idempotent (§12.8) | ✅ jeter le container |
| Complexité opérationnelle | faible | **modérée** | **élevée** (orchestration, cycle de vie, nettoyage) |

**Le point Docker-dans-WSL (signalé par l'utilisateur), traité explicitement.** Sur cette machine, **Docker s'exécute dans WSL2** tandis que l'**API Node tourne côté Windows**. L'option (c) impliquerait, à chaque exercice, que l'API Windows **spawn** des containers vivant dans la VM WSL et **s'y connecte par le réseau** : franchissement de la frontière Windows↔WSL (résolution d'IP/port de la VM, mapping de ports instables au redémarrage, `docker` CLI ou socket exposé côté Windows), démarrages lents, cycle de vie et nettoyage fragiles, et une surface d'attaque/faille opérationnelle bien plus grande — **pour un bénéfice de sécurité que (b) obtient déjà** via le moindre privilège MySQL. Conclusion : **(c) est écarté au MVP**.

**Décision recommandée — HYBRIDE (b) + base seed partagée, sans Docker) :**

1. **Cartes `SELECT` (l'immense majorité, ~44/50)** → exécution **en lecture seule** sur une **base seed PARTAGÉE** `seed_<exo>@<version>`, créée **une seule fois par version d'exercice** et jouée pour tous les utilisateurs. L'EXECUTOR n'y a que `SELECT` : **aucune écriture possible → aucune collision → aucune instance par utilisateur**, coût quasi nul, latence nulle. Le « reset » d'une carte SELECT est vide (rien à restaurer).
2. **Cartes MUTANTES `DML`/`DDL` (~6/50 : C42–C49 + practice DML)** → **option (b)** : une **base de travail dédiée `ex_<hash>` par couple user × exercice**, provisionnée à la demande depuis `schema.sql`+`seed.sql`, GRANT DML/DDL **borné à cette seule base**, reset idempotent (§12.8). C'est là, et seulement là, qu'on paie le coût de l'isolation forte — précisément parce que « une seule BDD partagée » (option a) y **casserait** (collisions entre utilisateurs, l'inconvénient que l'utilisateur a lui-même pointé).

- **Pourquoi cet hybride** : il applique le **moindre privilège** et « ne paie l'isolation que là où elle est nécessaire ». Il **élimine (a)** pour l'écriture (collisions) tout en **profitant de (a)** pour la lecture (partage sûr), et **évite (c)** et sa complication Docker/WSL.
- **Conséquences** : deux familles de bases à gérer (seed partagées vs travail par-user) — géré par le champ `permissions`/`role` du manifeste (§12.6) et l'aiguillage de l'orchestrateur. Une base seed partagée doit rester **strictement** en lecture seule (garanti par les GRANT, §12.9) ; si un jour un exercice « SELECT » devait écrire, il bascule en famille mutante.
- **Évolution à l'échelle (post-MVP, §12.13)** : (i) **warm pool** de bases `ex_*` pré-provisionnées pour masquer la latence ; (ii) **sharding** sur plusieurs instances MySQL ; (iii) pour une charge **réellement hostile / multi-tenant public**, revenir vers une isolation type (c) — mais alors avec l'**EXECUTOR déployé DANS WSL/Linux** (à côté de Docker), supprimant la frontière Windows↔WSL, plutôt que piloté depuis Windows.

### 12.4.c — Topologie de déploiement (mono-serveur, Docker Compose)

**Décision** : **toute la pile tourne via Docker Compose** — pas seulement MySQL. Ainsi l'API et MySQL sont **deux conteneurs sur le même réseau Compose** ; l'API joint MySQL par **nom de service** (`mysql:3306`), **jamais** par une IP d'hôte.

```
Client (navigateur)
        │  http(s)://<host>:8080
        ▼
[ Docker Compose network "coursql" ]
   ┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
   │  app        │ ──▶ │  (Nginx prod) │ ──▶ │  mysql  (mysql:8.4)  │
   │  Node+TS    │     │  reverse proxy│     │  coursql_app         │
   │  API + front│     └──────────────┘     │  seed_* / ex_*       │
   └─────────────┘                          └─────────────────────┘
        ▲ published port 8080 → écouté sur l'hôte
```

- **Pourquoi tout en Compose** : la seule frontière restante est **un port publié** (`8080`) exposé à l'hôte. C'est un point unique, stable, sans dépendance à une IP interne. Toute la communication API↔MySQL reste **intra-Compose** (DNS de service), ce qui **élimine** le problème de frontière signalé pour Docker-par-exercice.
- **Exposition** : le port publié est atteint sur le réseau privé de l'hôte. Pas d'exposition Internet publique. TLS/Nginx = durcissement (le slice actuel peut servir en clair sur le réseau privé).
- **Alternative rejetée** : MySQL en conteneur + **API hors conteneur sur l'hôte** → réintroduit une frontière hôte↔conteneur (IP/port instables, mapping fragile). Rejetée pour la même raison que Docker-par-exercice.
- **Conséquence dev** : `docker compose up` **dans un terminal WSL** à la racine du projet (monté depuis `<project>`). Un seul point d'accès pour l'utilisateur.

---

## 12.5 — Modèle de données applicatif (`coursql_app`)

Toutes les requêtes de l'app vers ces tables sont **paramétrées** (OWASP Query Parameterization).

### Tables et colonnes clés

**`users`**

| Colonne | Type | Contraintes |
|---|---|---|
| `id` | `BINARY(16)` | PK (UUID interne, jamais dérivé du nom) |
| `display_name` | `VARCHAR(40)` | non nul |
| `name_normalized` | `VARCHAR(40)` | **UNIQUE**, non nul (nom normalisé : trim, casefold, espaces compactés) |
| `created_at` | `DATETIME` | non nul |
| `last_active_at` | `DATETIME` | nul |

**`modules`** : `id` (PK `SMALLINT`), `slug` (UNIQUE, ex. `M7`), `title_fr`, `position` (ordre spirale, UNIQUE).

**`cards`** : unité pédagogique (1 notion). `id` (PK), `module_id` (FK→modules), `slug` (UNIQUE, ex. `C7`), `title_fr`, `position` (ordre global, UNIQUE — définit l'ordre de déblocage), `concept_slug`, `gating_exercise_id` (FK→exercises, l'exercice **obligatoire** de la carte), `gating_kind` (`ENUM('sql','quiz')`), `prerequisites` (`JSON`, liste de slugs de cartes prérequises — **affiché à titre informatif** sur la carte, §12.2.a ; **non bloquant**). Le déblocage suit `position` croissante.

**`exercises`** : `id` (PK), `card_id` (FK→cards, la carte de rattachement), `role` (`ENUM('gating','practice')`), `slug` (UNIQUE, = identifiant technique du manifeste, ex. `gate-where-equals`, `select-all-books`), `position`, `current_version_id` (FK→exercise_versions, nullable au chargement). Un seul `role='gating'` par carte (= `cards.gating_exercise_id`) ; 0..n `role='practice'`.

**`exercise_versions`** : `id` (PK), `exercise_id` (FK), `version` (`VARCHAR`, semver), `manifest_hash` (`CHAR(64)`, SHA-256 du manifeste+fichiers), `isolation` (`ENUM('shared_seed','per_user')` — dérivé de `permissions`), `seed_db_name` (`CHAR(48)`, nullable ; nom de la base seed partagée si `shared_seed`), `created_at`. **UNIQUE**(`exercise_id`, `version`). Assure la reproductibilité : une instance/base connaît la version exacte dont elle est née.

**`user_progress`** : état par **(user, card)** — la progression est portée par la **carte**, pas par chaque exercice. `user_id` (FK), `card_id` (FK), `status` (`ENUM('locked','available','in_progress','validated','validated_after_hint')`), `attempts_count` (`INT`), `hint_used` (`BOOL`), `solution_viewed` (`BOOL`), `last_attempt_at`, `first_validated_at`. **PK composite** (`user_id`, `card_id`). Index sur (`user_id`, `status`).

> Règles métier (voir §12.2.b) : (1) une carte devient `validated`/`validated_after_hint` **seulement** quand son **gating** est réussi ; cela fait passer la carte de `position+1` de `locked` à `available`. (2) `solution_viewed = TRUE` **n'implique jamais** `validated` (brief §4/§7) : c'est un drapeau d'affichage. (3) Réussir un exercice `practice` **ne change pas** `user_progress` (entraînement).

**`exercise_attempts`** : journal append-only. `id` (PK `BIGINT`), `user_id`, `exercise_id`, `card_id`, `exercise_version_id`, `submitted_sql` (`TEXT` — **on archive le texte** de la tentative, décision 1.2.0), `submitted_at`, `outcome` (`ENUM('pass','fail','error','timeout','blocked')`), `duration_ms`, `error_category` (catégorie pour l'affichage, jamais le message brut MySQL en base — voir §12.11). Index (`user_id`, `card_id`, `submitted_at`).

**`exercise_instances`** : lien (user × exercise) ↔ base de travail MySQL, **uniquement pour les exercices `per_user` (mutants)** — les exercices `shared_seed` (SELECT) n'ont **pas** d'instance (ils lisent la base seed partagée). `id` (PK), `user_id`, `exercise_id`, `exercise_version_id`, `db_name` (`CHAR(40)`, ex. `ex_<hash>`, **UNIQUE**), `state` (`ENUM('provisioning','ready','resetting','error','reaped')`), `lock_token` (`CHAR(36)`, nullable), `created_at`, `last_used_at`. **UNIQUE**(`user_id`, `exercise_id`). Index sur `last_used_at` (nettoyage périodique).

> Les **bases seed partagées** ne sont pas des instances par-utilisateur : elles sont décrites par `exercise_versions.seed_db_name` et créées une fois par version (idempotent).
>
> **Pas de reaper au MVP (décision 1.2.0)** : une instance mutante est **créée une seule fois par (user × exercice) puis réutilisée** ; à la revisite ou au bouton Réinitialiser, on **réinitialise la base existante** (`DROP`+recrée son contenu) au lieu d'en créer une nouvelle. Le nombre de bases `ex_*` est donc **borné par `users × cartes-mutantes`**, sans accumulation. Le nettoyage éventuel (retrait de version, purge manuelle) est repoussé post-MVP.

**`user_sessions`** : `id` (`CHAR(64)`, PK, opaque), `user_id` (FK), `created_at`, `expires_at`, `revoked_at`. Le cookie de session est **signé, `HttpOnly`, `SameSite=Lax`, `Secure`** (OWASP Session Management).

### Contraintes et index utiles

- FK partout avec `ON DELETE RESTRICT` (on ne supprime pas un user avec progression au MVP).
- `name_normalized` UNIQUE = anti-doublons de noms.
- `db_name` UNIQUE = jamais deux instances sur la même base.
- Index couvrant (`user_id`, `status`) sur `user_progress` pour le menu de progression.
- `exercise_instances(last_used_at)` pour le reaper.

---

## 12.6 — Format EXACT d'un manifeste d'exercice

Organisation fichiers versionnés (brief §5), un dossier par exercice :

```
exercises/
  top-customers-2023/
    manifest.yaml
    schema.sql        -- DDL of the work database (tables only, no app tables)
    seed.sql          -- INSERT of the initial dataset
    solution.sql      -- reference query (never sent to client early)
    expected.sql      -- hidden verification query (DML/DDL exercises) OR empty for pure SELECT
    hints.json        -- progressive hints (FR)
```

### `manifest.yaml` — schéma exact

```yaml
# manifest.yaml — all technical identifiers in English; learner-facing text in French.
id: top-customers-2023            # stable technical id == exercises.slug
version: 1.0.0                    # semver; bump on any change to schema/seed/solution/expected
title_fr: "Meilleurs clients de 2023"
role: practice                    # enum: gating | practice  (gating = mandatory, unlocks next card)
card: C33                         # owning card slug; gating exercises are 1:1 with their card
module: M11                       # attached as end-of-module synthesis practice
main_concept: inner-join
prerequisite_concepts:            # used to enforce "no unseen notion" (see §12.2)
  - select
  - where
  - comparison
  - group-by
  - having
  - order-by
  - sum
  - alias
statement_fr: >
  Pour les commandes passées en 2023, affiche le nom du client et le total dépensé,
  uniquement pour les clients dont le total dépasse 100 €, du plus gros au plus petit.

execution:
  type: select                    # enum: select | dml | ddl
  max_rows_returned: 1000         # hard cap enforced by executor
  timeout_ms: 2000                # MAX_EXECUTION_TIME hint + statement guard
  single_statement: true

permissions: read_only            # enum: read_only | dml | ddl  → maps to EXECUTOR grants (§12.9)
                                  # read_only  -> isolation=shared_seed (shared read-only DB, no per-user instance)
                                  # dml | ddl  -> isolation=per_user    (dedicated ex_<hash> per user, resettable §12.8)

schema_file: schema.sql
seed_file: seed.sql
solution_file: solution.sql
verification:
  # For type=select: comparison is done on the user's result set directly.
  # For type=dml/ddl: after running the user's statement, executor runs expected_query
  #                   and compares its result to expected_result.
  expected_file: expected.sql     # optional; required when type != select
comparison:
  order_sensitive: true           # true only when the statement asks for a ranking/order
  compare_column_names: true      # true only when alias/naming is part of the assessed concept
  compare_types: true
  null_is_distinct: true          # NULL != '' and NULL != 0, always
  decimal_exact: true             # DECIMAL compared exactly, no float conversion
  float_tolerance: null           # set only when the exercise genuinely computes floats, e.g. 1e-9
expected_result:                  # canonical expected rows (multiset unless order_sensitive)
  columns: [name, total_spent]
  rows:
    - ["Alice", "105.50"]
    - ["Chloé", "140.00"]

scenario: store                   # library | store | movies | orders | school | employees
tables:                           # schema mirror for UI rendering (source of truth stays schema.sql)
  - name: customers
    columns:
      - { name: id, type: INT, pk: true }
      - { name: name, type: VARCHAR(60) }
  - name: orders
    columns:
      - { name: id, type: INT, pk: true }
      - { name: customer_id, type: INT, fk: customers.id }
      - { name: order_date, type: DATE }
      - { name: amount, type: DECIMAL(8,2) }
```

`hints.json` :
```json
{ "hints": [
  "Deux tables à relier : par quelle colonne commune ?",
  "Filtrer 2023 = une plage de dates, pas seulement l'année via une fonction.",
  "Regrouper par client, puis filtrer le regroupement avec HAVING.",
  "« Plus de 100 » est strict : > 100."
] }
```

- **Décision** : `manifest.yaml` (lisible humain) + fichiers `.sql`/`.json` séparés. **Alternative** : tout en un seul JSON. **Conséquence** : YAML + SQL séparés = plus lisible, versionnable, et le SQL reste du SQL (coloration, lint). Le `manifest_hash` (SHA-256 de l'ensemble) garantit l'intégrité et la reproductibilité de version.

### 12.6.a — Règles d'authoring des cartes (obligatoires)

Principes à respecter pour **toute** carte, présents et futurs (C1→C50) :

1. **L'exercice gating ≠ l'exemple** : la requête solution du gating **ne doit jamais être identique à la requête montrée en EXEMPLE** sur la même carte. L'exemple *illustre* la notion ; l'énoncé demande une **variation** (autre colonne, autre table, autre valeur, condition déjà vue) qui **force l'application** du concept plutôt que le copier-coller.
   - *Exemple* : si l'exemple montre `SELECT * FROM books;`, l'exercice demande `SELECT * FROM members;` (autre table) ; si l'exemple filtre `WHERE year = 1943`, l'exercice filtre `WHERE author = 'Victor Hugo'`.
   - Vérifiable automatiquement : normaliser (trim/casse/espaces) `exampleSql` et `solutionSql` et **refuser l'égalité** (test d'authoring, §12.14).
2. **Une seule notion neuve** par carte ; tout le reste réutilise des notions **déjà validées** (spirale). L'exercice n'emploie **aucune** notion non encore introduite (`prerequisites`).
3. **Format `quiz`** uniquement quand il est **plus adapté** qu'écrire du SQL (notions conceptuelles : ce qu'est une table, un type, une clé). Sinon `sql`.
4. **Zone prérequis** renseignée (`prerequisites`, informative, non bloquante, §12.2.a).
5. **Indices progressifs** (du plus doux au plus précis) + **solution** masquée + **explication** courte. Gating **bienveillant** (essais illimités).
6. **Données révélatrices (« les données révèlent le concept »)** — *règle forte* (brief §3 « valeurs limites ») : le seed d'un exercice **doit contenir le cas-limite** qui rend la notion testée **significative**, de sorte qu'une **variante plausible mais fausse produise un résultat DIFFÉRENT** de la solution correcte. Sans ce cas-limite, l'exercice « valide » sans rien prouver.
   - **Comparaisons `<` vs `<=`** : une ligne **pile sur la borne** (ex. un livre en 1943 quand on filtre `< 1943`) — sinon strict et non-strict donnent le même résultat *(défaut corrigé sur C8)*.
   - **`AND` vs `OR`** : colonnes **décorrélées** (ex. un auteur qui a AUSSI un livre hors de l'année testée) — sinon `AND` et `OR` coïncident *(défaut corrigé sur C9 : ajout d'un livre de Saint-Exupéry en 1931)*.
   - **`BETWEEN`** : des valeurs **exactement sur les bornes** (bornes incluses) — sinon indistinguable d'un intervalle strict.
   - **`IS NULL`** : au moins un `NULL` réel ; **`DISTINCT`** : de vrais doublons ; **`LEFT JOIN`** : des lignes non appariées ; **`ORDER BY`** : des égalités qui justifient une 2ᵉ clé de tri.
   - **Vérification** : pour chaque carte SELECT, contrôler (au moins en test manuel/CI) que `expected(solution) ≠ résultat(variante à un opérateur/erreur près)`. Un test d'authoring peut exécuter la solution et une variante contre le seed et **exiger des résultats différents**.

---

## 12.7 — Fonctionnement détaillé de l'exécution et de la validation

### Chemin d'une soumission

1. Le client envoie `POST /api/exercises/:slug/execute` avec `{ sql }` et le cookie de session.
2. L'API vérifie la session, charge le manifeste (version) et **aiguille selon l'isolation** :
   - `shared_seed` (cartes `SELECT`) → cible la **base seed partagée** `seed_<exo>@v` en **lecture seule** ; **aucune instance** par-utilisateur, rien à provisionner.
   - `per_user` (cartes mutantes) → résout l'`exercise_instance` de l'utilisateur (état `ready`), la **provisionnant** si absente (§12.8).
3. **Garde-fous côté API (avant MySQL)** : longueur max (ex. 4 000 caractères) ; refus si plusieurs instructions (parsing léger : une seule instruction terminée) ; rate-limit par user (ex. N exécutions / minute).
4. L'API exécute le SQL **via le pool EXECUTOR**, connecté **à la base cible** (`USE seed_<exo>@v` pour `shared_seed`, `USE ex_<hash>` pour `per_user`), avec :
   - `multipleStatements: false` (défaut `mysql2`) → les multi-statements sont rejetés par le driver.
   - un **timeout** : hint `MAX_EXECUTION_TIME(N)` injecté pour les `SELECT` (Optimizer Hints) **et** garde applicatif (annulation/`KILL QUERY` sur dépassement) pour couvrir le DML que le hint ne borne pas.
   - un **cap de lignes** : on lit au plus `max_rows_returned + 1` lignes ; si dépassement, résultat tronqué + drapeau « trop de lignes ».
5. **Selon `execution.type`** :
   - **`select`** → on récupère le result set de l'apprenant et on le compare au `expected_result` (voir règles ci-dessous).
   - **`dml` / `ddl`** → on exécute l'instruction de l'apprenant, **puis** l'API (toujours pool EXECUTOR, en lecture) exécute `expected.sql` (requête de vérification **cachée**) et compare **son** résultat au `expected_result`. On valide **l'état final**, pas la syntaxe.
6. L'API renvoie `{ status: pass|fail|error|timeout, columns, rows (tronquées pour affichage), diff (si fail), message_fr }`. **Jamais** la solution ni `expected.sql`.

### Règles de comparaison (brief §4) — précises

- **Multi-ensemble par défaut** : ordre des lignes ignoré, **doublons comptés**. Implémentation : on trie les deux ensembles par une clé canonique (tuple de valeurs sérialisées de façon déterministe) puis on compare. Si `order_sensitive: true`, on **ne trie pas** et on compare position par position.
- **Nombre de colonnes** : doit être égal, sinon `fail` immédiat avec message « nombre de colonnes différent ».
- **Noms/alias de colonnes** : comparés **seulement** si `compare_column_names: true`.
- **Types** : comparés si `compare_types: true`. Sérialisation canonique par type pour éviter les faux négatifs (voir ci-dessous).
- **`NULL`** : traité comme une valeur distincte, **jamais** égale à `''` ni à `0` (`null_is_distinct: true`). Sérialisé par un sentinel réservé (ex. jeton non ambigu) dans la clé canonique.
- **`DECIMAL`** : comparé **exactement** en tant que chaîne décimale normalisée (même échelle), **sans** passage par `float` (voir DECIMAL characteristics). Jamais de tolérance sur DECIMAL.
- **Flottants** : comparaison avec `float_tolerance` **uniquement** si l'exercice calcule réellement des flottants (`float_tolerance` non nul).
- **DATE/DATETIME** : valeurs fixes versionnées ; serveur en UTC ; sérialisées en `YYYY-MM-DD[ HH:MM:SS]`. Pas de dépendance à `NOW()` dans les exercices de comparaison.
- **Casse/collation** : le seed fixe une collation déterministe (ex. `utf8mb4_0900_as_cs` pour les exercices où la casse compte, sinon `utf8mb4_0900_ai_ci`), précisée dans `schema.sql`. La comparaison applicative compare les chaînes **octet à octet** après extraction (pas de re-collation côté app), pour rester prévisible.
- **Résultat vide** : un ensemble vide attendu est un cas valide ; `[]` == `[]` → `pass`.
- **Erreur SQL** : `outcome=error`, **le message pédagogique est renvoyé au client et AFFICHÉ** (exigence UX, §12.2.a/§12.11) pour que l'apprenant corrige ; **jamais** de validation, et **jamais** le message brut MySQL ni de structure interne. Le mapping catégorie→message FR est centralisé (ex. `ER_BAD_FIELD_ERROR` → « Colonne inconnue : vérifie l'orthographe. »). Le texte de la tentative est archivé (`exercise_attempts.submitted_sql`).

### Séquence (texte)

```
Client──POST /execute──▶ API
API: check session, load instance+manifest
API: guards (length, single-statement, rate-limit)
API──EXECUTOR pool, USE ex_hash──▶ MySQL: run user SQL (timeout, row cap)
  ├─ type=select: fetch rows ─────────────────▶ compare(user_rows, expected_result)
  └─ type=dml/ddl: run user SQL ; then run expected.sql ▶ compare(verif_rows, expected_result)
API: record attempt; if role=gating & pass ⇒ card validated ⇒ unlock next card
     (role=practice ⇒ attempt logged, progression unchanged)
API──JSON {status, message_fr, diff}──▶ Client
```

---

## 12.8 — Déroulement détaillé du reset (idempotent)

> **Portée** : le reset ne concerne que les exercices `per_user` (mutants). Une carte `SELECT` sur **base seed partagée** est en lecture seule : il n'y a **rien à restaurer** (le bouton Réinitialiser vide juste l'éditeur/résultat côté client). Ce qui suit décrit le reset des bases `ex_<hash>`.

Objectif (brief §5) : reconstruire **uniquement** la base de travail du couple (user, exercice), sans toucher à la progression ni aux autres bases. Étapes, exécutées par l'**orchestrateur** (pool PROVISIONER pour la DDL, pool EXECUTOR pour la vérif) :

1. **Verrouiller l'instance user–exercice** : poser un verrou pour empêcher toute exécution/reset concurrent. Deux niveaux :
   - verrou applicatif en base (`exercise_instances.state = 'resetting'` via `UPDATE ... WHERE state <> 'resetting'`, gagné par un seul appelant) ;
   - **`GET_LOCK('reset:'+db_name, timeout)`** MySQL comme garde inter-processus (Locking Functions). Si non obtenu → renvoyer « réinitialisation déjà en cours », pas d'action.
2. **Empêcher l'exécution concurrente** : tant que `state='resetting'`, `POST /execute` renvoie `409 Conflict` (« exercice en cours de réinitialisation »).
3. **Supprimer UNIQUEMENT la base concernée** : `DROP DATABASE IF EXISTS ex_<hash>;` (PROVISIONER, dont les droits sont limités au motif `ex_%` — §12.9). `IF EXISTS` rend l'étape idempotente.
4. **Recréer depuis les fichiers versionnés** : `CREATE DATABASE ex_<hash> ...` avec collation du manifeste ; jouer `schema.sql` puis `seed.sql` (version = `exercise_version_id` de l'instance, pas forcément la dernière — reproductibilité).
5. **Restaurer les permissions** : (ré)appliquer les `GRANT` de l'EXECUTOR sur `ex_<hash>` selon `permissions` du manifeste (`read_only`/`dml`/`ddl`).
6. **Vérifier l'initialisation** : requête de sanité (EXECUTOR, lecture) — ex. compter les lignes attendues du seed ; si écart → `state='error'`.
7. **Rendre l'exercice disponible** : `state='ready'`, `last_used_at` mis à jour, libérer `GET_LOCK`.
8. **NE PAS effacer la progression** : `user_progress` et `exercise_attempts` restent intacts (aucune écriture sur eux pendant le reset).

### Idempotence & récupération propre en cas d'échec

- **Idempotence** : chaque étape est rejouable. `DROP ... IF EXISTS` + `CREATE` reconstruit un état identique quel que soit l'état de départ. Rejouer le reset après un demi-échec produit le même état final.
- **Échec en cours de reset** :
  - Si crash entre 3 et 4 (base supprimée, pas recréée) → l'instance reste `resetting`/`error`. Au prochain `execute` ou reset, l'orchestrateur détecte `state != ready` et **relance le reset complet** (auto-heal). Le `GET_LOCK` est libéré automatiquement à la fin de la session/connexion MySQL, évitant un verrou orphelin.
  - Si crash après 4 mais avant 5 (base recréée, GRANT manquants) → étape 6 échoue (l'EXECUTOR ne peut lire) → `state='error'` → reset relancé.
  - Un **reaper** périodique repère les instances bloquées en `resetting`/`provisioning` depuis > seuil et les remet en file de reset.
- **Deux resets simultanés** : seul celui qui obtient `GET_LOCK` + gagne l'`UPDATE` conditionnel agit ; l'autre reçoit « déjà en cours ». Testé (brief §11).

---

## 12.9 — Modèle de permissions MySQL (moindre privilège)

Fondé sur MySQL 8.4 *Security Guidelines* (ne pas accorder plus que nécessaire) et *Privileges Provided by MySQL*.

### Trois comptes

**1. `coursql_app`** — base applicative uniquement
```sql
CREATE USER 'coursql_app'@'%' IDENTIFIED BY '<secret>'
  WITH MAX_USER_CONNECTIONS 50;
GRANT SELECT, INSERT, UPDATE, DELETE ON `coursql_app`.* TO 'coursql_app'@'%';
-- No access to exercise work databases, no DDL, no admin privileges.
```

**2. `coursql_provisioner`** — cycle de vie des bases de travail seulement
```sql
CREATE USER 'coursql_provisioner'@'%' IDENTIFIED BY '<secret>';
-- Database-level grant scoped to the ex_% naming pattern (LIKE-style wildcard in db name):
GRANT CREATE, DROP, GRANT OPTION, SELECT, INSERT, INDEX, ALTER, REFERENCES
  ON `ex\_%`.* TO 'coursql_provisioner'@'%';
-- It can create/drop/grant on ex_* databases and load schema+seed.
-- It NEVER receives learner SQL. No access to coursql_app. No global admin privileges.
```
> Note : le motif `` `ex\_%` `` échappe l'underscore pour ne viser que les bases préfixées `ex_`. `GRANT OPTION` limité à ce motif permet à ce compte de (ré)accorder les droits de l'EXECUTOR sur les bases qu'il crée, sans pouvoir toucher aux autres.

**3. `coursql_executor`** — exécute le SQL non fiable, minimal
```sql
CREATE USER 'coursql_executor'@'%' IDENTIFIED BY '<secret>'
  WITH MAX_USER_CONNECTIONS 20
       MAX_QUERIES_PER_HOUR 20000;   -- resource cap (see Account Resource Limits)
-- SHARED SEED databases (SELECT cards, isolation=shared_seed): read-only, granted ONCE per version.
GRANT SELECT ON `seed_<exo>_v<version>`.* TO 'coursql_executor'@'%';  -- read-only => no collisions

-- PER-USER work databases (mutating cards), grants applied PER database, matching `permissions`:
-- dml (adds write DML):
GRANT SELECT, INSERT, UPDATE, DELETE ON `ex_<hash>`.* TO 'coursql_executor'@'%';
-- ddl (adds schema changes, still scoped to the one work db):
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON `ex_<hash>`.* TO 'coursql_executor'@'%';
```

> **Isolation par les GRANT** : sur une base `seed_*` l'EXECUTOR n'a **que `SELECT`** → il ne peut rien y modifier, donc le partage entre utilisateurs est sûr (l'inconvénient d'une « BDD partagée » n'existe que pour l'écriture, écartée ici). Les bases `ex_*` reçoivent l'écriture **une par une**, jamais en `ex\_%.*`.

### Interdits explicites (pour l'EXECUTOR)

- Aucun privilège **global** (`*.*`) ; aucun accès à `coursql_app`, `mysql`, `information_schema` au-delà du strict nécessaire, ni aux autres `ex_*`.
- Pas de `FILE` (pas de `LOAD DATA INFILE`/`INTO OUTFILE` → pas d'accès disque serveur).
- Pas de `PROCESS`, `SUPER`, `SHUTDOWN`, `CREATE USER`, `RELOAD`, `REPLICATION *`, `EVENT`, `TRIGGER` inutile.
- Multi-statements désactivés (driver) ; une instruction par soumission (API).
- `MAX_USER_CONNECTIONS` + `MAX_QUERIES_PER_HOUR` (Account Resource Limits) bornent l'abus.

### Décisions & alternatives

- **Décision** : GRANT au **niveau base** ciblés par base de travail, appliqués/retirés au provisioning/reset. **Alternative** : un GRANT large `ex\_%.*` fixe à l'EXECUTOR → plus simple mais **casse l'isolation inter-exercices** (un user pourrait viser une autre base `ex_*` s'il en devine le nom). **Conséquence** : on garde le GRANT par-base malgré le léger surcoût, car l'isolation user×exercice est un critère d'acceptation (§11).
- **Décision** : timeouts via **`MAX_EXECUTION_TIME` (SELECT)** + garde applicatif (`KILL QUERY`) pour DML. **Alternative** : ne compter que sur `max_execution_time` système → ne borne pas le DML (le hint et la variable ne s'appliquent qu'aux `SELECT` en lecture seule). **Conséquence** : double garde nécessaire.

---

## 12.10 — Routes principales de l'API (HTTP JSON)

Autorisation : sauf mention, toute route requiert une **session valide** (cookie signé `HttpOnly`/`SameSite`). Les corps sont paramétrés côté SQL applicatif.

| Méthode | Chemin | Corps | Réponse | Erreurs principales | Autorisation |
|---|---|---|---|---|---|
| `POST` | `/api/users` | `{ display_name }` | `201 { user_id, display_name }` | `409` nom déjà pris (normalisé) ; `400` nom invalide | public |
| `POST` | `/api/sessions` | `{ display_name }` | `200 + Set-Cookie` ; `{ user_id }` | `404` user inconnu ; `429` | public |
| `DELETE` | `/api/sessions/current` | — | `204` | — | session |
| `GET` | `/api/progress` | — | `200 { modules:[{ id, title_fr, cards:[{ slug, title_fr, status }] }] }` | `401` | session (self) |
| `GET` | `/api/cards/:slug` | — | `200 { card, concept, explanation_fr, example, gating:{ exercise_slug, kind }, statement_fr, tables, practice_slugs:[] }` (sans solution) | `403` verrouillé (`locked`) ; `404` | session ; carte non `locked` |
| `POST` | `/api/exercises/:slug/instance` | — | `200 { isolation, instance_id?, state, schema, seed_preview }` | `403` carte verrouillée ; `409` provisioning | session ; carte accessible (`per_user` seulement) |
| `POST` | `/api/exercises/:slug/execute` | `{ sql \| choice }` | `200 { status, columns, rows, message_fr, diff?, card_validated?, next_card_slug? }` | `400` trop long / multi-stmt ; `409` resetting ; `429` ; `422` erreur SQL pédagogique | session ; carte accessible |
| `POST` | `/api/exercises/:slug/hint` | `{ index }` | `200 { hint_fr, remaining }` | `404` plus d'indice | session ; marque `hint_used` (si `gating`) |
| `POST` | `/api/exercises/:slug/solution` | — | `200 { solution_sql, explanation_fr }` | `403` | session ; marque `solution_viewed` (**ne valide pas**) |
| `POST` | `/api/exercises/:slug/reset` | — | `202 { state:'resetting' }` puis `ready` ; `200 { noop:true }` si `shared_seed` | `409` déjà en cours | session ; propriétaire de l'instance |
| `GET` | `/api/cards/:slug/next` | — | `200 { next_slug \| null }` | — | session |

> **Règles d'autorisation transverses** : une session ne peut agir que sur **ses** instances (`exercise_instances.user_id == session.user_id`) ; l'accès à une carte exige que son `status` **ne soit pas `locked`** (les cartes `validated*` restent librement navigables, §12.2.b). Seul un `execute` sur l'exercice **`gating`** peut faire passer la carte à `validated` et débloquer la suivante (`card_validated`/`next_card_slug` dans la réponse) ; un `execute` sur un `practice` renvoie le résultat **sans** toucher la progression. Le serveur ne renvoie **jamais** `solution_sql`/`expected.sql` avant les routes dédiées.

---

## 12.11 — Principaux risques + protections

| Risque | Protection | Source |
|---|---|---|
| SQL non fiable atteint la base applicative | Comptes séparés ; EXECUTOR sans droit sur `coursql_app` ; SQL libre routé **uniquement** vers EXECUTOR | Security Guidelines |
| Un user accède à la base d'un autre | Nom de base = hash interne (jamais le nom user) ; GRANT EXECUTOR **par base** ; instance liée à `user_id` | brief §5 |
| Collision entre users sur données partagées | Base seed partagée en **lecture seule** (EXECUTOR = `SELECT` only) → aucune écriture possible ; écriture ⇒ base `ex_<hash>` **par user** (§12.4.a) | brief §5 |
| Injection dans les requêtes **de l'app** | Requêtes **paramétrées** partout (jamais de concaténation) ; identifiants de base validés contre une allowlist `^ex_[0-9a-f]{...}$` | OWASP Query Parameterization / SQL Injection Prevention |
| Multi-statements / `; DROP ...` | `multipleStatements:false` (mysql2) + parsing « une instruction » côté API | mysql2 |
| Requête trop longue / boucle | `MAX_EXECUTION_TIME` (SELECT) + `KILL QUERY` (DML) + timeout de connexion | Optimizer Hints |
| Résultat volumineux (OOM) | Cap `max_rows_returned` + lecture bornée `+1` | brief §6 |
| Abus / déni de service | Rate-limit Nginx + rate-limit API par user + `MAX_USER_CONNECTIONS`/`MAX_QUERIES_PER_HOUR` | Account Resource Limits |
| Accès disque serveur | Pas de privilège `FILE` ; `LOAD DATA LOCAL` désactivé côté serveur | Making MySQL Secure Against Attackers |
| Fuite d'infos via messages d'erreur | **Catégorisation** des erreurs → messages pédagogiques FR mappés (`syntax`, `unknown_column`, `unknown_table`, `type_mismatch`, `timeout`), jamais le message MySQL brut ni de structure interne | brief §6 |
| Détournement de session | Cookie **signé, `HttpOnly`, `SameSite=Lax`, `Secure`** ; expiration ; révocation | OWASP Session Management |
| Prolifération d'instances (pas de reaper au MVP) | **Une instance par (user × exercice), réutilisée/réinitialisée** → borne `users × cartes-mutantes`, aucune accumulation (§12.5) ; reaper repoussé post-MVP | décision 1.2.0 |
| Reset concurrent corrompt l'instance | `GET_LOCK` + `UPDATE` conditionnel d'état ; idempotence | Locking Functions |
| « Identification » prise pour de l'auth | Bandeau explicite : sans mot de passe = pas sécurisé ; réservé environnement de confiance ; évolution PIN prévue | brief §7 |

---

## 12.12 — Périmètre précis du MVP

**Tranche verticale 0 (livrée EN PRIORITÉ, pour valider le mécanisme)** — cartes **C1→C5** :
- C1–C3 (`quiz` : base/table, colonne/ligne, types), C4 (`SELECT * FROM`), C5 (choix de colonnes) — au moins **une carte SELECT réellement exécutée** contre la **base seed en lecture seule**, validée par **comparaison de résultat**, avec **gating** et **affichage des erreurs SQL**.
- Pile complète minimale : Docker Compose (MySQL 8.4 + app) dans WSL ; API Node/TS (session/login, get card, execute, hint, solution, next, progression) ; client React/TS avec l'UI en cartes (dont **zone prérequis**) ; les **3 comptes MySQL** (moindre privilège) au moins pour la tranche.
- But : l'utilisateur **lance et teste** les premières cartes de bout en bout avant qu'on construise la suite.

**MVP complet (après validation de la tranche)** :
- **UI en cartes** : écran-carte complet (§12.2.a), menu **Module > Carte** avec les 6 états visuels (couleur **+ icône + libellé**, §12.2.b), navigation libre des cartes validées.
- **Modules M1–M10 jouables** (cartes C1→C29 : découverte → regroupement), + **au moins une carte mutante** (C43 `UPDATE`) pour prouver la chaîne DML/reset de bout en bout, + squelette M11.
- **Règle de gating** : chaque carte débloquée par la réussite de son exercice `gating` ; au moins quelques exercices `practice` optionnels (les 3 de §12.3).
- Gating `sql` (validé sur résultat, multi-ensemble) **et** `quiz` (C1–C3, C30).
- Identification sans mot de passe (create / login / logout / reprise de progression) avec avertissement.
- **Isolation hybride** (§12.4.a) : bases **seed partagées lecture seule** pour les cartes SELECT ; bases `ex_<hash>` par (user, exercice) pour les cartes mutantes ; trois comptes MySQL ; **pas de Docker par exercice**.
- Exécution `SELECT` + validation multi-ensemble ; exercice **DML** avec vérification cachée + reset idempotent (verrou).
- Manifestes versionnés (fichiers, avec `role`) + migrations versionnées (base app) ; reaper basique.
- Docker Compose (Nginx, API, MySQL) ; timeouts, caps, rate-limit.
- Tests d'acceptation §12.14 (sécurité, comparaison, **gating/déblocage**).

**Exclu du MVP** (voir §12.13) : PIN/auth réelle ; conteneur Docker par exercice ; multi-statements ; i18n ; modules M12–M15 complets ; éditeur avancé (autocomplétion schéma) ; télémétrie fine ; multi-locale.

---

## 12.13 — Évolutions post-MVP

- **Sécurité d'exécution renforcée** : EXECUTOR en **service isolé** (conteneur dédié, réseau restreint, seccomp) — Alternative 1 de §12.4.
- **Isolation par conteneur/instance** : une instance MySQL éphémère (ou base « jetable » plus fortement cloisonnée) par exécution pour les cours avancés — cf. comparaison ci-dessous.
- **Authentification** : PIN ou lien de connexion à usage unique ; passage à des sessions authentifiées.
- **Contenu** : compléter M7–M10, exercices de synthèse, projet final ; banque d'exercices étendue.
- **Pédagogie** : détection fine du type d'erreur → indices contextuels ; visualisation du diff résultat obtenu/attendu.
- **Scalabilité** : pool de bases pré-provisionnées (« warm pool ») ; sharding par serveur MySQL ; file d'exécution.
- **i18n** : externalisation des textes FR, ajout de locales.

### Comparaison des stratégies d'isolation (brief §5)

La comparaison à **3 options (a/b/c) et la décision hybride** sont désormais traitées en **§12.4.a** (avec le point Docker-dans-WSL). Résumé de la trajectoire :

- **MVP** : hybride **(b) base par user×exercice mutant + base seed partagée en lecture seule** ; **(a) BDD unique** écartée pour l'écriture (collisions) ; **(c) Docker par exercice** écarté (frontière Windows↔WSL).
- **Échelle** : warm pool de bases `ex_*`, sharding multi-instances MySQL, puis — seulement si charge hostile/multi-tenant public — bascule vers une isolation type (c) avec **l'EXECUTOR déployé dans WSL/Linux** (plus de frontière Windows↔WSL à franchir).

---

## 12.14 — Critères d'acceptation (dérivés du brief §11)

Chaque critère = au moins un test automatisé (unitaire ou intégration).

1. Deux requêtes **différentes mais équivalentes** (ex. `WHERE` réordonné, `JOIN` vs sous-requête) → **acceptées**.
2. Bonne requête avec **ordre différent** → acceptée **si** `order_sensitive:false`.
3. **Ordre vérifié** quand l'exercice demande un classement (`order_sensitive:true`).
4. **Doublons** comparés correctement (multi-ensemble : 3 lignes identiques ≠ 1 ligne).
5. **`NULL`** traité comme distinct de `''` et `0`.
6. **`DECIMAL`** comparé exactement (pas de dérive flottante).
7. Un user **ne peut pas** accéder à la base d'un autre (test : viser `ex_*` d'autrui → refus par privilèges).
8. Un exercice **ne peut pas** modifier un autre exercice/instance.
9. Une **requête dangereuse** (`DROP`, accès `coursql_app`, `LOAD DATA`) **n'atteint pas** la base applicative → bloquée/erreur pédagogique.
10. **Requête trop longue** arrêtée par timeout, message clair, transaction/connexion saine ensuite.
11. **Reset** restaure **exactement** les données initiales (comparaison octet à octet du seed).
12. **Deux resets simultanés** ne corrompent pas l'instance (un seul agit).
13. **Solution consultée** ne met **pas** `status=passed`.
14. **Progression conservée** après déconnexion/reconnexion.
15. Un exercice avancé **n'emploie aucune** notion non encore introduite (test statique sur `prerequisite_concepts`).
16. **Gating** : réussir l'exercice `gating` d'une carte la passe à `validated` et débloque **exactement** la carte de `position+1` (ni avant, ni au-delà).
17. **Practice ≠ progression** : réussir (ou rater) un exercice `practice` **ne modifie pas** `user_progress`.
18. **Navigation** : une carte `validated*` reste accessible et rejouable ; une carte `locked` renvoie `403` sur `GET /api/cards/:slug` et sur `execute`.
19. **Carte SELECT partagée** : deux utilisateurs exécutant des `SELECT` sur la même base seed n'interfèrent pas et ne peuvent rien y écrire (GRANT `SELECT` seul).
20. **Quiz gating** : une carte `quiz` (C1–C3, C30) se valide par le bon choix, sans exécution SQL.

---

## 12.15 — Ordre de développement conseillé (sans durée artificielle)

Séquence par dépendances, chaque étape livrable et testable :

1. **Squelette repo** : `package.json` (version `1.0.0`), `README`, `CHANGELOG`, Docker Compose (Nginx, API, MySQL 8.4), migrations de la base app.
2. **Comptes & isolation MySQL** : 3 comptes + **bases seed partagées (lecture seule)** + provisioning/reset d'une base `ex_<hash>` mutante (avant toute UI). Tests §11 #7,#8,#11,#12,#19.
3. **Moteur d'exécution + validation** : EXECUTOR, aiguillage seed/instance, timeouts, caps, comparateur multi-ensemble (NULL/DECIMAL/ordre). Tests §11 #1–#6,#9,#10.
4. **Format d'exercice & cartes** : chargeur de manifestes (`role`), hash de version, modèle carte→gating→exercices, 3 exercices `practice` de §12.3 + gating de gabarit.
5. **Progression par carte** : identification & sessions ; règle de gating (déblocage), « solution ≠ réussite », navigation des cartes validées. Tests #13,#14,#16,#17,#18.
6. **API** : routes §12.10 (cards + exercises) branchées sur 2–5.
7. **Client React (cartes)** : écran-carte (§12.2.a), éditeur, gating `sql`/`quiz`, menu **Module > Carte** avec les 6 états accessibles (§12.2.b).
8. **Contenu M1–M10** : cartes C1→C29 (+ C43 mutante) en spirale ; test statique des prérequis (#15) et du gating (#20).
9. **Robustesse** : reaper, rate-limit, messages d'erreur pédagogiques, journaux sans secret.
10. **Durcissement & docs** : revue sécurité (moindre privilège), guide de contribution d'exercices.

---

## 12.16 — Questions à trancher avant l'implémentation

> **Toutes tranchées** en **1.2.0** — voir le tableau **§12.0** (portée, gating bienveillant, prérequis visibles, quiz, archivage SQL, erreurs affichées, locale FR + mots-clés EN, déploiement mono-serveur Docker Compose, pas de reaper + réutilisation d'instance, timeouts/caps, collation, versionnage, accessibilité WCAG AA, session). Résolutions antérieures : *isolation* hybride sans Docker (§12.4.a), *`INTERSECT`/`EXCEPT`* pleins (C41), *découpage* 15 modules / 50 cartes (§12.2).

**Reste à cadrer au fil de l'eau (non bloquant pour la tranche verticale)** :
1. **Rythme d'écriture du contenu** : ordre et lot des cartes après la tranche C1→C5 (C6→C11 puis C12→… ?).
2. **Bibliothèque de scénarios** : jeux de données seed à mutualiser entre cartes (bibliothèque, magasin, école…) pour limiter la charge de rédaction.
3. **Durcissement prod** : activer Nginx + TLS devant l'app même sur le réseau privé, ou rester en clair sur ce réseau ?
